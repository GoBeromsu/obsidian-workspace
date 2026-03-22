export interface YoutubePlaylistPropertyMapping {
  musicUrlProperties: string[];
  musicThumbnailProperties: string[];
  musicArtistProperties: string[];
  playlistTrackProperty: string;
  playlistDescriptionProperty: string;
  playlistCoverProperty: string;
}

export interface YoutubeNotePlaylistSettings extends YoutubePlaylistPropertyMapping {
  autoOpenOnStartup: boolean;
  playlistFolder: string;
  lastPlaylistPath: string | null;
  autoplayEnabled: boolean;
  debug: boolean;
  plugin_notices?: { muted: Record<string, boolean> };
}
