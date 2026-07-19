// pollPlayback job (M5, ARCHITECTURE.md §3.2, §8.1): every 30–60s, poll current
// playback for **only users in the Socket Registry** — zero connected users →
// zero Spotify calls (the rate-limit guarantee). The job is thin (§8.2): select
// targets, call the Sync Service's playback path, log. All policy (in-flight
// guard, failure backoff, rate-limit classification) lives in sync/.

import { getPlaybackPollIntervalSeconds } from "../../config/env";
import { getActiveUserIds } from "../../gateway/registry";
import { pollPlayback } from "../../sync/syncService";
import {
  advancePlaybackTick,
  isPlaybackPollDue,
  isRateLimitError,
} from "../../sync/syncPolicy";

export const POLL_PLAYBACK_JOB_NAME = "pollPlayback";

// node-cron seconds-field expression, e.g. "*/30 * * * * *".
export const POLL_PLAYBACK_CRON = `*/${getPlaybackPollIntervalSeconds()} * * * * *`;

// One tick: poll playback for each active (socket-connected) user not in
// failure backoff. Returns the number of users polled.
export const runPollPlaybackTick = async (): Promise<number> => {
  advancePlaybackTick();

  const activeUserIds = getActiveUserIds();
  if (!activeUserIds.length) {
    return 0;
  }

  let polled = 0;
  for (const userId of activeUserIds) {
    if (!isPlaybackPollDue(userId)) {
      continue;
    }
    try {
      await pollPlayback(userId);
      polled += 1;
    } catch (error) {
      // Rate-limit citizenship (§8.2): pause the rest of the batch when the
      // provider signals pressure; the next tick starts fresh.
      if (isRateLimitError(error)) {
        console.warn(
          `[workers:${POLL_PLAYBACK_JOB_NAME}] provider rate limit — pausing batch`
        );
        break;
      }
      // pollPlayback absorbs non-429 errors itself; anything else landing
      // here is unexpected but must not abort the batch (failure isolation).
      console.error(
        `[workers:${POLL_PLAYBACK_JOB_NAME}] userId=${userId} unexpected error`,
        error
      );
    }
  }

  return polled;
};
