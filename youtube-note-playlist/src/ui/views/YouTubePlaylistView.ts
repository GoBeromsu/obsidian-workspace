import {
	App,
	ItemView,
	Menu,
	Modal,
	Notice,
	Setting,
	TextComponent,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type {
	PlaylistSummary,
	PlaylistTrack,
	PlaylistViewHost,
	PlaylistViewState,
} from '../playlist-view-model';

export const VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST = 'youtube-note-playlist-view';

interface ViewElements {
	root: HTMLElement;
	toolbarPanel: HTMLElement;
	heroPanel: HTMLElement;
	playerPanel: HTMLElement;
	playerVideo: HTMLElement;
	queuePanel: HTMLElement;
}

export class YouTubePlaylistView extends ItemView {
	private readonly host: PlaylistViewHost;
	private elements: ViewElements | null = null;
	private unsubscribe: (() => void) | null = null;
	private playerSurface: YouTubePlayerSurface | null = null;
	private dragFromIndex: number | null = null;
	private actionInFlight = false;

	constructor(leaf: WorkspaceLeaf, host: PlaylistViewHost) {
		super(leaf);
		this.host = host;
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST;
	}

	getDisplayText(): string {
		return 'YouTube Playlist';
	}

	getIcon(): string {
		return 'list-video';
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass('ynp-view-root');

		const toolbarPanel = root.createDiv({ cls: 'ynp-pane-section ynp-toolbar-panel' });
		const heroPanel = root.createDiv({ cls: 'ynp-pane-section ynp-hero-panel' });
		const playerPanel = root.createDiv({ cls: 'ynp-pane-section ynp-player-panel' });
		const playerVideo = document.createElement('div');
		playerVideo.className = 'ynp-player-video';
		const queuePanel = root.createDiv({ cls: 'ynp-pane-section ynp-queue-panel' });

		this.elements = {
			root,
			toolbarPanel,
			heroPanel,
			playerPanel,
			playerVideo,
			queuePanel,
		};

		this.playerSurface = new YouTubePlayerSurface(playerVideo, async () => {
			await this.runAction('Queued next track', () => this.host.playNext());
		});

		this.unsubscribe = this.host.subscribe(() => {
			this.render();
		});

		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.playerSurface?.destroy();
		this.playerSurface = null;
		this.elements = null;
	}

	private render(): void {
		const elements = this.elements;
		if (!elements) return;

		const state = this.host.getState();
		this.renderToolbar(state);
		this.renderHero(state);
		this.renderPlayer(state);
		this.renderQueue(state);
	}

	private renderToolbar(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		elements.toolbarPanel.empty();

		const selectedPlaylist = this.getSelectedPlaylist(state);
		const bar = elements.toolbarPanel.createDiv({ cls: 'ynp-toolbar-bar' });
		const copy = bar.createDiv({ cls: 'ynp-toolbar-copy' });
		copy.createDiv({ cls: 'ynp-toolbar-label', text: 'YouTube Playlist' });
		copy.createDiv({
			cls: 'ynp-toolbar-description',
			text: selectedPlaylist?.description ?? 'Select a playlist and keep the track list in focus.',
		});

		const controls = bar.createDiv({ cls: 'ynp-toolbar-controls' });
		const select = controls.createEl('select', { cls: 'dropdown ynp-toolbar-select' });
		select.createEl('option', { value: '', text: 'Select a playlist' });
		for (const playlist of state.playlists) {
			select.createEl('option', { value: playlist.path, text: playlist.title });
		}
		select.value = state.selectedPlaylistPath ?? '';
		select.addEventListener('change', () => {
			const value = select.value;
			void this.runAction(
				value ? `Loaded ${this.lookupPlaylistTitle(state.playlists, value)}` : 'Cleared playlist',
				() => this.host.selectPlaylist(value || null),
			);
		});

		controls.appendChild(this.createIconButton('Create playlist', 'plus', () => {
			this.openCreatePlaylistModal();
		}));

		if (this.host.selectActivePlaylist) {
			controls.appendChild(this.createIconButton('Load active playlist note', 'crosshair', () => {
				void this.runAction('Loaded active playlist', () => this.host.selectActivePlaylist?.() ?? Promise.resolve());
			}));
		}

		controls.appendChild(this.createIconButton('Refresh library', 'refresh-cw', () => {
			void this.runAction('Refreshed library', () => this.host.refresh());
		}));
	}

	private renderHero(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		elements.heroPanel.empty();

		const selectedPlaylist = this.getSelectedPlaylist(state);
		if (state.isLoading) {
			this.renderEmptyState(elements.heroPanel, 'Loading playlist', 'Scanning playlists and music notes from the vault.');
			return;
		}

		if (state.errorMessage) {
			this.renderEmptyState(elements.heroPanel, 'Playlist error', state.errorMessage);
			return;
		}

		if (!selectedPlaylist) {
			this.renderEmptyState(elements.heroPanel, 'Choose a playlist', 'Select a playlist note to see its cover, metadata, and ordered tracks.');
			return;
		}

		const coverImage = selectedPlaylist.coverImage ?? state.queue[0]?.thumbnailUrl ?? state.currentTrack?.thumbnailUrl ?? '';
		const hero = elements.heroPanel.createDiv({ cls: 'ynp-playlist-hero' });
		const cover = hero.createDiv({ cls: 'ynp-hero-cover' });
		if (coverImage) {
			cover.style.backgroundImage = `url("${coverImage}")`;
		} else {
			const icon = cover.createDiv({ cls: 'ynp-empty-icon' });
			setIcon(icon, 'music-4');
		}

		const copy = hero.createDiv({ cls: 'ynp-hero-copy' });
		copy.createDiv({ cls: 'ynp-hero-kicker', text: 'Playlist' });
		copy.createEl('h2', { cls: 'ynp-hero-title', text: selectedPlaylist.title });
		copy.createDiv({
			cls: 'ynp-hero-meta',
			text: `${selectedPlaylist.trackCount} tracks • ${state.library.length} music notes`,
		});

		if (selectedPlaylist.description) {
			copy.createDiv({ cls: 'ynp-hero-description', text: selectedPlaylist.description });
		}

		const actions = copy.createDiv({ cls: 'ynp-hero-actions' });
		actions.appendChild(this.createTextButton('Play all', 'play', () => {
			const firstTrack = state.queue[0];
			if (!firstTrack) return;
			void this.runAction(`Playing ${firstTrack.title}`, () => this.host.playTrack(firstTrack.path));
		}, true));

		actions.appendChild(this.createTextButton('Open note', 'file-text', () => {
			void this.runAction('', () => this.host.openPlaylist(selectedPlaylist.path), false);
		}));

		actions.appendChild(this.createMenuButton('Playlist actions', 'more-vertical', (event) => {
			this.openPlaylistMenu(event, selectedPlaylist);
		}));
	}

	private renderPlayer(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		elements.playerPanel.empty();

		const current = state.currentTrack;
		if (!current) {
			elements.playerPanel.style.display = 'none';
			this.playerSurface?.clear();
			return;
		}

		elements.playerPanel.style.display = '';
		const playerRail = elements.playerPanel.createDiv({ cls: 'ynp-now-playing-shell' });
		const summary = playerRail.createDiv({ cls: 'ynp-now-playing-summary' });
		const trackCard = summary.createDiv({ cls: 'ynp-track-card ynp-track-card--compact ynp-player-track-card' });
		const thumb = trackCard.createDiv({ cls: 'ynp-track-thumb' });
		thumb.style.backgroundImage = `url("${current.thumbnailUrl}")`;

		const meta = trackCard.createDiv({ cls: 'ynp-track-meta' });
		meta.createDiv({ cls: 'ynp-now-playing-kicker', text: 'Now playing' });
		meta.createDiv({ cls: 'ynp-track-title', text: current.title });
		meta.createDiv({
			cls: 'ynp-track-subtitle',
			text: `${current.artist || 'Unknown artist'} • ${state.autoplayEnabled ? 'Autoplay on' : 'Autoplay off'}`,
		});
		meta.createDiv({ cls: 'ynp-track-path', text: current.path });

		const controls = summary.createDiv({ cls: 'ynp-control-row ynp-player-controls' });
		controls.appendChild(this.createTextButton('Previous', 'skip-back', () => {
			void this.runAction('Moved to previous track', () => this.host.playPrevious());
		}));
		controls.appendChild(this.createTextButton('Play', 'play', () => {
			void this.runAction(`Playing ${current.title}`, () => this.host.playTrack(current.path));
		}, true));
		controls.appendChild(this.createTextButton('Next', 'skip-forward', () => {
			void this.runAction('Moved to next track', () => this.host.playNext());
		}));
		controls.appendChild(this.createTextButton('Open note', 'file-text', () => {
			void this.runAction('', () => this.host.openNote(current.path), false);
		}));
		controls.appendChild(this.createTextButton(
			state.autoplayEnabled ? 'Autoplay on' : 'Autoplay off',
			state.autoplayEnabled ? 'radio' : 'circle',
			() => {
				void this.toggleAutoplay(state.autoplayEnabled);
			},
		));

		const videoShell = playerRail.createDiv({
			cls: 'ynp-player-video-shell is-collapsed',
		});
		videoShell.appendChild(elements.playerVideo);
		void this.playerSurface?.render(current, state.autoplayEnabled);
	}

	private renderQueue(state: PlaylistViewState): void {
		const elements = this.elements;
		if (!elements) return;

		elements.queuePanel.empty();

		const header = elements.queuePanel.createDiv({ cls: 'ynp-section-header' });
		header.createDiv({ cls: 'ynp-section-title', text: 'Tracks' });
		const selectedPlaylist = this.getSelectedPlaylist(state);
		header.createDiv({
			cls: 'ynp-section-meta',
			text: selectedPlaylist ? `${state.queue.length} queued • Drag to reorder` : 'Select a playlist first',
		});

		if (state.isLoading) {
			this.renderEmptyState(elements.queuePanel, 'Loading playlist', 'Reading playlist note references.');
			return;
		}

		if (!selectedPlaylist) {
			this.renderEmptyState(elements.queuePanel, 'Choose a playlist', 'The playlist rows appear here once you select a playlist.');
			return;
		}

		if (state.queue.length === 0) {
			this.renderEmptyState(elements.queuePanel, 'Playlist is empty', 'Use Music.base or the active-note action to add music notes to this playlist.');
			return;
		}

		const list = elements.queuePanel.createDiv({ cls: 'ynp-list ynp-queue-list' });
		state.queue.forEach((track, index) => {
			const row = list.createDiv({
				cls: this.buildRowClass('ynp-track-row', {
					'is-current': state.currentTrack?.path === track.path,
					'is-dragging': this.dragFromIndex === index,
				}),
				attr: { draggable: 'true' },
			});

			row.addEventListener('dragstart', (event) => {
				this.dragFromIndex = index;
				row.addClass('is-dragging');
				event.dataTransfer?.setData('text/plain', String(index));
				event.dataTransfer?.setDragImage(row, 24, 24);
			});
			row.addEventListener('dragover', (event) => {
				event.preventDefault();
				row.addClass('is-drop-target');
			});
			row.addEventListener('dragleave', () => {
				row.removeClass('is-drop-target');
			});
			row.addEventListener('dragend', () => {
				this.dragFromIndex = null;
				row.removeClass('is-dragging');
				row.removeClass('is-drop-target');
			});
			row.addEventListener('drop', (event) => {
				event.preventDefault();
				row.removeClass('is-drop-target');
				const rawIndex = event.dataTransfer?.getData('text/plain');
				const fromIndex = rawIndex ? Number(rawIndex) : this.dragFromIndex;
				if (fromIndex === null || Number.isNaN(fromIndex) || fromIndex === index) {
					return;
				}
				void this.runAction('Saved new queue order', () => this.host.moveTrackInPlaylist(fromIndex, index));
			});

			const grip = row.createDiv({ cls: 'ynp-row-grip' });
			setIcon(grip, 'grip-vertical');
			grip.createSpan({ cls: 'ynp-row-order', text: String(index + 1).padStart(2, '0') });

			const thumb = row.createDiv({ cls: 'ynp-row-thumb' });
			thumb.style.backgroundImage = `url("${track.thumbnailUrl}")`;
			thumb.addEventListener('click', () => {
				void this.runAction(`Playing ${track.title}`, () => this.host.playTrack(track.path));
			});

			const body = row.createDiv({ cls: 'ynp-row-copy' });
			const title = body.createDiv({ cls: 'ynp-row-title', text: track.title });
			title.setAttribute('title', track.path);
			body.createDiv({
				cls: 'ynp-row-subtitle',
				text: track.artist || 'Unknown artist',
			});
			body.addEventListener('click', () => {
				void this.runAction(`Playing ${track.title}`, () => this.host.playTrack(track.path));
			});

			const rowActions = row.createDiv({ cls: 'ynp-row-actions' });
			if (state.currentTrack?.path === track.path) {
				rowActions.createDiv({ cls: 'ynp-row-state', text: 'Playing' });
			}
			rowActions.appendChild(this.createMenuButton('Track actions', 'more-vertical', (event) => {
				this.openTrackMenu(event, track);
			}));
		});
	}

	private openPlaylistMenu(event: MouseEvent, selectedPlaylist: PlaylistSummary): void {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle('Open playlist note')
				.setIcon('file-text')
				.onClick(() => {
					void this.runAction('', () => this.host.openPlaylist(selectedPlaylist.path), false);
				}),
		);

		if (this.host.selectActivePlaylist) {
			menu.addItem((item) =>
				item
					.setTitle('Load active playlist note')
					.setIcon('crosshair')
					.onClick(() => {
						void this.runAction('Loaded active playlist', () => this.host.selectActivePlaylist?.() ?? Promise.resolve());
					}),
			);
		}

		if (this.host.addActiveNoteToPlaylist) {
			menu.addItem((item) =>
				item
					.setTitle('Add active note')
					.setIcon('plus')
					.onClick(() => {
						void this.runAction('Added active note to playlist', () => this.host.addActiveNoteToPlaylist?.() ?? Promise.resolve());
					}),
			);
		}

		if (this.host.openBase) {
			menu.addItem((item) =>
				item
					.setTitle('Open Music.base')
					.setIcon('table-2')
					.onClick(() => {
						void this.runAction('', () => this.host.openBase?.('music') ?? Promise.resolve(), false);
					}),
			);
			menu.addItem((item) =>
				item
					.setTitle('Open Playlists.base')
					.setIcon('files')
					.onClick(() => {
						void this.runAction('', () => this.host.openBase?.('playlists') ?? Promise.resolve(), false);
					}),
			);
		}

		if (this.host.refreshCompanionBases) {
			menu.addItem((item) =>
				item
					.setTitle('Refresh companion Bases files')
					.setIcon('layout-grid')
					.onClick(() => {
						void this.runAction('Refreshed companion Bases files', () => this.host.refreshCompanionBases?.() ?? Promise.resolve());
					}),
			);
		}

		menu.addItem((item) =>
			item
				.setTitle('Refresh library')
				.setIcon('refresh-cw')
				.onClick(() => {
					void this.runAction('Refreshed library', () => this.host.refresh());
				}),
		);

		menu.showAtMouseEvent(event);
	}

	private openTrackMenu(event: MouseEvent, track: PlaylistTrack): void {
		const menu = new Menu();

		menu.addItem((item) =>
			item
				.setTitle('Play track')
				.setIcon('play')
				.onClick(() => {
					void this.runAction(`Playing ${track.title}`, () => this.host.playTrack(track.path));
				}),
		);

		menu.addItem((item) =>
			item
				.setTitle('Open note')
				.setIcon('file-text')
				.onClick(() => {
					void this.runAction('', () => this.host.openNote(track.path), false);
				}),
		);

		menu.addItem((item) =>
			item
				.setTitle('Remove from playlist')
				.setIcon('minus-circle')
				.onClick(() => {
					void this.runAction(`Removed ${track.title}`, () => this.host.removeTrackFromPlaylist(track.path));
				}),
		);

		menu.showAtMouseEvent(event);
	}

	private getSelectedPlaylist(state: PlaylistViewState): PlaylistSummary | undefined {
		return state.playlists.find((playlist) => playlist.path === state.selectedPlaylistPath);
	}

	private lookupPlaylistTitle(playlists: PlaylistSummary[], path: string): string {
		return playlists.find((playlist) => playlist.path === path)?.title ?? 'playlist';
	}

	private renderEmptyState(container: HTMLElement, title: string, copy: string): void {
		const state = container.createDiv({ cls: 'ynp-empty-state' });
		const icon = state.createDiv({ cls: 'ynp-empty-icon' });
		setIcon(icon, 'music-4');
		state.createDiv({ cls: 'ynp-empty-title', text: title });
		state.createDiv({ cls: 'ynp-empty-copy', text: copy });
	}

	private createTextButton(
		label: string,
		icon: string,
		onClick: () => void,
		cta = false,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = this.buildRowClass('ynp-button', { 'mod-cta': cta });
		const iconEl = button.createSpan({ cls: 'ynp-button-icon' });
		setIcon(iconEl, icon);
		button.createSpan({ cls: 'ynp-button-label', text: label });
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	private createIconButton(
		label: string,
		icon: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'clickable-icon ynp-icon-button';
		button.setAttribute('aria-label', label);
		button.setAttribute('title', label);
		setIcon(button, icon);
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	private createMenuButton(
		label: string,
		icon: string,
		onClick: (event: MouseEvent) => void,
	): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'clickable-icon ynp-icon-button';
		button.setAttribute('aria-label', label);
		setIcon(button, icon);
		button.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			onClick(event);
		});
		return button;
	}

	private buildRowClass(base: string, flags: Record<string, boolean>): string {
		return [base, ...Object.entries(flags).filter(([, enabled]) => enabled).map(([name]) => name)].join(' ');
	}

	private async toggleAutoplay(currentValue: boolean): Promise<void> {
		if (this.host.setAutoplayEnabled) {
			await this.runAction(
				currentValue ? 'Autoplay disabled' : 'Autoplay enabled',
				() => this.host.setAutoplayEnabled?.(!currentValue) ?? Promise.resolve(),
			);
			return;
		}

		if (this.host.toggleAutoplay) {
			await this.runAction(
				currentValue ? 'Autoplay disabled' : 'Autoplay enabled',
				() => this.host.toggleAutoplay?.() ?? Promise.resolve(),
			);
		}
	}

	private openCreatePlaylistModal(): void {
		new PlaylistNameModal(this.app, (name) => {
			void this.runAction(`Created ${name}`, () => this.host.createPlaylist(name));
		}).open();
	}

	private async runAction(
		successMessage: string,
		action: () => Promise<void>,
		showSuccess = true,
	): Promise<void> {
		if (this.actionInFlight) return;
		this.actionInFlight = true;

		try {
			await action();
			if (showSuccess && successMessage) {
				new Notice(successMessage, 1800);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(message);
		} finally {
			this.actionInFlight = false;
			this.render();
		}
	}
}

