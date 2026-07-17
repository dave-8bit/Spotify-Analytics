// Sync Service — orchestrates ingestion runs and persists canonical events
// (ARCHITECTURE.md §4.2). Picks the adapter, passes the stored cursor, upserts
// events idempotently on [userId, provider, playedAt], advances the cursor,
// keeps sync bookkeeping, and publishes domain events. Knows nothing about
// cron, sockets, or analytics.

import type { ProviderAccount } from "@prisma/client";
import prisma from "../config/prisma";
import { eventBus } from "../events/bus";
import { getAdapter } from "../ingestion/registry";
import type { CanonicalPlayEvent } from "../ingestion/types";
import { noteSyncAttempt, shouldDisableSync } from "./syncPolicy";

const log = (userId: number, message: string): void => {
  console.log(`[sync] userId=${userId} ${message}`);
};

const persistEvents = async (
  userId: number,
  events: CanonicalPlayEvent[]
): Promise<number> => {
  if (!events.length) {
    return 0;
  }

  // The upsert is idempotent either way; the pre-check exists only to report
  // newEvents accurately and publish playEvent.created for genuinely new rows.
  const existing = await prisma.playEvent.findMany({
    where: {
      userId,
      provider: events[0].provider,
      playedAt: { in: events.map((event) => event.playedAt) },
    },
    select: { playedAt: true },
  });
  const existingPlayedAt = new Set(existing.map((row) => row.playedAt.getTime()));

  let newEvents = 0;

  for (const event of events) {
    const row = await prisma.playEvent.upsert({
      where: {
        userId_provider_playedAt: {
          userId,
          provider: event.provider,
          playedAt: event.playedAt,
        },
      },
      update: {
        trackId: event.providerTrackId,
        trackName: event.trackName,
        artistId: event.artistId,
        artistName: event.artistName,
        albumId: event.albumId,
        albumName: event.albumName,
        albumImage: event.albumImage,
        durationMs: event.durationMs,
      },
      create: {
        userId,
        provider: event.provider,
        trackId: event.providerTrackId,
        trackName: event.trackName,
        artistId: event.artistId,
        artistName: event.artistName,
        albumId: event.albumId,
        albumName: event.albumName,
        albumImage: event.albumImage,
        playedAt: event.playedAt,
        durationMs: event.durationMs,
      },
    });

    if (!existingPlayedAt.has(event.playedAt.getTime())) {
      newEvents += 1;
      eventBus.publish("playEvent.created", { userId, event: row });
    }
  }

  return newEvents;
};

const recordSuccess = async (
  account: ProviderAccount,
  nextCursor: string | null
): Promise<void> => {
  const lastSyncedAt = new Date();

  await prisma.providerAccount.update({
    where: { id: account.id },
    data: {
      historyCursor: nextCursor ?? account.historyCursor,
      lastSyncedAt,
      syncFailCount: 0,
      lastSyncError: null,
    },
  });

  // Legacy mirror (M2 transition, ARCHITECTURE.md §6.3): /auth/me still reads
  // User.lastSyncedAt.
  await prisma.user.update({
    where: { id: account.userId },
    data: { lastSyncedAt },
  });
};

const recordFailure = async (
  account: ProviderAccount,
  error: unknown
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error);
  const syncFailCount = account.syncFailCount + 1;
  const disable = shouldDisableSync(syncFailCount);

  await prisma.providerAccount.update({
    where: { id: account.id },
    data: {
      syncFailCount,
      lastSyncError: message,
      ...(disable ? { syncEnabled: false } : {}),
    },
  });

  if (disable) {
    log(account.userId, `sync disabled after ${syncFailCount} consecutive failures`);
    eventBus.publish("sync.disabled", {
      userId: account.userId,
      provider: account.provider,
      reason: message,
    });
  }
};

// Duplicate-sync guard (M3, ARCHITECTURE.md §4.2 dedup rules): the scheduler
// and manual REST/Gateway requests may publish sync.requested for the same
// user concurrently. Overlapping runs are skipped, not queued — history
// polling repeats shortly anyway and upserts are idempotent.
const inFlightUserIds = new Set<number>();

// Run one history sync for every syncEnabled provider account of a user.
export const syncUser = async (userId: number): Promise<void> => {
  if (inFlightUserIds.has(userId)) {
    log(userId, "sync already in flight, skipping duplicate run");
    return;
  }
  inFlightUserIds.add(userId);

  try {
    const accounts = await prisma.providerAccount.findMany({
      where: { userId, syncEnabled: true },
    });

    if (!accounts.length) {
      log(userId, "no sync-enabled provider accounts, skipping");
      return;
    }

    eventBus.publish("sync.started", { userId });

    let totalNewEvents = 0;
    let failure: unknown = null;

    for (const account of accounts) {
      noteSyncAttempt(account.id);
      try {
        const adapter = getAdapter(account.provider);
        const { events, nextCursor } = await adapter.fetchPlayHistory(
          account,
          account.historyCursor
        );

        const newEvents = await persistEvents(userId, events);
        totalNewEvents += newEvents;

        await recordSuccess(account, nextCursor);
        log(
          userId,
          `provider=${account.provider} fetched=${events.length} new=${newEvents}`
        );
      } catch (error) {
        failure = error;
        console.error(`[sync] userId=${userId} provider=${account.provider} failed`, error);
        await recordFailure(account, error).catch((bookkeepingError) => {
          console.error(
            `[sync] userId=${userId} failed to record sync failure`,
            bookkeepingError
          );
        });
      }
    }

    if (failure) {
      eventBus.publish("sync.failed", {
        userId,
        error: failure instanceof Error ? failure.message : String(failure),
      });
      return;
    }

    eventBus.publish("sync.completed", { userId, newEvents: totalNewEvents });
  } finally {
    inFlightUserIds.delete(userId);
  }
};

// Fire-and-forget entry point preserved from the legacy services/syncService.ts:
// never throws (callers use `void triggerSync(...)`).
export const triggerSync = async (userId: number): Promise<void> => {
  try {
    await syncUser(userId);
  } catch (error) {
    console.error(`[sync] userId=${userId} unexpected sync error`, error);
  }
};

// Bus wiring: REST (and later the Gateway) publish sync.requested; the Sync
// Service is its only subscriber. Called once from server bootstrap.
export const registerSyncSubscribers = (): void => {
  eventBus.subscribe("sync.requested", ({ userId, reason }) => {
    log(userId, `sync requested (${reason})`);
    void triggerSync(userId);
  });
};
