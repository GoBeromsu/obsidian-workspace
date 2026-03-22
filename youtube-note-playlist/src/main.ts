import { normalizePath, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { buildCompanionBaseFiles, MUSIC_BASE_NAME, PLAYLISTS_BASE_NAME } from './domain/base-files';
import { DEFAULT_PROPERTY_MAPPING, DEFAULT_SETTINGS, normalizePropertyList, normalizePropertyName } from './domain/config';
import { buildMusicLibrary } from './domain/library-index';
import { NOTICE_CATALOG } from './domain/notices';
import { createPlaylistNoteContent, updatePlaylistNoteContent } from './domain/playlist-storage';
import { PluginLogger } from './shared/plugin-logger';
import { PluginNotices, type PluginNoticesHost } from './shared/plugin-notices';
import type { MusicLibrarySnapshot, PlaylistNote } from './types/music';
import type { MarkdownNoteSnapshot } from './types/notes';
import type { YoutubeNotePlaylistSettings } from './types/settings';
import type { PlaylistTrack, PlaylistSummary, PlaylistViewHost, PlaylistViewState } from './ui/playlist-view-model';
import { canonicalizeNotePath } from './utils/wikilink';
import { YoutubeNotePlaylistSettingsTab } from './ui/settings';
import { VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST, YouTubePlaylistView } from './ui/views/YouTubePlaylistView';

const EMPTY_LIBRARY: MusicLibrarySnapshot = {
  tracks: [],
  playlists: [],
};

export default class YoutubeNotePlaylistPlugin extends Plugin implements PlaylistViewHost {
  settings: YoutubeNotePlaylistSettings = DEFAULT_SETTINGS;

  readonly logger = new PluginLogger('YouTube Note Playlist', () => this.settings.debug);
  readonly notices = new PluginNotices(
    this as unknown as PluginNoticesHost,
    NOTICE_CATALOG,
    'YouTube Note Playlist',
  );

  private library: MusicLibrarySnapshot = EMPTY_LIBRARY;
  private changeListeners = new Set<() => void>();
  private refreshTimeout: number | null = null;
  private currentTrackPath: string | null = null;
  private isLoading = false;
  private errorMessage: string | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    await this.refreshIndex();

    this.registerView(
      VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST,
      (leaf: WorkspaceLeaf) => new YouTubePlaylistView(leaf, this),
    );

    this.addRibbonIcon('play-square', 'Open YouTube Note Playlist', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-youtube-note-playlist',
      name: 'Open YouTube Note Playlist',
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: 'refresh-youtube-note-library',
      name: 'Refresh YouTube note library',
      callback: () => {
        void this.refresh(true);
      },
    });

    this.addCommand({
      id: 'refresh-youtube-playlist-bases',
      name: 'Create or refresh companion Bases files',
      callback: () => {
        void this.refreshCompanionBases();
      },
    });

    this.addCommand({
      id: 'add-active-note-to-selected-playlist',
      name: 'Add active note to selected playlist',
      callback: () => {
        void this.addActiveNoteToSelectedPlaylist();
      },
    });

    this.addCommand({
      id: 'load-active-playlist-note',
      name: 'Load active playlist note into player',
      callback: () => {
        void this.activateActivePlaylist();
      },
    });

    this.addSettingTab(new YoutubeNotePlaylistSettingsTab(this.app, this));
    this.registerVaultRefreshEvents();

    if (this.settings.autoOpenOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
  }

  onunload(): void {
    this.notices.unload();

    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  async loadSettings(): Promise<void> {
    const loaded = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as YoutubeNotePlaylistSettings;
    this.settings = {
      ...loaded,
      musicUrlProperties: normalizePropertyList(
        loaded.musicUrlProperties ?? [],
        DEFAULT_PROPERTY_MAPPING.musicUrlProperties,
      ),
      musicThumbnailProperties: normalizePropertyList(
        loaded.musicThumbnailProperties ?? [],
        DEFAULT_PROPERTY_MAPPING.musicThumbnailProperties,
      ),
      musicArtistProperties: normalizePropertyList(
        loaded.musicArtistProperties ?? [],
        DEFAULT_PROPERTY_MAPPING.musicArtistProperties,
      ),
      playlistTrackProperty: normalizePropertyName(
        loaded.playlistTrackProperty ?? '',
        DEFAULT_PROPERTY_MAPPING.playlistTrackProperty,
      ),
      playlistDescriptionProperty: normalizePropertyName(
        loaded.playlistDescriptionProperty ?? '',
        DEFAULT_PROPERTY_MAPPING.playlistDescriptionProperty,
      ),
      playlistCoverProperty: normalizePropertyName(
        loaded.playlistCoverProperty ?? '',
        DEFAULT_PROPERTY_MAPPING.playlistCoverProperty,
      ),
    };
  }

  async saveSettings(): Promise<void> {
    this.settings.musicUrlProperties = normalizePropertyList(
      this.settings.musicUrlProperties,
      DEFAULT_PROPERTY_MAPPING.musicUrlProperties,
    );
    this.settings.musicThumbnailProperties = normalizePropertyList(
      this.settings.musicThumbnailProperties,
      DEFAULT_PROPERTY_MAPPING.musicThumbnailProperties,
    );
    this.settings.musicArtistProperties = normalizePropertyList(
      this.settings.musicArtistProperties,
      DEFAULT_PROPERTY_MAPPING.musicArtistProperties,
    );
    this.settings.playlistTrackProperty = normalizePropertyName(
      this.settings.playlistTrackProperty,
      DEFAULT_PROPERTY_MAPPING.playlistTrackProperty,
    );
    this.settings.playlistDescriptionProperty = normalizePropertyName(
      this.settings.playlistDescriptionProperty,
      DEFAULT_PROPERTY_MAPPING.playlistDescriptionProperty,
    );
    this.settings.playlistCoverProperty = normalizePropertyName(
      this.settings.playlistCoverProperty,
      DEFAULT_PROPERTY_MAPPING.playlistCoverProperty,
    );
    await this.saveData(this.settings);
  }

  getState(): PlaylistViewState {
    const selectedPlaylistPath = this.resolveSelectedPlaylistPath();
    const selectedPlaylist =
      this.library.playlists.find((playlist) => playlist.path === selectedPlaylistPath) ?? null;
    const queue = selectedPlaylist?.tracks.map((track) => this.toPlaylistTrack(track)) ?? [];
    const currentTrack = this.resolveCurrentTrack(queue);

    return {
      isLoading: this.isLoading,
      errorMessage: this.errorMessage,
      playlists: this.library.playlists.map((playlist) => this.toPlaylistSummary(playlist)),
      selectedPlaylistPath,
      queue,
      library: this.library.tracks.map((track) => this.toPlaylistTrack(track)),
      currentTrack,
      autoplayEnabled: this.settings.autoplayEnabled,
    };
  }

  subscribe(callback: () => void): () => void {
    this.changeListeners.add(callback);
    return () => {
      this.changeListeners.delete(callback);
    };
  }

  async refresh(showNotice = false): Promise<void> {
    await this.refreshIndex();

    if (showNotice) {
      this.notices.show('library_refreshed', {
        trackCount: this.library.tracks.length,
        playlistCount: this.library.playlists.length,
      });
    }
  }

  async refreshCompanionBases(): Promise<void> {
    await this.writeCompanionBaseFiles(true);
  }

  async selectPlaylist(path: string | null): Promise<void> {
    this.settings.lastPlaylistPath = path;
    await this.saveSettings();
    this.currentTrackPath = null;
    this.notifyChange();
  }

  async selectActivePlaylist(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.notices.show('active_note_not_playlist');
      return;
    }

    const playlist = this.library.playlists.find((entry) => entry.path === activeFile.path);
    if (!playlist) {
      this.notices.show('active_note_not_playlist');
      return;
    }

    await this.selectPlaylist(playlist.path);
    this.notices.show('playlist_loaded', { name: playlist.title });
  }

  async createPlaylist(name: string): Promise<void> {
    await this.createPlaylistNote(name);
  }

  async playTrack(path: string): Promise<void> {
    const track = this.library.tracks.find((entry) => entry.path === path);
    if (!track) {
      throw new Error(`Track not found: ${path}`);
    }

    this.currentTrackPath = path;
    this.notifyChange();
  }

  async playPrevious(): Promise<void> {
    const queue = this.currentQueue();
    if (queue.length === 0) return;

    if (!this.currentTrackPath) {
      this.currentTrackPath = queue[0].path;
      this.notifyChange();
      return;
    }

    const currentIndex = queue.findIndex((track) => track.path === this.currentTrackPath);
    if (currentIndex <= 0) return;
    this.currentTrackPath = queue[currentIndex - 1].path;
    this.notifyChange();
  }

  async playNext(): Promise<void> {
    const queue = this.currentQueue();
    if (queue.length === 0) return;

    if (!this.currentTrackPath) {
      this.currentTrackPath = queue[0].path;
      this.notifyChange();
      return;
    }

    const currentIndex = queue.findIndex((track) => track.path === this.currentTrackPath);
    if (currentIndex < 0 || currentIndex >= queue.length - 1) return;
    this.currentTrackPath = queue[currentIndex + 1].path;
    this.notifyChange();
  }

  async addTrackToPlaylist(trackPath: string): Promise<void> {
    const playlistPath = this.resolveSelectedPlaylistPath();
    if (!playlistPath) {
      this.notices.show('playlist_missing');
      return;
    }

    await this.addTrackToSpecificPlaylist(playlistPath, trackPath);
    if (!this.currentTrackPath) {
      this.currentTrackPath = trackPath;
      this.notifyChange();
    }
  }

  async addActiveNoteToPlaylist(): Promise<void> {
    await this.addActiveNoteToSelectedPlaylist();
  }

  async removeTrackFromPlaylist(trackPath: string): Promise<void> {
    const playlistPath = this.resolveSelectedPlaylistPath();
    if (!playlistPath) {
      this.notices.show('playlist_missing');
      return;
    }

    await this.removeTrackFromSpecificPlaylist(playlistPath, trackPath);
    if (this.currentTrackPath === trackPath) {
      this.currentTrackPath = this.currentQueue()[0]?.path ?? null;
      this.notifyChange();
    }
  }

  async moveTrackInPlaylist(fromIndex: number, toIndex: number): Promise<void> {
    const playlist = this.selectedPlaylist();
    if (!playlist || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.trackPaths.length || toIndex >= playlist.trackPaths.length) {
      return;
    }

    const nextTrackPaths = [...playlist.trackPaths];
    const [moved] = nextTrackPaths.splice(fromIndex, 1);
    nextTrackPaths.splice(toIndex, 0, moved);
    await this.writePlaylist(playlist.path, nextTrackPaths);
  }

  async openNote(path: string): Promise<void> {
    await this.revealTrack(path);
  }

  async openPlaylist(path: string): Promise<void> {
    await this.revealPlaylist(path);
  }

  async openBase(kind: 'music' | 'playlists'): Promise<void> {
    await this.openCompanionBase(kind === 'music' ? MUSIC_BASE_NAME : PLAYLISTS_BASE_NAME);
  }

  async toggleAutoplay(): Promise<void> {
    await this.setAutoplayEnabled(!this.settings.autoplayEnabled);
  }

  async setAutoplayEnabled(enabled: boolean): Promise<void> {
    this.settings.autoplayEnabled = enabled;
    await this.saveSettings();
    this.notifyChange();
  }

  private async addTrackToSpecificPlaylist(playlistPath: string, trackPath: string): Promise<void> {
    const playlist = this.getPlaylistOrThrow(playlistPath);
    const nextTrackPaths = dedupe([...playlist.trackPaths, trackPath]);
    await this.writePlaylist(playlistPath, nextTrackPaths);

    const track = this.library.tracks.find((entry) => entry.path === trackPath);
    this.notices.show('track_added', {
      title: track?.title ?? trackPath,
      playlist: playlist.title,
    });
  }

  private async removeTrackFromSpecificPlaylist(playlistPath: string, trackPath: string): Promise<void> {
    const playlist = this.getPlaylistOrThrow(playlistPath);
    const nextTrackPaths = playlist.trackPaths.filter((entry) => entry !== trackPath);
    await this.writePlaylist(playlistPath, nextTrackPaths);

    const track = this.library.tracks.find((entry) => entry.path === trackPath);
    this.notices.show('track_removed', {
      title: track?.title ?? trackPath,
      playlist: playlist.title,
    });
  }

  private async createPlaylistNote(name: string, seedTrackPaths: string[] = []): Promise<void> {
    const filePath = await this.getAvailablePlaylistPath(name);
    await this.ensureFolder(this.settings.playlistFolder);
    await this.app.vault.create(
      filePath,
      createPlaylistNoteContent({ trackPaths: seedTrackPaths }, this.settings),
    );

    this.settings.lastPlaylistPath = filePath;
    await this.saveSettings();
    await this.refreshIndex();

    this.notices.show('playlist_created', { name });
  }

  async revealTrack(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf('tab').openFile(file);
    }
  }

  async revealPlaylist(path: string): Promise<void> {
    await this.revealTrack(path);
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_YOUTUBE_NOTE_PLAYLIST, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private registerVaultRefreshEvents(): void {
    this.registerEvent(
      this.app.metadataCache.on('changed', () => {
        this.scheduleRefresh();
      }),
    );

    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        this.scheduleRefresh();
      }),
    );

    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.scheduleRefresh();
      }),
    );

    this.registerEvent(
      this.app.vault.on('delete', () => {
        this.scheduleRefresh();
      }),
    );

    this.registerEvent(
      this.app.vault.on('create', () => {
        this.scheduleRefresh();
      }),
    );
  }

  private scheduleRefresh(): void {
    if (this.refreshTimeout !== null) {
      window.clearTimeout(this.refreshTimeout);
    }

    this.refreshTimeout = window.setTimeout(() => {
      this.refreshTimeout = null;
      void this.refreshIndex();
    }, 250);
  }

  private async refreshIndex(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.notifyChange();

    try {
      this.library = buildMusicLibrary(this.collectNoteSnapshots(), this.settings);

      const selected = this.resolveSelectedPlaylistPath();
      if (selected !== this.settings.lastPlaylistPath) {
        this.settings.lastPlaylistPath = selected;
        await this.saveSettings();
      }

      if (this.currentTrackPath && !this.library.tracks.some((track) => track.path === this.currentTrackPath)) {
        this.currentTrackPath = null;
      }

    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to refresh library', error);
    } finally {
      this.isLoading = false;
      this.notifyChange();
    }
  }

  private collectNoteSnapshots(): MarkdownNoteSnapshot[] {
    return this.app.vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      basename: file.basename,
      frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter,
    }));
  }

  private resolveSelectedPlaylistPath(): string | null {
    const configured = this.settings.lastPlaylistPath;
    if (configured && this.library.playlists.some((playlist) => playlist.path === configured)) {
      return configured;
    }

    return this.library.playlists[0]?.path ?? null;
  }

  private getPlaylistOrThrow(playlistPath: string): PlaylistNote {
    const playlist = this.library.playlists.find((entry) => entry.path === playlistPath);
    if (!playlist) {
      throw new Error(`Playlist not found: ${playlistPath}`);
    }
    return playlist;
  }

  private async writePlaylist(playlistPath: string, trackPaths: string[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(playlistPath);
    if (!(file instanceof TFile)) {
      throw new Error(`Playlist file not found: ${playlistPath}`);
    }

    const existing = await this.app.vault.read(file);
    const playlist = this.getPlaylistOrThrow(playlistPath);
    const nextContent = updatePlaylistNoteContent(existing, {
      trackPaths: trackPaths.map((trackPath) => canonicalizeNotePath(trackPath)),
      coverUrl: playlist.coverUrl || undefined,
      description: playlist.description || undefined,
    }, this.settings);

    await this.app.vault.modify(file, nextContent);
    await this.refreshIndex();

    this.notices.show('playlist_saved', { name: playlist.title });
  }

  private async activateActivePlaylist(): Promise<void> {
    await this.selectActivePlaylist();
    await this.activateView();
  }

  private async writeCompanionBaseFiles(showNotice: boolean): Promise<void> {
    const baseFiles = buildCompanionBaseFiles(this.settings.playlistFolder, this.settings);

    for (const baseFile of baseFiles) {
      const filePath = normalizePath(baseFile.path);
      const existing = this.app.vault.getAbstractFileByPath(filePath);

      if (existing instanceof TFile) {
        await this.app.vault.modify(existing, baseFile.content);
        continue;
      }

      if (existing) {
        throw new Error(`Unable to write base file at ${filePath}`);
      }

      const parentFolder = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
      await this.ensureFolder(parentFolder);
      await this.app.vault.create(filePath, baseFile.content);
    }

    if (showNotice) {
      const firstFile = baseFiles[0]?.path ?? '';
      const folder = firstFile.includes('/') ? firstFile.slice(0, firstFile.lastIndexOf('/')) : '/';
      this.notices.show('bases_refreshed', {
        count: baseFiles.length,
        folder: folder || '/',
      });
    }
  }

  private async addActiveNoteToSelectedPlaylist(): Promise<void> {
    const playlistPath = this.resolveSelectedPlaylistPath();
    if (!playlistPath) {
      this.notices.show('playlist_missing');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.notices.show('active_note_not_music');
      return;
    }

    const track = this.library.tracks.find((entry) => entry.path === activeFile.path);
    if (!track) {
      this.notices.show('active_note_not_music');
      return;
    }

    await this.addTrackToSpecificPlaylist(playlistPath, track.path);
  }

  private async openCompanionBase(fileName: string): Promise<void> {
    const filePath = normalizePath(this.getCompanionBasePath(fileName));
    let file = this.app.vault.getAbstractFileByPath(filePath);

    if (!(file instanceof TFile)) {
      await this.writeCompanionBaseFiles(false);
      file = this.app.vault.getAbstractFileByPath(filePath);
    }

    if (!(file instanceof TFile)) {
      throw new Error(`Base file not found: ${filePath}`);
    }

    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  private selectedPlaylist(): PlaylistNote | null {
    const selectedPlaylistPath = this.resolveSelectedPlaylistPath();
    return this.library.playlists.find((playlist) => playlist.path === selectedPlaylistPath) ?? null;
  }

  private currentQueue(): PlaylistTrack[] {
    return this.selectedPlaylist()?.tracks.map((track) => this.toPlaylistTrack(track)) ?? [];
  }

  private getCompanionBasePath(fileName: string): string {
    const match = buildCompanionBaseFiles(this.settings.playlistFolder, this.settings).find((file) =>
      file.path === fileName || file.path.endsWith(`/${fileName}`),
    );

    return match?.path ?? fileName;
  }

  private resolveCurrentTrack(queue: PlaylistTrack[]): PlaylistTrack | null {
    if (!this.currentTrackPath) {
      return null;
    }

    const queuedTrack = queue.find((track) => track.path === this.currentTrackPath);
    if (queuedTrack) {
      return queuedTrack;
    }

    const libraryTrack = this.library.tracks.find((track) => track.path === this.currentTrackPath);
    if (libraryTrack) {
      return this.toPlaylistTrack(libraryTrack);
    }

    return null;
  }

  private toPlaylistSummary(playlist: PlaylistNote): PlaylistSummary {
    return {
      path: playlist.path,
      title: playlist.title,
      trackCount: playlist.trackPaths.length,
      description: playlist.description || undefined,
      coverImage: playlist.coverUrl || undefined,
    };
  }

  private toPlaylistTrack(track: MusicLibrarySnapshot['tracks'][number]): PlaylistTrack {
    return {
      path: track.path,
      title: track.title,
      artist: track.artist,
      sourceUrl: track.sourceUrl,
      videoId: track.videoId,
      embedUrl: track.embedUrl,
      thumbnailUrl: track.thumbnailUrl,
      tags: track.tags,
    };
  }

  private async getAvailablePlaylistPath(name: string): Promise<string> {
    const baseName = sanitizeFileName(name);
    let attempt = normalizePath(`${this.settings.playlistFolder}/${baseName}.md`);
    let index = 2;

    while (this.app.vault.getAbstractFileByPath(attempt)) {
      attempt = normalizePath(`${this.settings.playlistFolder}/${baseName} ${index}.md`);
      index += 1;
    }

    return attempt;
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }

    const segments = folderPath.split('/').filter(Boolean);
    let current = '';

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!this.app.vault.getAbstractFileByPath(current)) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }
}

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'New Playlist';
  }

  return trimmed.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}
