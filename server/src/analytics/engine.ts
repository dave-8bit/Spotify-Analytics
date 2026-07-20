// Analytics Engine (M6, ARCHITECTURE.md §4.3, §9): derives aggregate views
// from the canonical PlayEvent stream and persists them as snapshots. The sole
// writer of StatsSnapshot, TopSnapshot, and ListeningSession (§6.1).
//
// Pipeline per §9.2: sync.completed (newEvents > 0) → debounce (≤1 per user /
// 30s) → per-user lock (serialize recomputes) → recompute via the pure
// functions in computations.ts → upsert snapshots → derive sessions → publish
// stats.updated. Does not serve HTTP, emit sockets, or call providers.

import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { eventBus } from "../events/bus";
import type { StatsPayload } from "../events/types";
import {
  computeStats,
  computeTopAlbums,
  computeTopArtists,
  computeTopTracks,
  SNAPSHOT_WINDOWS,
  type SnapshotWindowKey,
  type TopType,
} from "./computations";
import { rebuildListeningSessions } from "./sessions";

// §4.3: ≤1 recompute per user per 30 seconds.
export const RECOMPUTE_DEBOUNCE_MS = 30_000;

const log = (userId: number, message: string): void => {
  console.log(`[analytics] userId=${userId} ${message}`);
};

const upsertTopSnapshot = async (
  userId: number,
  type: TopType,
  timeRange: SnapshotWindowKey,
  rows: unknown[]
): Promise<void> => {
  const data = rows as Prisma.InputJsonValue;
  await prisma.topSnapshot.upsert({
    where: { userId_type_timeRange: { userId, type, timeRange } },
    update: { data, updatedAt: new Date() },
    create: { userId, type, timeRange, data },
  });
};

// One full recompute for one user (§9.3 v1 model: full recompute per trigger —
// milliseconds of Postgres work at current scale). Runs only under the
// per-user lock below. Returns the stats it wrote, for stats.updated.
const recompute = async (userId: number): Promise<StatsPayload> => {
  const computedAt = new Date();

  const stats = await computeStats(userId);

  await prisma.statsSnapshot.upsert({
    where: { userId },
    update: { ...stats, computedAt },
    create: { userId, ...stats, computedAt },
  });

  for (const window of SNAPSHOT_WINDOWS) {
    const [tracks, artists, albums] = await Promise.all([
      computeTopTracks(userId, window.key, computedAt),
      computeTopArtists(userId, window.key, computedAt),
      computeTopAlbums(userId, window.key, computedAt),
    ]);
    await Promise.all([
      upsertTopSnapshot(userId, "tracks", window.key, tracks),
      upsertTopSnapshot(userId, "artists", window.key, artists),
      upsertTopSnapshot(userId, "albums", window.key, albums),
    ]);
  }

  const sessionCount = await rebuildListeningSessions(userId);
  log(
    userId,
    `snapshots recomputed (plays=${stats.totalPlays}, sessions=${sessionCount})`
  );

  return stats;
};

// ── Debounce + serialization (§9.2) ─────────────────────────────────────────
// Per-user state machine: a trigger either starts a debounce timer, is
// absorbed by an already-pending timer, or — when a recompute is running —
// marks it queued so exactly one follow-up run happens afterwards. v1 state is
// process-local, matching the single-instance deployment (§11.1); the hourly
// sweep guarantees convergence across restarts (§9.4).

type UserRecomputeState = {
  timer: NodeJS.Timeout | null;
  running: boolean;
  queued: boolean;
  lastRunStartedAtMs: number;
};

const states = new Map<number, UserRecomputeState>();

const getState = (userId: number): UserRecomputeState => {
  let state = states.get(userId);
  if (!state) {
    state = { timer: null, running: false, queued: false, lastRunStartedAtMs: 0 };
    states.set(userId, state);
  }
  return state;
};

const runNow = async (userId: number): Promise<void> => {
  const state = getState(userId);
  state.running = true;
  state.lastRunStartedAtMs = Date.now();

  try {
    const stats = await recompute(userId);
    eventBus.publish("stats.updated", { userId, stats });
  } catch (error) {
    console.error(`[analytics] userId=${userId} recompute failed`, error);
  } finally {
    state.running = false;
    if (state.queued) {
      state.queued = false;
      scheduleRecompute(userId);
    }
  }
};

// Entry point for event-driven triggers: debounced and serialized.
export const scheduleRecompute = (userId: number): void => {
  const state = getState(userId);

  if (state.running) {
    // Serialization (§4.3): never two concurrent recomputes for one user.
    state.queued = true;
    return;
  }
  if (state.timer) {
    // A run is already scheduled inside the debounce window; absorb.
    return;
  }

  const elapsed = Date.now() - state.lastRunStartedAtMs;
  const delay = Math.max(0, RECOMPUTE_DEBOUNCE_MS - elapsed);

  state.timer = setTimeout(() => {
    state.timer = null;
    void runNow(userId);
  }, delay);
  // Don't hold the process open for a pending recompute on shutdown.
  state.timer.unref?.();
};

// Maintenance/backfill path (§6.3.4 — a first-class requirement): immediate,
// bypasses the debounce, still serialized. Used by the hourly analyticsSweep
// and available for manual rebuilds. Snapshot tables are rebuildable caches,
// never critical state.
export const rebuildSnapshots = async (userId: number): Promise<void> => {
  const state = getState(userId);
  if (state.running) {
    state.queued = true;
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  await runNow(userId);
};

// Bus wiring (§9.2): the engine reacts to sync.completed with new events.
// Called once from server bootstrap. Returns a teardown for symmetry with the
// gateway's emitter registration.
export const registerAnalyticsSubscribers = (): (() => void) =>
  eventBus.subscribe("sync.completed", ({ userId, newEvents }) => {
    if (newEvents <= 0) {
      return;
    }
    scheduleRecompute(userId);
  });

// Stop pending debounce timers (graceful shutdown). In-flight recomputes are
// idempotent full-row upserts — safe to abandon mid-run (§8.2).
export const stopAnalyticsEngine = (): void => {
  for (const state of states.values()) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.queued = false;
  }
};
