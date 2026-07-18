// Socket contract (ARCHITECTURE.md §7.3) — the single server-side source of
// truth for socket event names and payload types, mirrored manually in
// client/src/types/socketEvents.ts (reviewed together).
//
// Socket events (colon-notation) are the *external projection* of internal
// bus events (dot-notation); the Gateway owns the mapping (emitters.ts).
// Contract rules: additive payload changes only — a breaking change requires
// a new event name, with old and new emitted in parallel for one release.
//
// M4 implements the sync:* + playEvent:created slice. playback:* (M5),
// stats:updated (M6) and insight:generated (M7) are added at their milestones.

// Wire shape of a play event as delivered to clients — matches the client's
// RecentTrack type. Dates cross the socket as ISO strings.
export type SocketPlayEvent = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  albumImage: string | null;
  playedAt: string;
  durationMs: number | null;
};

// Server → Client
export type ServerToClientEvents = {
  "sync:started": (payload: Record<string, never>) => void;
  "sync:completed": (payload: { newEvents: number }) => void;
  "sync:failed": (payload: { message: string }) => void;
  "sync:disabled": (payload: { provider: string; message: string }) => void;
  "playEvent:created": (payload: { event: SocketPlayEvent }) => void;
};

// Client → Server (minimal — reads stay on REST, §7.3)
export type ClientToServerEvents = {
  "sync:request": (ack: (response: { accepted: boolean }) => void) => void;
};

export const userRoom = (userId: number): string => `user:${userId}`;
