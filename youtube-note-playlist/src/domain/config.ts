import type { YoutubeNotePlaylistSettings, YoutubePlaylistPropertyMapping } from '../types/settings';

export const DEFAULT_PROPERTY_MAPPING: YoutubePlaylistPropertyMapping = {
  musicUrlProperties: ['source', 'youtube', 'youtube_url', 'url'],
  musicThumbnailProperties: ['image', 'thumbnail', 'cover'],
  musicArtistProperties: ['author', 'artist'],
  playlistTrackProperty: 'tracks',
  playlistDescriptionProperty: 'description',
  playlistCoverProperty: 'cover',
};

export const DEFAULT_SETTINGS: YoutubeNotePlaylistSettings = {
  ...DEFAULT_PROPERTY_MAPPING,
  autoOpenOnStartup: false,
  playlistFolder: '90. System/Playlists',
  lastPlaylistPath: null,
  autoplayEnabled: true,
  debug: false,
};

export function normalizePropertyList(values: string[], fallback: string[]): string[] {
  const normalized = values
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length > 0 ? dedupe(normalized) : [...fallback];
}

export function normalizePropertyName(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(value);
  }

  return deduped;
}
