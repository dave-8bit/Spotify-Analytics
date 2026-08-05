import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";

import { getSessionMiddleware } from "./config/session";
import authRoutes from "./routes/auth";
import analyticsRoutes from "./routes/analytics";
import {
  getSchedulerHeartbeat,
  isSchedulerRunning,
} from "./workers/scheduler";

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use(getSessionMiddleware());

app.get("/health", (_req, res) => {
  // Scheduler heartbeat (ARCHITECTURE.md §11.1): lastTickAt per job for
  // platform health probes. Empty when ROLE=api (no scheduler in-process).
  res.json({
    status: "ok",
    scheduler: {
      running: isSchedulerRunning(),
      lastTickAt: getSchedulerHeartbeat(),
    },
  });
});

app.use("/auth", authRoutes);
app.use("/api/user", analyticsRoutes);

// Production static serving (P1): serve the built React client from
// client/dist on the same origin as the API/WebSocket. In development the
// Vite dev server on :5173 proxies /api, /auth, and /socket.io — nothing here
// runs, so local dev behavior is unchanged.
const CLIENT_DIST_DIR = path.resolve(
  __dirname,
  "../../client/dist"
);

if (process.env.NODE_ENV === "production" && fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR));

  // SPA fallback: serve index.html for any non-API GET that isn't an existing
  // static asset. This must never intercept /api, /auth, /health, or
  // /socket.io (mounted above), and must not shadow real static files.
  // Uses a path-less middleware (not app.get("*")) because Express 5's
  // path-to-regexp v8 rejects the bare "*" wildcard.
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    if (req.path.startsWith("/auth")) {
      next();
      return;
    }
    if (req.path.startsWith("/health")) {
      next();
      return;
    }
    if (req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    // Remaining GETs are client-side routes. If the path resolves to a real
    // static file, express.static already handled it above; otherwise fall
    // back to index.html for BrowserRouter.
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
} else if (process.env.NODE_ENV === "production") {
  console.warn(
    `[app] NODE_ENV=production but client build not found at ${CLIENT_DIST_DIR}; ` +
      "serving API only. Build the client before deploying."
  );
}

export default app;

