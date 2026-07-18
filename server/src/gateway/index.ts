// WebSocket Gateway (ARCHITECTURE.md §4.4, §7) — delivers domain events to
// connected clients, authenticated and scoped per user.
//
// Responsibilities: attach Socket.IO to the shared http.Server, authenticate
// the handshake with the *same* Express session middleware as REST (§7.2 — one
// auth system, no parallel JWTs), join each socket to its `user:<userId>` room,
// maintain the Socket Registry, and map bus events to socket emissions.
//
// Non-responsibilities (§2.2, §13.5): the Gateway never queries the database,
// never calls a service, and computes nothing. The only client→server message
// (`sync:request`) is forwarded as a `sync.requested` bus event.

import type { IncomingMessage, Server as HttpServer, ServerResponse } from "http";
import { Server } from "socket.io";
import { getSessionMiddleware } from "../config/session";
import { eventBus } from "../events/bus";
import type { AppSession } from "../types";
import { registerEmitters } from "./emitters";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";
import { userRoom } from "./events";
import {
  clearRegistry,
  getConnectionCount,
  registerConnection,
  unregisterConnection,
} from "./registry";

type GatewayServer = Server<ClientToServerEvents, ServerToClientEvents>;

// After io.engine.use(sessionMiddleware), the handshake request carries the
// same session object Express routes see.
type SessionIncomingMessage = IncomingMessage & { session?: AppSession };

let io: GatewayServer | null = null;
let teardownEmitters: (() => void) | null = null;

const log = (message: string): void => {
  console.log(`[gateway] ${message}`);
};

export const attachGateway = (httpServer: HttpServer): GatewayServer => {
  if (io) {
    console.warn("[gateway] already attached, ignoring");
    return io;
  }

  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    // Same-origin contract as Express (app.ts): the dashboard origin, with
    // credentials so the session cookie rides the handshake.
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
    // Heartbeat (§4.4 connection management): the server pings every 25s and
    // drops sockets that miss a pong for 20s, so the registry (and with it the
    // M5 playback poller's active-user list) never leaks dead connections.
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  // §7.2: the Express session middleware is *shared* with the handshake.
  // Engine-level middleware runs on every Engine.IO HTTP request, populating
  // req.session from the connect-pg-simple store — one auth system.
  const sessionMiddleware = getSessionMiddleware();
  io.engine.use(
    sessionMiddleware as unknown as (
      req: IncomingMessage,
      res: ServerResponse,
      next: (err?: Error) => void
    ) => void
  );

  // Handshake guard — the socket mirror of requireAuth: no session.userId,
  // no connection.
  io.use((socket, next) => {
    const session = (socket.request as SessionIncomingMessage).session;
    if (!session?.userId) {
      next(new Error("Not authenticated"));
      return;
    }
    next();
  });

  io.on("connection", (socket) => {
    // The guard above ran, so userId is present; re-read it here so the value
    // is pinned per socket.
    const session = (socket.request as SessionIncomingMessage).session;
    const userId = session?.userId;
    if (!userId) {
      // Defensive: should be unreachable past the handshake guard.
      socket.disconnect(true);
      return;
    }

    // Room-per-user (§7.1): all emissions are room-scoped, never global.
    void socket.join(userRoom(userId));
    registerConnection(userId);
    log(
      `userId=${userId} connected (socket=${socket.id}, connections=${getConnectionCount(userId)})`
    );

    // Client→server surface is minimal (§7.3); sync:request is forwarded as a
    // bus event — the Gateway never calls the Sync Service directly (§2.2).
    socket.on("sync:request", (ack) => {
      eventBus.publish("sync.requested", { userId, reason: "socket" });
      if (typeof ack === "function") {
        ack({ accepted: true });
      }
    });

    socket.on("disconnect", (reason) => {
      unregisterConnection(userId);
      log(
        `userId=${userId} disconnected (${reason}, connections=${getConnectionCount(userId)})`
      );
    });
  });

  teardownEmitters = registerEmitters(io);
  log("attached to http server");
  return io;
};

// Graceful shutdown (§8.2 lifecycle): unsubscribe from the bus, disconnect
// every socket, and close the Socket.IO server. Safe to call when never
// attached (worker role) or twice.
export const closeGateway = async (): Promise<void> => {
  if (!io) return;

  const closing = io;
  io = null;

  teardownEmitters?.();
  teardownEmitters = null;
  clearRegistry();

  await new Promise<void>((resolve) => {
    // io.close() disconnects all namespaces' sockets and closes the engine.
    closing.close(() => resolve());
  });
  log("closed");
};
