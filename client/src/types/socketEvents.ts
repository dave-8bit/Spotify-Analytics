// Client mirror of the server socket contract (ARCHITECTURE.md §7.3).
// Source of truth: server/src/gateway/events.ts — the two files are maintained
// manually and reviewed together. Additive payload changes only.

import type { RecentTrack } from "./index";

// Server → Client
export type ServerToClientEvents = {
  "sync:started": (payload: Record<string, never>) => void;
  "sync:completed": (payload: { newEvents: number }) => void;
  "sync:failed": (payload: { message: string }) => void;
  "sync:disabled": (payload: { provider: string; message: string }) => void;
  "playEvent:created": (payload: { event: RecentTrack }) => void;
};

// Client → Server (minimal — reads stay on REST)
export type ClientToServerEvents = {
  "sync:request": (ack: (response: { accepted: boolean }) => void) => void;
};
