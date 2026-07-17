// Shared session configuration (ARCHITECTURE.md §7.2, M1).
// Sessions are persisted in PostgreSQL via connect-pg-simple so they survive
// server restarts and can later be shared with the Socket.IO handshake (M4).
// The middleware is a lazily-created singleton: Express uses it today, and the
// future WebSocket Gateway will reuse the exact same instance.

import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import type { RequestHandler } from "express";

const PgSession = connectPgSimple(session);

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let pool: Pool | null = null;
let middleware: RequestHandler | null = null;

export const getSessionMiddleware = (): RequestHandler => {
  if (middleware) return middleware;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Session reads/writes are lightweight; keep the pool small so the main
    // Prisma pool retains most of the database's connection budget.
    max: 5,
  });

  middleware = session({
    store: new PgSession({
      pool,
      tableName: "session",
      // The table is managed by a Prisma migration; never auto-create.
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: SESSION_MAX_AGE_MS,
    },
  });

  return middleware;
};

export const closeSessionStore = async (): Promise<void> => {
  if (!pool) return;

  const closing = pool;
  pool = null;
  middleware = null;

  try {
    await closing.end();
  } catch {
    // Best-effort: shutdown must not fail because the pool was already closed.
  }
};
