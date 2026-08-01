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

// Insight kinds (M7, ARCHITECTURE.md §6.2): classifies the narrative type.
// v1 ships "weekly_recap" (daily job + on-demand); "trend" / "discovery" are
// future extension points.
export type InsightKind = "weekly_recap" | "trend" | "discovery";

// Mirror of a persisted Insight row — the payload of `insight.generated` (M7).
// Declared structurally so the bus stays dependency-free. `content` is the
// JSON body the provider returned (title + summary + highlights).
export type InsightPayload = {
  id: number;
  userId: number;
  kind: string;
  content: Record<string, unknown>;
  model: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
};

export type DomainEventMap = {
  "sync.requested": { userId: number; reason: string };
  "sync.started": { userId: number };
  "sync.completed": { userId: number; newEvents: number };
  "sync.failed": { userId: number; error: string };
  "sync.disabled": { userId: number; provider: string; reason: string };
  "playEvent.created": { userId: number; event: PlayEventPayload };
  "playback.updated": { userId: number; state: PlaybackStatePayload | null };
  "stats.updated": { userId: number; stats: StatsPayload };
  // M7 (§4.8): insight.requested is published by REST/Workers and consumed by
  // the Insights Engine; insight.generated is published by the Insights Engine
  // and projected to clients by the Gateway.
  "insight.requested": { userId: number; kind: InsightKind; reason: string };
  "insight.generated": { userId: number; insight: InsightPayload };
};

export type DomainEventName = keyof DomainEventMap;

export type DomainEventHandler<K extends DomainEventName> = (
  payload: DomainEventMap[K]
) => void | Promise<void>;
