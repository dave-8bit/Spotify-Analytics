// Canonical ingestion types + the MusicProviderAdapter seam (ARCHITECTURE.md §4.1).
// Everything downstream of ingestion/ operates on these provider-agnostic shapes.

export type ProviderKind = "spotify"; // | "apple_music" | "lastfm" | … (future)

// The account context an adapter needs to call its provider. Mirrors the
// ProviderAccount row; declared structurally so ingestion types stay portable.
export type ProviderAccountRecord = {
  id: number;
  userId: number;
  provider: string;
  providerUserId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string | null;
  historyCursor: string | null;
};

export type ProviderCredentials = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
};

// Normalized play event: provider payload → canonical shape (§4.1).
export type CanonicalPlayEvent = {
  provider: ProviderKind;
  providerTrackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  albumImage: string | null;
  playedAt: Date;
  durationMs: number | null;
};

export type CanonicalPlaybackState = {
  provider: ProviderKind;
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumImage: string | null;
  progressMs: number | null;
  durationMs: number | null;
  fetchedAt: Date;
};

export type TopItemKind = "tracks" | "artists";
export type TopItemRange = "short_term" | "medium_term" | "long_term";

export type CanonicalTopItem = {
  provider: ProviderKind;
  kind: TopItemKind;
  rank: number;
  raw: unknown; // provider payload passed through for now; normalized further in M6
};

export type PlayHistoryPage = {
  events: CanonicalPlayEvent[];
  nextCursor: string | null;
};

// The seam for multi-provider support. Adapters fetch and translate — they own
// nothing about scheduling, persistence decisions, or analytics.
export interface MusicProviderAdapter {
  readonly provider: ProviderKind;
  fetchPlayHistory(
    account: ProviderAccountRecord,
    cursor?: string | null
  ): Promise<PlayHistoryPage>;
  fetchCurrentPlayback(
    account: ProviderAccountRecord
  ): Promise<CanonicalPlaybackState | null>;
  fetchTopItems(
    account: ProviderAccountRecord,
    kind: TopItemKind,
    range: TopItemRange
  ): Promise<CanonicalTopItem[]>;
  refreshCredentials(
    account: ProviderAccountRecord
  ): Promise<ProviderCredentials>;
}
