import dotenv from "dotenv";

dotenv.config();

import app from "./app";
import { connectPrisma, disconnectPrisma } from "./config/prisma";

const validateEnv = () => {
  const required = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "SPOTIFY_REDIRECT_URI",
    "FRONTEND_URL",
  ] as const;

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
};

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


