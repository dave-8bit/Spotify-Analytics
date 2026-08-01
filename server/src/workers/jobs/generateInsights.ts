// generateInsights job (M7, ARCHITECTURE.md §8.1 "Daily (future)"): daily AI
// insight generation for users with fresh activity. The job is thin (§8.2):
// select targets, publish insight.requested, log. All policy (cache window,
// provider selection, validation) lives in the Insights Engine.
//
// Note: this job does NOT require GROQ_API_KEY to be set — the job publishes
// the bus event and the Insights Engine degrades gracefully when the key is
// missing (it logs and skips). The app must boot and run without a key.

import prisma from "../../config/prisma";
import { INSIGHT_GENERATION_CRON } from "../../config/env";
import { eventBus } from "../../events/bus";
import type { InsightKind } from "../../events/types";

export const INSIGHT_GENERATION_JOB_NAME = "generateInsights";

// §8.1: daily. UTC (never server-local) — see env.ts INSIGHT_GENERATION_CRON.
export const INSIGHT_GENERATION_JOB_CRON = INSIGHT_GENERATION_CRON;

// §8.1: "Users with fresh weekly activity". Fresh = a StatsSnapshot computed
// within the last week (the Analytics Engine writes it on any sync with new
// events). Users without a snapshot get no daily insight — there is nothing
// meaningful to narrate yet.
const FRESH_WINDOW_DAYS = 7;

const DAILY_KIND: InsightKind = "weekly_recap";

// One tick: publish insight.requested for every user with fresh activity.
// Returns the number of users requested (for logging/verification).
export const runGenerateInsightsTick = async (
  now: Date = new Date()
): Promise<number> => {
  const freshSince = new Date(
    now.getTime() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const freshUsers = await prisma.statsSnapshot.findMany({
    where: { computedAt: { gte: freshSince } },
    select: { userId: true },
  });

  for (const { userId } of freshUsers) {
    eventBus.publish("insight.requested", {
      userId,
      kind: DAILY_KIND,
      reason: "scheduled",
    });
  }

  if (freshUsers.length > 0) {
    console.log(
      `[workers:${INSIGHT_GENERATION_JOB_NAME}] published insight.requested for ${freshUsers.length} user(s)`
    );
  }

  return freshUsers.length;
};

