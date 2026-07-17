import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { getSessionMiddleware } from "./config/session";
import authRoutes from "./routes/auth";
import analyticsRoutes from "./routes/analytics";

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
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/api/user", analyticsRoutes);

export default app;

