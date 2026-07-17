// pollHistory job (M3, ARCHITECTURE.md §8.1): every syncEnabled ProviderAccount,
// staggered across the polling window by userId hash, with per-account failure
// backoff. The job is thin — select targets, publish, log (§8.2). All policy
// (due rules, backoff, stagger) lives in sync/syncPolicy.
//
// The job publishes `sync.requested` to the Event Bus rather than calling the
// Sync Service directly, so the same wiring keeps working when the bus moves to
// Redis and the worker becomes its own process (§10.1 S2).

import prisma from "../../config/prisma";
import { getHistoryPollIntervalMinutes } from "../../config/env";
import { eventBus } from "../../events/bus";
import { isDueForSync, isInStaggerSlot } from "../../sync/syncPolicy";

export const POLL_HISTORY_JOB_NAME = "pollHistory";

// The scheduler ticks this job every minute; each user is synced once per
// polling window, in their own stagger slot (§8.2 "stagger, don't stampede").
export const POLL_HISTORY_CRON = "* * * * *";

// One tick: find accounts due in the current stagger slot and request a sync
// per user. Returns the number of users requested (for logging/verification).
export const runPollHistoryTick = async (
  now: Date = new Date()
): Promise<number> => {
  const windowSlots = getHistoryPollIntervalMinutes();
  const baseIntervalMs = windowSlots * 60_000;

  // Work-queue query (schema index [syncEnabled, lastSyncedAt]). Disabled
  // accounts are excluded at the source — the poller never sees them.
  const accounts = await prisma.providerAccount.findMany({
    where: { syncEnabled: true },
    select: { id: true, userId: true, lastSyncedAt: true, syncFailCount: true },
  });

  // A user may link several provider accounts; one sync.requested per user
  // covers them all (the Sync Service iterates the user's accounts).
  const dueUserIds = new Set<number>();
  for (const account of accounts) {
    if (!isInStaggerSlot(account.userId, windowSlots, now)) {
      continue;
    }
    if (!isDueForSync(account, baseIntervalMs, now)) {
      continue;
    }
    dueUserIds.add(account.userId);
  }

  for (const userId of dueUserIds) {
    eventBus.publish("sync.requested", { userId, reason: "scheduled" });
  }

  if (dueUserIds.size > 0) {
    console.log(
      `[workers:${POLL_HISTORY_JOB_NAME}] published sync.requested for ${dueUserIds.size} user(s)`
    );
  }

  return dueUserIds.size;
};
