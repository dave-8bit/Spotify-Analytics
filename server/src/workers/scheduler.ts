// Scheduler (M3, ARCHITECTURE.md §4.6, §8.2): owns *time*. Boots/stops all
// cron jobs; called from server.ts startup/shutdown. Jobs are thin wrappers —
// all policy lives in the services they trigger.
//
// Job inventory grows by milestone (§8.1): pollHistory (M3), pollPlayback (M5),
// analyticsSweep (M6), generateInsights (M7).

import cron, { type ScheduledTask } from "node-cron";
import {
  POLL_HISTORY_CRON,
  POLL_HISTORY_JOB_NAME,
  runPollHistoryTick,
} from "./jobs/pollHistory";
import {
  POLL_PLAYBACK_CRON,
  POLL_PLAYBACK_JOB_NAME,
  runPollPlaybackTick,
} from "./jobs/pollPlayback";
import {
  ANALYTICS_SWEEP_CRON,
  ANALYTICS_SWEEP_JOB_NAME,
  runAnalyticsSweepTick,
} from "./jobs/analyticsSweep";

type JobDefinition = {
  name: string;
  cronExpression: string;
  run: () => Promise<unknown>;
};

const JOBS: JobDefinition[] = [
  {
    name: POLL_HISTORY_JOB_NAME,
    cronExpression: POLL_HISTORY_CRON,
    run: runPollHistoryTick,
  },
  {
    name: POLL_PLAYBACK_JOB_NAME,
    cronExpression: POLL_PLAYBACK_CRON,
    run: runPollPlaybackTick,
  },
  {
    name: ANALYTICS_SWEEP_JOB_NAME,
    cronExpression: ANALYTICS_SWEEP_CRON,
    run: runAnalyticsSweepTick,
  },
];

const scheduledTasks: ScheduledTask[] = [];

// Heartbeat per job (§11.1): surfaced on /health as scheduler liveness.
const lastTickAt = new Map<string, Date>();

export const getSchedulerHeartbeat = (): Record<string, string> => {
  const heartbeat: Record<string, string> = {};
  for (const [name, tickedAt] of lastTickAt) {
    heartbeat[name] = tickedAt.toISOString();
  }
  return heartbeat;
};

export const isSchedulerRunning = (): boolean => scheduledTasks.length > 0;

export const startScheduler = (): void => {
  if (scheduledTasks.length) {
    console.warn("[workers] scheduler already started, ignoring");
    return;
  }

  for (const job of JOBS) {
    const task = cron.schedule(
      job.cronExpression,
      async () => {
        lastTickAt.set(job.name, new Date());
        try {
          await job.run();
        } catch (error) {
          // Failure isolation (§8.2): a failing tick never kills the schedule.
          console.error(`[workers:${job.name}] tick failed`, error);
        }
      },
      { name: job.name, noOverlap: true }
    );
    scheduledTasks.push(task);
    console.log(
      `[workers] scheduled job "${job.name}" (${job.cronExpression})`
    );
  }
};

export const stopScheduler = async (): Promise<void> => {
  for (const task of scheduledTasks) {
    await task.destroy();
  }
  scheduledTasks.length = 0;
  console.log("[workers] scheduler stopped");
};
