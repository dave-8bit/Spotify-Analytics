// Centralized environment validation (ARCHITECTURE.md §11.1).
// Called once at boot, before anything else reads process.env.

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
  "FRONTEND_URL",
] as const;

// Deployment role (ARCHITECTURE.md §8.2, §10.1): behavior is selected by ROLE.
// The scheduler boots only when the role includes "worker" — the zero-rewrite
// path to a dedicated worker process later.
const VALID_ROLES = ["api", "worker", "all"] as const;

export type Role = (typeof VALID_ROLES)[number];

export const getRole = (): Role => {
  const role = process.env.ROLE ?? "all";
  if (!(VALID_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      `Invalid ROLE "${role}" — expected one of: ${VALID_ROLES.join(", ")}`
    );
  }
  return role as Role;
};

// History polling window (ARCHITECTURE.md §8.1: "~every 10 min"). Users are
// staggered across this window by the pollHistory job.
const DEFAULT_HISTORY_POLL_INTERVAL_MINUTES = 10;

export const getHistoryPollIntervalMinutes = (): number => {
  const raw = process.env.HISTORY_POLL_INTERVAL_MINUTES;
  if (raw === undefined || raw === "") {
    return DEFAULT_HISTORY_POLL_INTERVAL_MINUTES;
  }
  const minutes = Number(raw);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error(
      `Invalid HISTORY_POLL_INTERVAL_MINUTES "${raw}" — expected a positive integer`
    );
  }
  return minutes;
};

// AI Insights (M7, ARCHITECTURE.md §4.7, §11.1). GROQ_API_KEY is *optional*:
// the app must boot and every non-AI feature must work without it. Insight
// requests are accepted but degrade gracefully when the key is missing (the
// Insights Engine logs and skips) — no crashes, no failed boot.
export const getGroqApiKey = (): string | undefined =>
  process.env.GROQ_API_KEY || undefined;

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export const getGroqModel = (): string =>
  process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;

// Daily insight generation cron (ARCHITECTURE.md §8.1: "Daily (future)"). UTC
// explicitly — never server-local — to avoid deployment timezone ambiguity.
// §4.7: insight generation runs on a slow cadence; 09:00 UTC default.
export const INSIGHT_GENERATION_CRON = "0 9 * * *";

// Playback polling cadence (ARCHITECTURE.md §8.1: "30–60 s", M5). Runs only
// for users in the Socket Registry, so this is a per-active-user cost.
const DEFAULT_PLAYBACK_POLL_INTERVAL_SECONDS = 30;

export const getPlaybackPollIntervalSeconds = (): number => {
  const raw = process.env.PLAYBACK_POLL_INTERVAL_SECONDS;
  if (raw === undefined || raw === "") {
    return DEFAULT_PLAYBACK_POLL_INTERVAL_SECONDS;
  }
  const seconds = Number(raw);
  // node-cron second-steps must divide the minute evenly.
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60 || 60 % seconds !== 0) {
    throw new Error(
      `Invalid PLAYBACK_POLL_INTERVAL_SECONDS "${raw}" — expected an integer divisor of 60 between 5 and 60`
    );
  }
  return seconds;
};

export const validateEnv = (): void => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  // Fail fast on malformed optional values too.
  getRole();
  getHistoryPollIntervalMinutes();
  getPlaybackPollIntervalSeconds();
};
