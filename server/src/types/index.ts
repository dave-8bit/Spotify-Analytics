import "express-session";

export type TimeRange =
  | "short_term"
  | "medium_term"
  | "long_term"
  | "all_time";

export type AppSession = {
  userId?: number;
  oauthState?: string;
  oauthOrigin?: string;
  destroy: (callback: () => void) => void;
};

declare module "express-session" {
  interface SessionData extends Omit<AppSession, "destroy"> {
    // express-session already provides destroy(); this type augments only data fields.
  }
}

