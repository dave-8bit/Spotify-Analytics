// analyticsSweep job (M6, ARCHITECTURE.md §8.1): hourly safety net for missed
// bus events. Targets users with play events newer than their snapshot's
// computedAt (or with events but no snapshot yet) and asks the Analytics
// Engine to rebuild. Idempotent — snapshot writes are full-row upserts, so a
// sweep running twice is harmless. The job is thin (§8.2): select targets,
// call the engine, log.

import prisma from "../../config/prisma";
import { rebuildSnapshots } from "../../analytics/engine";

export const ANALYTICS_SWEEP_JOB_NAME = "analyticsSweep";

// §8.1: hourly. Minute 7 avoids stacking on the on-the-hour pollHistory tick.
export const ANALYTICS_SWEEP_CRON = "7 * * * *";

// One tick: rebuild snapshots for every user whose event stream has advanced
// past their snapshot. Returns the number of users swept.
export const runAnalyticsSweepTick = async (): Promise<number> => {
  const [latestEventPerUser, snapshots] = await Promise.all([
    prisma.playEvent.groupBy({
      by: ["userId"],
      _max: { playedAt: true },
    }),
    prisma.statsSnapshot.findMany({
      select: { userId: true, computedAt: true },
    }),
  ]);

  const computedAtByUser = new Map(
    snapshots.map((snapshot) => [snapshot.userId, snapshot.computedAt])
  );

  const staleUserIds = latestEventPerUser
    .filter((row) => {
      const computedAt = computedAtByUser.get(row.userId);
      if (!computedAt) {
        return true; // events but no snapshot yet
      }
      const latest = row._max.playedAt;
      return latest !== null && latest > computedAt;
    })
    .map((row) => row.userId);

  let swept = 0;
  for (const userId of staleUserIds) {
    // Failure isolation (§8.2): one user's failure never aborts the batch —
    // rebuildSnapshots logs its own errors and never throws.
    await rebuildSnapshots(userId);
    swept += 1;
  }

  if (swept > 0) {
    console.log(
      `[workers:${ANALYTICS_SWEEP_JOB_NAME}] rebuilt snapshots for ${swept} user(s)`
    );
  }

  return swept;
};
