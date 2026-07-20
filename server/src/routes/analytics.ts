import { Router, Request, Response } from "express";
import prisma from "../config/prisma";
import { requireAuth, getSession } from "../middleware/auth";
import { spotifyGet } from "../services/spotifyService";
import { eventBus } from "../events/bus";
import {
  computeStats,
  computeTopAlbumsSince,
  computeTopArtistsSince,
  computeTopTracksSince,
  windowKeyForDays,
  type SnapshotWindowKey,
  type TopType,
} from "../analytics/computations";
import type { TimeRange } from "../types";

const router = Router();

router.use(requireAuth);

// Snapshot-first read (ARCHITECTURE.md §3.3, M6): serve the precomputed
// TopSnapshot row when one exists; the caller computes on miss via the same
// pure functions the Analytics Engine used to write it. The fallback stays
// permanently — snapshots are rebuildable caches, not critical state.
const readTopSnapshot = async (
  userId: number,
  type: TopType,
  timeRange: SnapshotWindowKey
): Promise<unknown[] | null> => {
  const snapshot = await prisma.topSnapshot.findUnique({
    where: { userId_type_timeRange: { userId, type, timeRange } },
  });
  return snapshot && Array.isArray(snapshot.data)
    ? (snapshot.data as unknown[])
    : null;
};

const sinceFromDays = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

router.get("/sync", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  eventBus.publish("sync.requested", { userId, reason: "manual" });
  res.json({ success: true });
});

router.get("/top-tracks", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const timeRange = (req.query.time_range as TimeRange) ?? "medium_term";

  const response = await spotifyGet<{ items: unknown[] }>(
    userId,
    "/me/top/tracks",
    { time_range: String(timeRange), limit: "50" }
  );

  res.json({ data: response.items });
});

router.get("/top-artists", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const timeRange = (req.query.time_range as TimeRange) ?? "medium_term";

  const response = await spotifyGet<{ items: unknown[] }>(
    userId,
    "/me/top/artists",
    { time_range: String(timeRange), limit: "50" }
  );

  res.json({ data: response.items });
});

router.get("/top-albums", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const snapshot = await readTopSnapshot(userId, "albums", "all");
  if (snapshot) {
    res.json({ data: snapshot });
    return;
  }

  const albums = await computeTopAlbumsSince(userId, null);
  res.json({ data: albums });
});

router.get("/top-tracks-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);

  const windowKey = windowKeyForDays(days);
  if (windowKey) {
    const snapshot = await readTopSnapshot(userId, "tracks", windowKey);
    if (snapshot) {
      res.json({ data: snapshot });
      return;
    }
  }

  const tracks = await computeTopTracksSince(userId, sinceFromDays(days));
  res.json({ data: tracks });
});

router.get("/top-artists-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);

  const windowKey = windowKeyForDays(days);
  if (windowKey) {
    const snapshot = await readTopSnapshot(userId, "artists", windowKey);
    if (snapshot) {
      res.json({ data: snapshot });
      return;
    }
  }

  const artists = await computeTopArtistsSince(userId, sinceFromDays(days));
  res.json({ data: artists });
});

router.get("/top-albums-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);

  const windowKey = windowKeyForDays(days);
  if (windowKey) {
    const snapshot = await readTopSnapshot(userId, "albums", windowKey);
    if (snapshot) {
      res.json({ data: snapshot });
      return;
    }
  }

  const albums = await computeTopAlbumsSince(userId, sinceFromDays(days));
  res.json({ data: albums });
});

router.get("/recently-played", async (req: Request, res: Response) => {

  const session = getSession(req);
  const userId = session.userId!;

  const events = await prisma.playEvent.findMany({
    where: { userId },
    orderBy: { playedAt: "desc" },
    take: 50,
  });

  res.json({ data: events });
});

router.get("/most-played", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  // All-time top tracks; the snapshot holds 50 rows, this endpoint serves 20.
  const snapshot = await readTopSnapshot(userId, "tracks", "all");
  if (snapshot) {
    res.json({ data: snapshot.slice(0, 20) });
    return;
  }

  const tracks = await computeTopTracksSince(userId, null);
  res.json({ data: tracks.slice(0, 20) });
});

router.get("/stats", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  // Snapshot-first (§3.3): the StatsSnapshot row the Analytics Engine wrote.
  const snapshot = await prisma.statsSnapshot.findUnique({
    where: { userId },
  });

  if (snapshot) {
    res.json({
      totalPlays: snapshot.totalPlays,
      totalMinutes: snapshot.totalMinutes,
      uniqueTracks: snapshot.uniqueTracks,
      uniqueArtists: snapshot.uniqueArtists,
    });
    return;
  }

  // Miss → compute on read via the same pure function the engine writes with.
  const stats = await computeStats(userId);
  res.json(stats);
});

export default router;
