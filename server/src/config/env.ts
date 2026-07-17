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

export const validateEnv = (): void => {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  // Fail fast on malformed optional values too.
  getRole();
  getHistoryPollIntervalMinutes();
};
