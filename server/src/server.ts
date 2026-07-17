import dotenv from "dotenv";

dotenv.config();

import app from "./app";
import { getRole, validateEnv } from "./config/env";
import { connectPrisma, disconnectPrisma } from "./config/prisma";
import { closeSessionStore } from "./config/session";
import { registerSyncSubscribers } from "./sync/syncService";
import { startScheduler, stopScheduler } from "./workers/scheduler";

export const startServer = async (): Promise<void> => {
  try {
    validateEnv();
    await connectPrisma();

    registerSyncSubscribers();

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

    app.listen(port, () => {
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


