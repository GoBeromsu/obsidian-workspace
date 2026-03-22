import type { MusicTrack, PlaylistNote } from './music';

export interface PlaylistViewModel {
  library: MusicTrack[];
  playlists: PlaylistNote[];
  selectedPlaylistPath: string | null;
  selectedPlaylist: PlaylistNote | null;
  counts: {
    tracks: number;
    playlists: number;
  };
}

export interface PlaylistViewHost {
  getViewModel(): Promise<PlaylistViewModel>;
  refreshLibrary(): Promise<PlaylistViewModel>;
  selectPlaylist(path: string | null): Promise<PlaylistViewModel>;
  savePlaylistOrder(playlistPath: string, trackPaths: string[]): Promise<PlaylistViewModel>;
  addTrackToPlaylist(playlistPath: string, trackPath: string): Promise<PlaylistViewModel>;
  removeTrackFromPlaylist(playlistPath: string, trackPath: string): Promise<PlaylistViewModel>;
  createPlaylist(name: string, seedTrackPaths?: string[]): Promise<PlaylistViewModel>;
  revealTrack(path: string): Promise<void>;
  revealPlaylist(path: string): Promise<void>;
  onDidChange(callback: () => void): () => void;
}
