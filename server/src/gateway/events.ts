// Socket contract (ARCHITECTURE.md §7.3) — the single server-side source of
// truth for socket event names and payload types, mirrored manually in
// client/src/types/socketEvents.ts (reviewed together).
//
// Socket events (colon-notation) are the *external projection* of internal
// bus events (dot-notation); the Gateway owns the mapping (emitters.ts).
// Contract rules: additive payload changes only — a breaking change requires
// a new event name, with old and new emitted in parallel for one release.
//
// M4 implemented the sync:* + playEvent:created slice; M5 adds playback:*;
// M6 adds stats:updated. insight:generated (M7) is added at its milestone.

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

// Wire shape of playback state (§7.3): ephemeral, never persisted.
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

// Wire shape of the live stat tiles (§7.3, M6): mirrors the StatsSnapshot
// aggregates published by the Analytics Engine.
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
  "playEvent:created": (payload: { event: SocketPlayEvent }) => void;
  "playback:updated": (payload: SocketPlaybackState) => void;
  "playback:stopped": (payload: Record<string, never>) => void;
  "stats:updated": (payload: SocketStats) => void;
};

// Client → Server (minimal — reads stay on REST, §7.3)
export type ClientToServerEvents = {
  "sync:request": (ack: (response: { accepted: boolean }) => void) => void;
};

export const userRoom = (userId: number): string => `user:${userId}`;
