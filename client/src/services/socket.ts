// socket.io-client singleton (ARCHITECTURE.md §5, §7.1): autoConnect: false —
// connected only after auth confirms, disconnected on logout. Auth is the
// session cookie riding the handshake; there is no token handling here.
//
// Degradation contract (§7.4): if the socket never connects, the dashboard
// keeps working on REST exactly as before — callers must treat everything
// delivered here as an enhancement, never a requirement.

import { io, type Socket } from "socket.io-client";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "../types/socketEvents";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Same-origin in production; in dev the Vite proxy forwards /socket.io to the
// API server (ws: true), so no explicit URL is needed in either case.
export const socket: AppSocket = io({
  autoConnect: false,
  withCredentials: true,
});

export const connectSocket = (): void => {
  if (!socket.connected) {
    socket.connect();
  }
};

export const disconnectSocket = (): void => {
  socket.disconnect();
};
