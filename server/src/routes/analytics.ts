import { Router, Request, Response } from "express";
import prisma from "../config/prisma";
import { requireAuth, getSession } from "../middleware/auth";
import { spotifyGet } from "../services/spotifyService";
import { triggerSync } from "../services/syncService";
import type { TimeRange } from "../types";

const router = Router();

router.use(requireAuth);

router.get("/sync", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  void triggerSync(userId);
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

  const albums = await prisma.playEvent.groupBy({
    by: ["albumId", "albumName", "albumImage"],
    where: { userId },
    orderBy: { _count: { albumId: "desc" } },
    take: 20,
  });

  res.json({ data: albums });
});

router.get("/top-tracks-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tracks = await prisma.playEvent.groupBy({
    by: ["trackId", "trackName", "artistName", "albumImage"],
    where: { userId, playedAt: { gte: since } },
    orderBy: { _count: { trackId: "desc" } },
    take: 50,
  });

  res.json({ data: tracks });
});

router.get("/top-artists-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const artists = await prisma.playEvent.groupBy({
    by: ["artistId", "artistName"],
    where: { userId, playedAt: { gte: since } },
    orderBy: { _count: { artistId: "desc" } },
    take: 50,
  });

  res.json({ data: artists });
});

router.get("/top-albums-db", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const days = Number(req.query.days ?? 28);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const albums = await prisma.playEvent.groupBy({
    by: ["albumId", "albumName", "albumImage"],
    where: { userId, playedAt: { gte: since } },
    orderBy: { _count: { albumId: "desc" } },
    take: 20,
  });

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

  const tracks = await prisma.playEvent.groupBy({
    by: ["trackId", "trackName", "artistName", "albumImage"],
    where: { userId },
    orderBy: { _count: { trackId: "desc" } },
    take: 20,
  });

  res.json({ data: tracks });
});

router.get("/stats", async (req: Request, res: Response) => {
  const session = getSession(req);
  const userId = session.userId!;

  const [totalPlays, groupedByTrack, groupedByArtist] = await Promise.all([
    prisma.playEvent.count({ where: { userId } }),
    prisma.playEvent.groupBy({
      by: ["trackId"],
      where: { userId },
    }),
    prisma.playEvent.groupBy({
      by: ["artistId"],
      where: { userId },
    }),
  ]);

  const sumDuration = await prisma.playEvent.aggregate({
    _sum: { durationMs: true },
    where: { userId },
  });

  const totalMinutes = (sumDuration._sum.durationMs ?? 0) / 60000;

  res.json({
    totalPlays,
    totalMinutes,
    uniqueTracks: groupedByTrack.length,
    uniqueArtists: groupedByArtist.length,
  });
});

export default router;

