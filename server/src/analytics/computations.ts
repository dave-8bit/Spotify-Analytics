// Pure aggregate computations (ARCHITECTURE.md §4.3, §9.3): input userId +
// window, output aggregate rows. No snapshot writes, no bus, no HTTP. The same
// functions serve three callers with identical results: the Analytics Engine
// (writes snapshots), the REST fallback on snapshot miss (§3.3), and
// rebuildSnapshots (maintenance/backfill).

import prisma from "../config/prisma";

// Snapshot windows — §6.2 TopSnapshot.timeRange: "3d" | "28d" | "180d" | "all".
export const SNAPSHOT_WINDOWS = [
  { key: "3d", days: 3 },
  { key: "28d", days: 28 },
  { key: "180d", days: 180 },
  { key: "all", days: null },
] as const;

export type SnapshotWindowKey = (typeof SNAPSHOT_WINDOWS)[number]["key"];

export const TOP_TYPES = ["tracks", "artists", "albums"] as const;
export type TopType = (typeof TOP_TYPES)[number];

// Limits match the pre-M6 inline route queries exactly.
export const TOP_TRACK_LIMIT = 50;
export const TOP_ARTIST_LIMIT = 50;
export const TOP_ALBUM_LIMIT = 20;

// Maps a `days` query param onto a snapshot window, or null when the request
// is for a non-precomputed window (REST then computes on read).
export const windowKeyForDays = (days: number): SnapshotWindowKey | null => {
  const window = SNAPSHOT_WINDOWS.find((w) => w.days === days);
  return window ? window.key : null;
};

const windowStart = (key: SnapshotWindowKey, now: Date): Date | null => {
  const window = SNAPSHOT_WINDOWS.find((w) => w.key === key);
  if (!window || window.days === null) {
    return null;
  }
  return new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000);
};

const playedAtWhere = (userId: number, since: Date | null) => ({
  userId,
  ...(since ? { playedAt: { gte: since } } : {}),
});

export type StatsAggregates = {
  totalPlays: number;
  totalMinutes: number;
  uniqueTracks: number;
  uniqueArtists: number;
};

export type TopTrackRow = {
  trackId: string;
  trackName: string;
  artistName: string;
  albumImage: string | null;
  _count: { trackId: number };
  _sum: { durationMs: number | null };
};

export type TopArtistRow = {
  artistId: string;
  artistName: string;
  _count: { artistId: number };
  _sum: { durationMs: number | null };
};

export type TopAlbumRow = {
  albumId: string;
  albumName: string;
  albumImage: string | null;
  _count: { albumId: number };
  _sum: { durationMs: number | null };
};

// All-time stats — the source of StatsSnapshot and of the /stats fallback.
// Same queries the route ran inline pre-M6.
export const computeStats = async (userId: number): Promise<StatsAggregates> => {
  const [totalPlays, groupedByTrack, groupedByArtist, sumDuration] =
    await Promise.all([
      prisma.playEvent.count({ where: { userId } }),
      prisma.playEvent.groupBy({ by: ["trackId"], where: { userId } }),
      prisma.playEvent.groupBy({ by: ["artistId"], where: { userId } }),
      prisma.playEvent.aggregate({
        _sum: { durationMs: true },
        where: { userId },
      }),
    ]);

  return {
    totalPlays,
    totalMinutes: (sumDuration._sum.durationMs ?? 0) / 60000,
    uniqueTracks: groupedByTrack.length,
    uniqueArtists: groupedByArtist.length,
  };
};

// `Since` variants take an explicit cutoff so REST can serve arbitrary `days`
// params; window variants are the snapshot-aligned wrappers.
//
// Note: the groupBy args must not be contextually typed by an annotated return
// type — Prisma infers the result shape from the literal args, so each call is
// awaited first and the rows returned as the declared row type.

export const computeTopTracksSince = async (
  userId: number,
  since: Date | null
): Promise<TopTrackRow[]> => {
  const rows = await prisma.playEvent.groupBy({
    by: ["trackId", "trackName", "artistName", "albumImage"],
    where: playedAtWhere(userId, since),
    orderBy: { _count: { trackId: "desc" } },
    take: TOP_TRACK_LIMIT,
    _count: { trackId: true },
    _sum: { durationMs: true },
  });
  return rows;
};

export const computeTopArtistsSince = async (
  userId: number,
  since: Date | null
): Promise<TopArtistRow[]> => {
  const rows = await prisma.playEvent.groupBy({
    by: ["artistId", "artistName"],
    where: playedAtWhere(userId, since),
    orderBy: { _count: { artistId: "desc" } },
    take: TOP_ARTIST_LIMIT,
    _count: { artistId: true },
    _sum: { durationMs: true },
  });
  return rows;
};

export const computeTopAlbumsSince = async (
  userId: number,
  since: Date | null
): Promise<TopAlbumRow[]> => {
  const rows = await prisma.playEvent.groupBy({
    by: ["albumId", "albumName", "albumImage"],
    where: playedAtWhere(userId, since),
    orderBy: { _count: { albumId: "desc" } },
    take: TOP_ALBUM_LIMIT,
    _count: { albumId: true },
    _sum: { durationMs: true },
  });
  return rows;
};

export const computeTopTracks = (
  userId: number,
  window: SnapshotWindowKey,
  now: Date = new Date()
): Promise<TopTrackRow[]> =>
  computeTopTracksSince(userId, windowStart(window, now));

export const computeTopArtists = (
  userId: number,
  window: SnapshotWindowKey,
  now: Date = new Date()
): Promise<TopArtistRow[]> =>
  computeTopArtistsSince(userId, windowStart(window, now));

export const computeTopAlbums = (
  userId: number,
  window: SnapshotWindowKey,
  now: Date = new Date()
): Promise<TopAlbumRow[]> =>
  computeTopAlbumsSince(userId, windowStart(window, now));
