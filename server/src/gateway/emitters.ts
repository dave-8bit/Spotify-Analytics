// Bus event → socket emission mapping (ARCHITECTURE.md §4.4): a pure mapping
// table. Each entry translates one domain event (dot-notation) into one
// room-scoped socket emission (colon-notation). No database access, no
// computation — payloads are reshaped, never enriched.

import type { Server } from "socket.io";
import { eventBus } from "../events/bus";
import type { PlaybackStatePayload, PlayEventPayload } from "../events/types";
import {
  userRoom,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketPlaybackState,
  type SocketPlayEvent,
} from "./events";

type GatewayServer = Server<ClientToServerEvents, ServerToClientEvents>;

const toSocketPlayEvent = (event: PlayEventPayload): SocketPlayEvent => ({
  id: event.id,
  trackName: event.trackName,
  artistName: event.artistName,
  albumName: event.albumName,
  albumImage: event.albumImage,
  playedAt: event.playedAt.toISOString(),
  durationMs: event.durationMs,
});

const toSocketPlaybackState = (
  state: PlaybackStatePayload
): SocketPlaybackState => ({
  isPlaying: state.isPlaying,
  track: {
    name: state.trackName,
    artistName: state.artistName,
    albumImage: state.albumImage,
    durationMs: state.durationMs,
  },
  progressMs: state.progressMs,
  fetchedAt: state.fetchedAt.toISOString(),
});

// Subscribes the gateway to every M4 domain event. All emissions are scoped to
// room `user:<userId>` — never broadcast globally (§7.1). Returns a teardown
// that unsubscribes everything (used on graceful shutdown).
export const registerEmitters = (io: GatewayServer): (() => void) => {
  const unsubscribers = [
    eventBus.subscribe("sync.started", ({ userId }) => {
      io.to(userRoom(userId)).emit("sync:started", {});
    }),

    eventBus.subscribe("sync.completed", ({ userId, newEvents }) => {
      io.to(userRoom(userId)).emit("sync:completed", { newEvents });
    }),

    eventBus.subscribe("sync.failed", ({ userId, error }) => {
      io.to(userRoom(userId)).emit("sync:failed", { message: error });
    }),

    eventBus.subscribe("sync.disabled", ({ userId, provider, reason }) => {
      io.to(userRoom(userId)).emit("sync:disabled", {
        provider,
        message: reason,
      });
    }),

    eventBus.subscribe("playEvent.created", ({ userId, event }) => {
      io.to(userRoom(userId)).emit("playEvent:created", {
        event: toSocketPlayEvent(event),
      });
    }),

    // M5 (§3.2 fast path, §7.3): state=null means nothing is playing — the
    // client hides the Now Playing card. Pure projection, no state held here.
    eventBus.subscribe("playback.updated", ({ userId, state }) => {
      if (state === null) {
        io.to(userRoom(userId)).emit("playback:stopped", {});
        return;
      }
      io.to(userRoom(userId)).emit(
        "playback:updated",
        toSocketPlaybackState(state)
      );
    }),

    // M6 (§7.3): live stat tiles. The stats payload already matches the wire
    // shape 1:1 — projected field-by-field so bus payload growth stays opt-in.
    eventBus.subscribe("stats.updated", ({ userId, stats }) => {
      io.to(userRoom(userId)).emit("stats:updated", {
        totalPlays: stats.totalPlays,
        totalMinutes: stats.totalMinutes,
        uniqueTracks: stats.uniqueTracks,
        uniqueArtists: stats.uniqueArtists,
      });
    }),
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
};
