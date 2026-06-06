import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma: PrismaClient = globalThis.__prisma ??
  new PrismaClient({
    // Helps avoid exhausting DB connections in dev, especially with hot reload.
    // You can also control pool sizing via DATABASE_URL / PgBouncer.
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Prevent Prisma from establishing many connections immediately in constrained dev envs.
    // If you need more control, prefer setting pool sizing in DATABASE_URL/PgBouncer.
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Hot-reload safe singleton in development.
if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;

export const connectPrisma = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL via Prisma");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

export const disconnectPrisma = async (): Promise<void> => {
  // Best-effort: disconnect may be called during ts-node-dev respawns even if connect failed.
  // We avoid crashing the process if disconnect fails.
  try {
    // NOTE: Accessing internal Prisma engine state is undocumented; if it's not available,
    // we just attempt $disconnect anyway (best-effort).
    const isConnected = Boolean(
      (prisma as { _engine?: { isConnected?: boolean } })._engine?.isConnected
    );

    if (isConnected) {
      await prisma.$disconnect();
      return;
    }

    // If we can't determine connection state, attempt disconnect silently.
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
  }
};





