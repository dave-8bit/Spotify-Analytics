import dotenv from "dotenv";

dotenv.config();

import app from "./app";
import { validateEnv } from "./config/env";
import { connectPrisma, disconnectPrisma } from "./config/prisma";
import { closeSessionStore } from "./config/session";

export const startServer = async (): Promise<void> => {
  try {
    validateEnv();
    await connectPrisma();

    const port = process.env.PORT ? Number(process.env.PORT) : 5000;

    app.listen(port, () => {
      console.log(`Server running on David's port ${port}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const shutdown = async () => {
  try {
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


