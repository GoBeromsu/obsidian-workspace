/* eslint-disable obsidianmd/ui/sentence-case -- settings contain proper nouns (GitHub App, Client ID) and example paths */
import { App, PluginSettingTab, Setting } from 'obsidian';
import type { SkillDeploySettings } from '../types/settings';
import type { ProviderConfig } from '../types/provider';
import type { GitHubAuth } from './github-auth';
import type { PluginLogger } from '../shared/plugin-logger';
import type { PluginNotices } from '../shared/plugin-notices';

interface SettingsHost {
	settings: SkillDeploySettings;
	saveSettings(): Promise<void>;
}

const DEFAULT_PROVIDERS: ProviderConfig[] = [
	{ id: 'claude-code', name: 'Claude Code', enabled: true, repoUrl: '', deployPath: 'skills', branch: 'main' },
	{ id: 'codex', name: 'Codex / OpenAI', enabled: false, repoUrl: '', deployPath: 'skills', branch: 'main' },
	{ id: 'gemini', name: 'Gemini CLI', enabled: false, repoUrl: '', deployPath: 'skills', branch: 'main' },
	{ id: 'cursor', name: 'Cursor', enabled: false, repoUrl: '', deployPath: 'skills', branch: 'main' },
];

export class SkillDeploySettingTab extends PluginSettingTab {
	private readonly host: SettingsHost;
	private readonly auth: GitHubAuth;
	private readonly logger: PluginLogger;
	private readonly notices: PluginNotices;

	constructor(app: App, host: SettingsHost, auth: GitHubAuth, logger: PluginLogger, notices: PluginNotices) {
		super(app, host as never);
		this.host = host;
		this.auth = auth;
		this.logger = logger;
		this.notices = notices;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderGitHubAppSetup(containerEl);
		this.renderAuthentication(containerEl);
		this.renderSkillsSource(containerEl);
		this.renderProviders(containerEl);
	}

	private renderGitHubAppSetup(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('GitHub app setup').setHeading();

		new Setting(containerEl)
			.setName('Setup instructions')
			.setDesc('Create a GitHub App for authentication. One-time setup.')
			.addButton(btn => btn
				.setButtonText('Open GitHub app setup')
				.onClick(() => {
					const params = new URLSearchParams({
						name: `skill-deploy-${Date.now()}`,
						url: 'https://github.com/GoBeromsu/obsidian-skill-deploy',
						callback_url: 'http://localhost:27549/auth/callback',
						public: 'false',
						webhooks: 'false',
					});
					window.open(`https://github.com/settings/apps/new?${params.toString()}`);
				}));

		new Setting(containerEl)
			.setName('Client ID')
			.setDesc('Paste the Client ID from your GitHub App')
			.addText(text => text
				.setPlaceholder('Iv1.abc123...')
				.setValue(this.host.settings.githubAppClientId)
				.onChange(async (value) => {
					this.host.settings.githubAppClientId = value.trim();
					await this.host.saveSettings();
				}));
	}

	private renderAuthentication(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Authentication').setHeading();

		const authSetting = new Setting(containerEl)
			.setName('GitHub account');

		void this.auth.getUsername().then(username => {
			if (username) {
				authSetting.setDesc(`Logged in as ${username}`);
				authSetting.addButton(btn => btn
					.setButtonText('Logout')
					.setWarning()
					.onClick(async () => {
						await this.auth.logout();
						this.display();
					}));
			} else {
				authSetting.setDesc('Not authenticated');
				authSetting.addButton(btn => btn
					.setButtonText('Login with GitHub')
					.setCta()
					.setDisabled(!this.host.settings.githubAppClientId)
					.onClick(async () => {
						try {
							await this.auth.startAuthFlow(this.host.settings.githubAppClientId);
							this.notices.show('auth_success');
							this.display();
						} catch (err) {
							this.logger.noticeError('OAuth failed', err);
						}
					}));
			}
		});
	}

	private renderSkillsSource(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Skills source').setHeading();

		new Setting(containerEl)
			.setName('Skills root path')
			.setDesc('Vault folder containing skill subfolders (each with SKILL.md)')
			.addText(text => text
				.setPlaceholder('tools/')
				.setValue(this.host.settings.skillsRootPath)
				.onChange(async (value) => {
					this.host.settings.skillsRootPath = value.trim();
					await this.host.saveSettings();
				}));
	}

	private renderProviders(containerEl: HTMLElement): void {
		new Setting(containerEl).setName('Providers').setHeading();

		if (this.host.settings.providers.length === 0) {
			this.host.settings.providers = [...DEFAULT_PROVIDERS];
		}

		for (const provider of this.host.settings.providers) {
			this.renderProviderSection(containerEl, provider);
		}
	}

	private renderProviderSection(containerEl: HTMLElement, provider: ProviderConfig): void {
		new Setting(containerEl).setName(provider.name).setHeading();

		const idx = this.host.settings.providers.findIndex(p => p.id === provider.id);

		new Setting(containerEl)
			.setName('Enabled')
			.addToggle(toggle => toggle
				.setValue(provider.enabled)
				.onChange(async (value) => {
					this.updateProvider(idx, { enabled: value });
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Repository')
			.setDesc('Format: owner/repo')
			.addText(text => text
				.setPlaceholder('user/my-skills')
				.setValue(provider.repoUrl)
				.onChange(async (value) => {
					this.updateProvider(idx, { repoUrl: value.trim() });
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Deploy path')
			.setDesc('Path within repository for skills')
			.addText(text => text
				.setPlaceholder('skills/')
				.setValue(provider.deployPath)
				.onChange(async (value) => {
					this.updateProvider(idx, { deployPath: value.trim() });
					await this.host.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Branch')
			.addText(text => text
				.setPlaceholder('main')
				.setValue(provider.branch)
				.onChange(async (value) => {
					this.updateProvider(idx, { branch: value.trim() || 'main' });
					await this.host.saveSettings();
				}));
	}

	private updateProvider(idx: number, updates: Partial<ProviderConfig>): void {
		const current = this.host.settings.providers[idx];
		if (!current) return;
		this.host.settings.providers[idx] = { ...current, ...updates } as ProviderConfig;
	}
}

export { DEFAULT_PROVIDERS };