class PlaylistNameModal extends Modal {
	private input: TextComponent | null = null;

	constructor(
		app: App,
		private readonly onSubmit: (value: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Create playlist' });
		contentEl.createEl('p', {
			text: 'This creates a note-backed playlist note in your configured playlist folder.',
		});

		new Setting(contentEl)
			.setName('Playlist name')
			.addText((text) => {
				this.input = text;
				text.setPlaceholder('Late-night queue');
				window.setTimeout(() => text.inputEl.focus(), 0);
			});

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText('Create')
					.setCta()
					.onClick(() => {
						const value = this.input?.getValue().trim() ?? '';
						if (!value) {
							new Notice('Playlist name is required.');
							return;
						}
						this.close();
						this.onSubmit(value);
					}),
			)
			.addButton((button) =>
				button
					.setButtonText('Cancel')
					.onClick(() => this.close()),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

class YouTubePlayerSurface {
	private currentVideoId: string | null = null;
	private currentAutoplay = false;
	private host: HTMLElement;
	private fallbackFrame: HTMLIFrameElement | null = null;
	private player: YouTubePlayerInstance | null = null;
	private playerRoot: HTMLElement | null = null;

	constructor(
		host: HTMLElement,
		private readonly onEnded: () => Promise<void>,
	) {
		this.host = host;
	}

	async render(track: PlaylistTrack, autoplayEnabled: boolean): Promise<void> {
		if (this.currentVideoId === track.videoId && this.player && this.currentAutoplay === autoplayEnabled) {
			return;
		}

		try {
			const api = await loadYouTubeApi();
			this.mountPlayerRoot();

			if (!this.player) {
				this.player = new api.Player(this.playerRoot as HTMLElement, {
					videoId: track.videoId,
					playerVars: {
						autoplay: autoplayEnabled ? 1 : 0,
						modestbranding: 1,
						playsinline: 1,
						rel: 0,
					},
					events: {
						onStateChange: (event: { data: number }) => {
							if (event.data === api.PlayerState.ENDED) {
								void this.onEnded();
							}
						},
					},
				});
			} else {
				this.player.loadVideoById(track.videoId);
			}

			this.currentVideoId = track.videoId;
			this.currentAutoplay = autoplayEnabled;
			this.clearFallback();
		} catch {
			this.renderFallback(track, autoplayEnabled);
		}
	}

	clear(): void {
		this.currentVideoId = null;
		this.currentAutoplay = false;
		this.player?.destroy();
		this.player = null;
		this.clearFallback();
		this.playerRoot?.remove();
		this.playerRoot = null;
	}

	destroy(): void {
		this.clearFallback();
		this.player?.destroy();
		this.player = null;
		this.playerRoot?.remove();
		this.playerRoot = null;
	}

	private mountPlayerRoot(): void {
		if (this.playerRoot) return;
		this.host.empty();
		this.playerRoot = this.host.createDiv({ cls: 'ynp-iframe-api-host' });
	}

	private renderFallback(track: PlaylistTrack, autoplayEnabled: boolean): void {
		this.host.empty();
		this.player?.destroy();
		this.player = null;
		this.playerRoot = null;

		const frame = document.createElement('iframe');
		frame.className = 'ynp-video-frame';
		frame.allow =
			'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
		frame.referrerPolicy = 'strict-origin-when-cross-origin';
		frame.allowFullscreen = true;
		frame.src = `${track.embedUrl}${track.embedUrl.includes('?') ? '&' : '?'}autoplay=${autoplayEnabled ? 1 : 0}&rel=0`;
		this.host.appendChild(frame);
		this.fallbackFrame = frame;
		this.currentVideoId = track.videoId;
		this.currentAutoplay = autoplayEnabled;
	}

	private clearFallback(): void {
		this.fallbackFrame?.remove();
		this.fallbackFrame = null;
	}
}

interface YouTubeApiNamespace {
	Player: new (
		element: HTMLElement,
		config: {
			videoId: string;
			playerVars: Record<string, string | number>;
			events: {
				onStateChange: (event: { data: number }) => void;
			};
		},
	) => YouTubePlayerInstance;
	PlayerState: {
		ENDED: number;
	};
}

interface YouTubePlayerInstance {
	destroy(): void;
	loadVideoById(videoId: string): void;
	stopVideo(): void;
}

declare global {
	interface Window {
		YT?: YouTubeApiNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

let youtubeApiPromise: Promise<YouTubeApiNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeApiNamespace> {
	if (window.YT?.Player) {
		return Promise.resolve(window.YT);
	}

	if (youtubeApiPromise) {
		return youtubeApiPromise;
	}

	youtubeApiPromise = new Promise<YouTubeApiNamespace>((resolve, reject) => {
		const existing = document.querySelector('script[data-ynp-youtube-api="true"]');
		const waitForReady = (remainingAttempts: number) => {
			if (window.YT?.Player) {
				resolve(window.YT);
				return;
			}

			if (remainingAttempts <= 0) {
				reject(new Error('YouTube player API did not initialize.'));
				return;
			}

			window.setTimeout(() => waitForReady(remainingAttempts - 1), 250);
		};

		window.onYouTubeIframeAPIReady = () => waitForReady(20);

		if (existing) {
			waitForReady(20);
			return;
		}

		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.async = true;
		script.dataset.ynpYoutubeApi = 'true';
		script.onerror = () => reject(new Error('Failed to load the YouTube player API.'));
		document.head.appendChild(script);
	});

	return youtubeApiPromise;
}
