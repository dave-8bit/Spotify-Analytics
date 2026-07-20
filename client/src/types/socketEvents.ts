// Client mirror of the server socket contract (ARCHITECTURE.md §7.3).
// Source of truth: server/src/gateway/events.ts — the two files are maintained
// manually and reviewed together. Additive payload changes only.

import type { RecentTrack } from "./index";

// Playback state wire shape (M5): ephemeral, never persisted server-side.
export type SocketPlaybackState = {
  isPlaying: boolean;
  track: {
    name: string;
    artistName: string;
    albumImage: string | null;
    durationMs: number | null;
  };
  progressMs: number | null;
  fetchedAt: string;
};

// Live stat tiles wire shape (M6): mirrors server SocketStats.
export type SocketStats = {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
};

// Server → Client
export type ServerToClientEvents = {
  "sync:started": (payload: Record<string, never>) => void;
  "sync:completed": (payload: { newEvents: number }) => void;
  "sync:failed": (payload: { message: string }) => void;
  "sync:disabled": (payload: { provider: string; message: string }) => void;
  "playEvent:created": (payload: { event: RecentTrack }) => void;
  "playback:updated": (payload: SocketPlaybackState) => void;
  "playback:stopped": (payload: Record<string, never>) => void;
  "stats:updated": (payload: SocketStats) => void;
};

// Client → Server (minimal — reads stay on REST)
export type ClientToServerEvents = {
  "sync:request": (ack: (response: { accepted: boolean }) => void) => void;
};
