// Sync policy: failure thresholds and cursor rules (ARCHITECTURE.md §4.2).
// Backoff scheduling itself lands with the workers in M3; the bookkeeping the
// scheduler will need (fail counts, disable threshold) is enforced here.

// Consecutive failures after which an account's sync is disabled.
export const MAX_CONSECUTIVE_SYNC_FAILURES = 5;

export const shouldDisableSync = (syncFailCount: number): boolean =>
  syncFailCount >= MAX_CONSECUTIVE_SYNC_FAILURES;

// Spotify's history endpoint returns at most 50 plays; on the first sync there
// is no cursor and we take whatever the provider gives us.
export const isInitialSync = (historyCursor: string | null): boolean =>
  historyCursor === null;
