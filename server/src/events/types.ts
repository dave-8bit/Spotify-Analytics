// Single source of truth for every domain event payload (ARCHITECTURE.md §4.8).
// Domain events use dot-notation; socket events (colon-notation) are a separate,
// Gateway-owned projection added in M4.
//
// This module must stay dependency-free: payload shapes are declared structurally
// here rather than imported from Prisma or other layers, so that every service can
// depend on the bus without the bus depending on anything.

// Mirror of a persisted PlayEvent row — the payload of `playEvent.created`.
export type PlayEventPayload = {
  id: number;
  userId: number;
  provider: string;
  trackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  albumImage: string | null;
  playedAt: Date;
  durationMs: number | null;
};

// Mirror of CanonicalPlaybackState — the payload of `playback.updated` (M5).
// Ephemeral by design (§3.2): never persisted, only polled for users with an
// open socket. `state: null` means nothing is playing.
export type PlaybackStatePayload = {
  provider: string;
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumImage: string | null;
  progressMs: number | null;
  durationMs: number | null;
  fetchedAt: Date;
};

// Mirror of StatsSnapshot aggregates — the payload of `stats.updated` (M6).
// Published by the Analytics Engine after each snapshot recompute (§4.3).
export type StatsPayload = {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
};

// Events not yet published/subscribed anywhere (insight.*) are added at their
// owning milestone (M7) — additive only.
export type DomainEventMap = {
  "sync.requested": { userId: number; reason: string };
  "sync.started": { userId: number };
  "sync.completed": { userId: number; newEvents: number };
  "sync.failed": { userId: number; error: string };
  "sync.disabled": { userId: number; provider: string; reason: string };
  "playEvent.created": { userId: number; event: PlayEventPayload };
  "playback.updated": { userId: number; state: PlaybackStatePayload | null };
  "stats.updated": { userId: number; stats: StatsPayload };
};

export type DomainEventName = keyof DomainEventMap;

export type DomainEventHandler<K extends DomainEventName> = (
  payload: DomainEventMap[K]
) => void | Promise<void>;
