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
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error(error);
  }
};



