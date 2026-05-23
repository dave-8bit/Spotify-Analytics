export type TimeRange = "short_term" | "medium_term" | "long_term";

export type User = {
  id: number;
  spotifyId: string;
  displayName: string | null;
  email: string | null;
  imageUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
};

export type Track = {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: { id: string; name: string; images: Array<{ url: string }> };
  duration_ms: number;
  popularity: number;
};

export type Artist = {
  id: string;
  name: string;
  images: Array<{ url: string }>;
  genres: string[];
  popularity: number;
};

export type Album = {
  albumId: string;
  albumName: string;
  albumImage: string | null;
  _count: { albumId: number };
};

export type RecentTrack = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  albumImage: string | null;
  playedAt: string;
  durationMs: number | null;
};

export type Stats = {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
};

export type DbTrack = {
  trackId: string;
  trackName: string;
  artistName: string;
  albumImage: string | null;
  _count: { trackId: number };
};

export type DbArtist = {
  artistId: string;
  artistName: string;
  _count: { artistId: number };
};


