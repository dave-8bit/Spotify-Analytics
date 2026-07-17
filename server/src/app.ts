import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

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

export default app;

