import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_PROPERTY_MAPPING } from '../domain/config';
import type { YoutubeNotePlaylistSettings } from '../types/settings';

interface SettingsHost extends Plugin {
	settings: YoutubeNotePlaylistSettings;
	saveSettings(): Promise<void>;
	refresh(showNotice?: boolean): Promise<void>;
	refreshCompanionBases(): Promise<void>;
}

export class YoutubeNotePlaylistSettingsTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: SettingsHost) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'YouTube Note Playlist' });

		new Setting(containerEl)
			.setName('Playlist folder')
			.setDesc('New playlist notes are created in this vault folder.')
			.addText((text) => {
				text
					.setPlaceholder('90. System/Playlists')
					.setValue(this.plugin.settings.playlistFolder)
					.onChange(async (value) => {
						this.plugin.settings.playlistFolder = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
				text.inputEl.style.width = '100%';
			});

		containerEl.createEl('h3', { text: 'Music Note Mapping' });

		new Setting(containerEl)
			.setName('URL properties')
			.setDesc('Comma-separated priority order for the YouTube URL property.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.musicUrlProperties.join(', '))
					.setValue(this.plugin.settings.musicUrlProperties.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.musicUrlProperties = parsePropertyList(value);
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Thumbnail properties')
			.setDesc('Comma-separated priority order for music-note artwork lookup.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.musicThumbnailProperties.join(', '))
					.setValue(this.plugin.settings.musicThumbnailProperties.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.musicThumbnailProperties = parsePropertyList(value);
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Artist properties')
			.setDesc('Comma-separated priority order for artist or author metadata.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.musicArtistProperties.join(', '))
					.setValue(this.plugin.settings.musicArtistProperties.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.musicArtistProperties = parsePropertyList(value);
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
				text.inputEl.style.width = '100%';
			});

		containerEl.createEl('h3', { text: 'Playlist Note Schema' });

		new Setting(containerEl)
			.setName('Track list property')
			.setDesc('Frontmatter key that stores the ordered track refs for each playlist note.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.playlistTrackProperty)
					.setValue(this.plugin.settings.playlistTrackProperty)
					.onChange(async (value) => {
						this.plugin.settings.playlistTrackProperty = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
			});

		new Setting(containerEl)
			.setName('Description property')
			.setDesc('Frontmatter key used for playlist description text.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.playlistDescriptionProperty)
					.setValue(this.plugin.settings.playlistDescriptionProperty)
					.onChange(async (value) => {
						this.plugin.settings.playlistDescriptionProperty = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
			});

		new Setting(containerEl)
			.setName('Cover property')
			.setDesc('Frontmatter key used for playlist cover artwork.')
			.addText((text) => {
				text
					.setPlaceholder(DEFAULT_PROPERTY_MAPPING.playlistCoverProperty)
					.setValue(this.plugin.settings.playlistCoverProperty)
					.onChange(async (value) => {
						this.plugin.settings.playlistCoverProperty = value.trim();
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					});
			});

		containerEl.createEl('h3', { text: 'Companion Bases' });
		containerEl.createEl('p', {
			text: 'The plugin can generate Music.base and Playlists.base beside your playlist folder. For music-note mapping lists, the first property becomes the Bases column.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Refresh companion Bases files')
			.setDesc('Rewrite the companion Bases files to match the current mapping.')
			.addButton((button) =>
				button
					.setButtonText('Refresh Bases')
					.onClick(async () => {
						await this.plugin.refreshCompanionBases();
					}),
			);

		new Setting(containerEl)
			.setName('Autoplay next track')
			.setDesc('Advance to the next queued track when the player reports the current track ended.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoplayEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoplayEnabled = value;
						await this.plugin.saveSettings();
						await this.plugin.refresh();
					}),
			);

		new Setting(containerEl)
			.setName('Open on startup')
			.setDesc('Open the playlist view automatically when Obsidian finishes loading.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoOpenOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.autoOpenOnStartup = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Debug logging')
			.setDesc('Emit verbose console logs for indexing and playback state.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

function parsePropertyList(value: string): string[] {
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}
