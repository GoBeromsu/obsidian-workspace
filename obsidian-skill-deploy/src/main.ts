import { Plugin } from 'obsidian';
import type { SkillDeploySettings } from './types/settings';
import type { ProviderConfig } from './types/provider';
import { PluginLogger } from './shared/plugin-logger';
import { PluginNotices, type NoticeCatalog } from './shared/plugin-notices';
import { TransformerRegistry } from './domain/transformer-registry';
import { ClaudeTransformer } from './domain/claude-transformer';
import { CodexTransformer } from './domain/codex-transformer';
import { GeminiTransformer } from './domain/gemini-transformer';
import { CursorTransformer } from './domain/cursor-transformer';
import { GitHubApiClient } from './ui/github-api';
import { GitHubAuth } from './ui/github-auth';
import { FileSystemTokenStore } from './ui/token-store';
import { VaultAdapter } from './ui/vault-adapter';
import { DeployCommand } from './ui/deploy-command';
import { SkillDeploySettingTab, DEFAULT_PROVIDERS } from './ui/settings-tab';

const NOTICE_CATALOG: NoticeCatalog = {
	auth_required: { template: 'Please login with GitHub first.', timeout: 5000, immutable: true },
	auth_success: { template: 'GitHub authentication successful!', timeout: 3000 },
	no_skills_found: { template: 'No skills found in the configured skills root path.', timeout: 5000 },
	no_providers_enabled: { template: 'No providers enabled. Enable at least one in settings.', timeout: 5000 },
	deploy_success: { template: '{{skill}} deployed to {{count}}/{{total}} providers', timeout: 5000 },
	deploy_partial: { template: '{{skill}} deployed to {{count}}/{{total}} providers. Failed: {{failed}}', timeout: 8000 },
	deploy_failed: { template: 'Deploy failed for {{skill}}: {{errors}}', timeout: 10000 },
};

const DEFAULT_SETTINGS: SkillDeploySettings = {
	skillsRootPath: '',
	providers: [...DEFAULT_PROVIDERS],
	githubAppClientId: '',
	deployStates: {},
};

export default class SkillDeployPlugin extends Plugin {
	settings!: SkillDeploySettings;
	private logger!: PluginLogger;
	private notices!: PluginNotices;
	private auth!: GitHubAuth;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.logger = new PluginLogger('SkillDeploy');
		this.notices = new PluginNotices(
			this as unknown as { settings: Record<string, unknown>; saveSettings(): Promise<void> },
			NOTICE_CATALOG,
			'SkillDeploy',
		);

		const tokenStore = new FileSystemTokenStore(this.logger);
		this.auth = new GitHubAuth(tokenStore, this.logger);
		const githubApi = new GitHubApiClient(this.logger);
		const vaultAdapter = new VaultAdapter(this.app);

		const registry = new TransformerRegistry();
		registry.register(new ClaudeTransformer());
		registry.register(new CodexTransformer());
		registry.register(new GeminiTransformer());
		registry.register(new CursorTransformer());

		const deployCommand = new DeployCommand(
			this.app,
			this.settings,
			this.logger,
			this.notices,
			registry,
			githubApi,
			this.auth,
			vaultAdapter,
			() => this.saveSettings(),
		);

		this.addCommand({
			id: 'deploy-skill',
			name: 'Deploy skill',
			callback: () => {
				void deployCommand.execute();
			},
		});

		this.addSettingTab(new SkillDeploySettingTab(
			this.app, this, this.auth, this.logger, this.notices,
		));

		this.logger.info('Skill Deploy plugin loaded');
	}

	onunload(): void {
		this.auth?.stopServer();
		this.notices?.unload();
	}

	async loadSettings(): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- loadData() returns unknown-shaped JSON
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure providers array is populated
		if (!this.settings.providers || this.settings.providers.length === 0) {
			this.settings.providers = [...DEFAULT_PROVIDERS] as ProviderConfig[];
		}
		if (!this.settings.deployStates) {
			this.settings.deployStates = {};
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
