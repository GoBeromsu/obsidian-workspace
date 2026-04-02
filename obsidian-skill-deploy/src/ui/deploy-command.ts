import type { App } from 'obsidian';
import type { SkillManifest } from '../types/skill';
import type { ProviderConfig, DeployResult } from '../types/provider';
import type { SkillDeploySettings, DeployStateEntry } from '../types/settings';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';
import type { TransformerRegistry } from '../domain/transformer-registry';
import type { GitHubApiClient } from './github-api';
import type { GitHubAuth } from './github-auth';
import type { VaultAdapter } from './vault-adapter';
import { DeployConflictError } from './github-api';
import { discoverSkills } from '../domain/skill-discovery';
import { hasConflict, isFirstDeploy } from '../domain/deploy-state';
import { serializeFrontmatter } from '../domain/frontmatter-parser';
import { SkillPickerModal } from './skill-picker-modal';

export class DeployCommand {
	constructor(
		private readonly app: App,
		private readonly settings: SkillDeploySettings,
		private readonly logger: PluginLogger,
		private readonly notices: PluginNotices,
		private readonly registry: TransformerRegistry,
		private readonly githubApi: GitHubApiClient,
		private readonly auth: GitHubAuth,
		private readonly vaultAdapter: VaultAdapter,
		private readonly saveSettings: () => Promise<void>,
	) {}

	async execute(): Promise<void> {
		const token = await this.auth.getToken();
		if (!token) {
			this.notices.show('auth_required');
			return;
		}

		const folders = await this.vaultAdapter.listSkillFolders(this.settings.skillsRootPath);
		const skills = discoverSkills(folders);

		if (skills.length === 0) {
			this.notices.show('no_skills_found');
			return;
		}

		new SkillPickerModal(this.app, skills)
			.onSelect((skill) => {
				void this.deploySkill(skill, token);
			})
			.open();
	}

	private async deploySkill(skill: SkillManifest, token: string): Promise<void> {
		const enabledProviders = this.settings.providers.filter(p => p.enabled);
		if (enabledProviders.length === 0) {
			this.notices.show('no_providers_enabled');
			return;
		}

		const results: DeployResult[] = [];

		for (const provider of enabledProviders) {
			const result = await this.deployToProvider(skill, provider, token);
			results.push(result);
		}

		const succeeded = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success);

		if (failed.length === 0) {
			this.notices.show('deploy_success', {
				skill: skill.name,
				count: succeeded,
				total: enabledProviders.length,
			});
		} else if (succeeded > 0) {
			this.notices.show('deploy_partial', {
				skill: skill.name,
				count: succeeded,
				total: enabledProviders.length,
				failed: failed.map(f => f.providerId).join(', '),
			});
		} else {
			this.notices.show('deploy_failed', {
				skill: skill.name,
				errors: failed.map(f => `${f.providerId}: ${f.error ?? 'unknown'}`).join('; '),
			});
		}
	}

	private async deployToProvider(skill: SkillManifest, provider: ProviderConfig, token: string): Promise<DeployResult> {
		try {
			const transformer = this.registry.get(provider.id);
			if (!transformer) {
				return { providerId: provider.id, success: false, error: `No transformer for ${provider.id}` };
			}

			// Transform frontmatter
			const transformResult = transformer.transform(skill.frontmatter);
			const validationResult = transformer.validate(transformResult);
			if (!validationResult.isValid) {
				this.logger.warn('Transform validation failed', { provider: provider.id, errors: validationResult.errors });
				return { providerId: provider.id, success: false, error: `Validation: ${validationResult.errors.join(', ')}` };
			}

			// Parse repo URL
			const [owner, repo] = provider.repoUrl.split('/');
			if (!owner || !repo) {
				return { providerId: provider.id, success: false, error: `Invalid repo URL: ${provider.repoUrl}` };
			}

			// Conflict detection
			const stateKey = `${skill.id}:${provider.id}`;
			const existingState = this.settings.deployStates[stateKey];

			if (existingState && !isFirstDeploy(existingState.lastDeployTreeSha)) {
				const skillDeployPath = `${provider.deployPath}/${skill.id}`.replace(/\/+/g, '/');
				const remoteTreeSha = await this.githubApi.getTreeShaForPath(owner, repo, skillDeployPath, provider.branch, token);

				if (remoteTreeSha && hasConflict(remoteTreeSha, existingState.lastDeployTreeSha)) {
					this.logger.info('Conflict detected', { skill: skill.id, provider: provider.id, remote: remoteTreeSha, stored: existingState.lastDeployTreeSha });
					return { providerId: provider.id, success: false, error: `Conflict: ${skill.name} was modified on ${provider.name} since last deploy` };
				}
			}

			// Build file list for commit
			const deployBasePath = `${provider.deployPath}/${skill.id}`.replace(/\/+/g, '/');
			const transformedSkillMd = serializeFrontmatter(transformResult.frontmatter, skill.bodyContent);

			const files = [
				{ path: `${deployBasePath}/SKILL.md`, content: transformedSkillMd },
				...skill.files
					.filter(f => f.relativePath !== 'SKILL.md')
					.map(f => ({ path: `${deployBasePath}/${f.relativePath}`, content: f.content })),
			];

			// Atomic commit
			const commitResult = await this.githubApi.createAtomicCommit(
				owner, repo, provider.branch, files,
				`deploy: ${skill.name} via skill-deploy`,
				token,
			);

			// Update deploy state ONLY after successful ref-update
			const newState: DeployStateEntry = {
				lastDeployTreeSha: commitResult.treeSha,
				lastDeployedAt: new Date().toISOString(),
				commitSha: commitResult.commitSha,
			};
			this.settings.deployStates[stateKey] = newState;
			await this.saveSettings();

			this.logger.info('Deploy success', { skill: skill.id, provider: provider.id, commit: commitResult.commitSha });
			return { providerId: provider.id, success: true, commitSha: commitResult.commitSha };

		} catch (err) {
			if (err instanceof DeployConflictError) {
				this.logger.warn('Deploy conflict during ref-update', { skill: skill.id, provider: provider.id, orphaned: err.orphanedCommitSha });
				return { providerId: provider.id, success: false, error: 'Conflict: branch was updated during deploy. Please retry.' };
			}
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`Deploy to ${provider.id} failed`, err);
			return { providerId: provider.id, success: false, error: message };
		}
	}
}
