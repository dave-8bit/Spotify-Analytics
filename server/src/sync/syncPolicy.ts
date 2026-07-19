// Sync policy: backoff, failure thresholds, and cursor rules (ARCHITECTURE.md
// §4.2, §5). The pollHistory job (M3) selects targets exclusively through the
// predicates here — jobs contain no business logic (§8.2).

// Consecutive failures after which an account's sync is disabled.
export const MAX_CONSECUTIVE_SYNC_FAILURES = 5;

export const shouldDisableSync = (syncFailCount: number): boolean =>
  syncFailCount >= MAX_CONSECUTIVE_SYNC_FAILURES;

// Spotify's history endpoint returns at most 50 plays; on the first sync there
// is no cursor and we take whatever the provider gives us.
export const isInitialSync = (historyCursor: string | null): boolean =>
  historyCursor === null;

// ── Poller scheduling policy (M3, ARCHITECTURE.md §8.1–8.2) ─────────────────

// Per-account backoff: each consecutive failure doubles the effective polling
// interval, capped. At MAX_CONSECUTIVE_SYNC_FAILURES the account is disabled
// outright (recordFailure), so the cap is only a safety bound.
const BACKOFF_BASE = 2;
const MAX_BACKOFF_MULTIPLIER = 16;

export const getBackoffMultiplier = (syncFailCount: number): number =>
  Math.min(BACKOFF_BASE ** Math.max(syncFailCount, 0), MAX_BACKOFF_MULTIPLIER);

// Persisted backoff state is syncFailCount; lastSyncedAt only advances on
// success. To space out *failing* attempts we also track the last attempt time
// in memory. v1 runs a single worker instance (§11.2), so process-local state
// is sufficient; a restart merely allows one immediate retry, which is
// harmless (idempotent upserts, §8.2).
const lastAttemptAtMs = new Map<number, number>();

export const noteSyncAttempt = (accountId: number): void => {
  lastAttemptAtMs.set(accountId, Date.now());
};

// The poller ticks once a minute; without tolerance an account synced seconds
// after its slot tick would miss the next window's tick and wait a full extra
// window.
const POLL_TICK_MS = 60_000;

export type SyncSchedulingInfo = {
  id: number;
  userId: number;
  lastSyncedAt: Date | null;
  syncFailCount: number;
};

// Due-for-sync rule: enough time has passed since the last success *or*
// attempt, where "enough" is the base polling interval scaled by the
// failure backoff multiplier. Never-synced accounts are due immediately.
export const isDueForSync = (
  account: SyncSchedulingInfo,
  baseIntervalMs: number,
  now: Date = new Date()
): boolean => {
  const reference = Math.max(
    account.lastSyncedAt?.getTime() ?? 0,
    lastAttemptAtMs.get(account.id) ?? 0
  );
  if (reference === 0) {
    return true;
  }
  const effectiveIntervalMs =
    baseIntervalMs * getBackoffMultiplier(account.syncFailCount);
  return now.getTime() - reference >= effectiveIntervalMs - POLL_TICK_MS;
};

// Stagger, don't stampede (§8.2): each user owns a fixed minute-slot within
// the polling window (`hash(userId) % windowSeconds`), smoothing provider
// rate-limit consumption instead of syncing everyone on the same tick.
const hashUserId = (userId: number): number =>
  // Knuth multiplicative hash — spreads sequential ids across slots.
  Math.abs((userId * 2654435761) % 2 ** 31);

export const getStaggerSlot = (userId: number, windowSlots: number): number =>
  hashUserId(userId) % windowSlots;

export const isInStaggerSlot = (
  userId: number,
  windowSlots: number,
  now: Date = new Date()
): boolean => {
  if (windowSlots <= 1) {
    return true;
  }
  const currentSlot = Math.floor(now.getTime() / POLL_TICK_MS) % windowSlots;
  return getStaggerSlot(userId, windowSlots) === currentSlot;
};

// ── Playback polling policy (M5, ARCHITECTURE.md §3.2, §8.1) ────────────────
// Playback state is ephemeral — no DB bookkeeping. Failure state is in-memory
// (v1 single worker instance, §11.2): a user whose playback poll keeps failing
// (e.g. 403 from a pre-M5 token without the playback scope) is skipped for
// exponentially more ticks instead of being hammered every interval.

const MAX_PLAYBACK_SKIP_TICKS = 32; // ~16 min at a 30s cadence

type PlaybackFailureState = { count: number; skipUntilTickExclusive: number };
const playbackFailures = new Map<number, PlaybackFailureState>();
let playbackTick = 0;

// Called once per pollPlayback tick, before target selection.
export const advancePlaybackTick = (): void => {
  playbackTick += 1;
};

export const isPlaybackPollDue = (userId: number): boolean => {
  const state = playbackFailures.get(userId);
  if (!state) return true;
  return playbackTick >= state.skipUntilTickExclusive;
};

export const notePlaybackSuccess = (userId: number): void => {
  playbackFailures.delete(userId);
};

export const notePlaybackFailure = (userId: number): void => {
  const previous = playbackFailures.get(userId);
  const count = (previous?.count ?? 0) + 1;
  const skipTicks = Math.min(BACKOFF_BASE ** count, MAX_PLAYBACK_SKIP_TICKS);
  playbackFailures.set(userId, {
    count,
    skipUntilTickExclusive: playbackTick + skipTicks,
  });
};

// Rate-limit citizenship (§8.2): when the provider signals pressure, the
// poller pauses the whole batch rather than working through remaining users.
export const isRateLimitError = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 429;
};
