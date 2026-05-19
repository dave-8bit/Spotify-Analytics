import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma: PrismaClient = globalThis.__prisma ?? new PrismaClient();

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

