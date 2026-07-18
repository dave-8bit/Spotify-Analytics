// Bus event → socket emission mapping (ARCHITECTURE.md §4.4): a pure mapping
// table. Each entry translates one domain event (dot-notation) into one
// room-scoped socket emission (colon-notation). No database access, no
// computation — payloads are reshaped, never enriched.

import type { Server } from "socket.io";
import { eventBus } from "../events/bus";
import type { PlayEventPayload } from "../events/types";
import {
  userRoom,
  type ClientToServerEvents,
  type ServerToClientEvents,
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
  ];

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
};
