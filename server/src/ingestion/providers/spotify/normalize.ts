// Raw Spotify payloads → canonical types (ARCHITECTURE.md §4.1).
// Pure functions: no I/O, no persistence.

import type {
  CanonicalPlaybackState,
  CanonicalPlayEvent,
} from "../../types";

export type SpotifyRecentlyPlayedResponse = {
  items: Array<{
    track: {
      id: string;
      name: string;
      artists: Array<{ id: string; name: string }>;
      album: {
        id: string;
        name: string;
        images: Array<{ url: string }>;
      };
      duration_ms: number;
    };
    played_at: string;
  }>;
  cursors?: { after?: string; before?: string } | null;
};

export type SpotifyPlaybackResponse = {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album: { images: Array<{ url: string }> };
  } | null;
};

export const normalizePlayHistory = (
  response: SpotifyRecentlyPlayedResponse
): CanonicalPlayEvent[] => {
  return response.items.map((item) => {
    const track = item.track;
    const primaryArtist = track.artists[0];

    return {
      provider: "spotify" as const,
      providerTrackId: track.id,
      trackName: track.name,
      artistId: primaryArtist?.id ?? "",
      artistName: primaryArtist?.name ?? "",
      albumId: track.album.id,
      albumName: track.album.name,
      albumImage: track.album.images?.[0]?.url ?? null,
      playedAt: new Date(item.played_at),
      durationMs: track.duration_ms ?? null,
    };
  });
};

export const normalizePlayback = (
  response: SpotifyPlaybackResponse | null | undefined
): CanonicalPlaybackState | null => {
  if (!response?.item) {
    return null;
  }

  return {
    provider: "spotify",
    isPlaying: response.is_playing,
    trackName: response.item.name,
    artistName: response.item.artists?.[0]?.name ?? "",
    albumImage: response.item.album.images?.[0]?.url ?? null,
    progressMs: response.progress_ms,
    durationMs: response.item.duration_ms ?? null,
    fetchedAt: new Date(),
  };
};
