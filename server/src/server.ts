import dotenv from "dotenv";

dotenv.config();

import http from "http";

import app from "./app";
import { getRole, validateEnv } from "./config/env";
import { connectPrisma, disconnectPrisma } from "./config/prisma";
import { closeSessionStore } from "./config/session";
import { attachGateway, closeGateway } from "./gateway";
import {
  registerAnalyticsSubscribers,
  stopAnalyticsEngine,
} from "./analytics/engine";
import { registerSyncSubscribers } from "./sync/syncService";
import { startScheduler, stopScheduler } from "./workers/scheduler";

let httpServer: http.Server | null = null;

export const startServer = async (): Promise<void> => {
  try {
    validateEnv();
    await connectPrisma();

    registerSyncSubscribers();
    registerAnalyticsSubscribers();

    // Behavior is selected by ROLE (ARCHITECTURE.md §8.2, §11.2): "api" serves
    // HTTP only, "worker" runs schedulers only, "all" (default) does both in
    // one process — the zero-rewrite path to a dedicated worker process later.
    const role = getRole();

    if (role === "worker") {
      // Dedicated worker: no HTTP listener; schedulers drive everything.
      startScheduler();
      console.log("Worker running (ROLE=worker, no HTTP listener)");
      return;
    }

    const port = process.env.PORT ? Number(process.env.PORT) : 5000;

    // Shared http.Server (ARCHITECTURE.md §7.1, M4): Express and the WebSocket
    // Gateway ride the same server/port — one TLS cert, cookie auth unchanged.
    httpServer = http.createServer(app);
    attachGateway(httpServer);

    httpServer.listen(port, () => {
      console.log(`Server running on David's port ${port}`);
      // §8.2 lifecycle: the scheduler starts only after the HTTP server binds.
      if (role === "all") {
        startScheduler();
      }
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const shutdown = async () => {
  try {
    await stopScheduler();
    stopAnalyticsEngine();
    // Gateway before session store: closing sockets stops new handshakes from
    // touching the (about to close) session pool.
    await closeGateway();
    if (httpServer) {
      const closing = httpServer;
      httpServer = null;
      await new Promise<void>((resolve) => {
        closing.close(() => resolve());
      });
    }
    await closeSessionStore();
    await disconnectPrisma();
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// In dev, ts-node-dev respawns; ensure prisma disconnect runs on unexpected failures too.
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection", reason);
  void shutdown();
});
process.on("uncaughtException", (err) => {
  console.error("uncaughtException", err);
  void shutdown();
});

void startServer();


