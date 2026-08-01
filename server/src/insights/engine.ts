// Insights Engine (M7, ARCHITECTURE.md §4.7): generates narrative insights
// from snapshots/derived analytics — never raw events, never direct provider
// queries. The sole writer of the Insight table (§6.1).
//
// Pipeline: insight.requested → per-user in-flight guard (never two concurrent
// generations for one user) → cache check (skip duplicate daily generation for
// the same kind) → read bounded snapshot data → build compact prompt → call
// the provider-agnostic InsightProvider → validate + persist → publish
// insight.generated. Any failure degrades to "no new insight" (§4.7) — the bus
// subscriber never throws, so a failing generation never breaks the publisher
// or other subscribers.

import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { getGroqApiKey } from "../config/env";
import { eventBus } from "../events/bus";
import type { InsightKind, InsightPayload } from "../events/types";
import {
  computeTopAlbumsSince,
  computeTopArtistsSince,
  computeTopTracksSince,
} from "../analytics/computations";
import {
  buildInsightPrompt,
  PROMPT_TOP_ALBUMS,
  PROMPT_TOP_ARTISTS,
  PROMPT_TOP_TRACKS,
  type InsightContent,
  type SnapshotContext,
} from "./prompts";
import type { InsightProvider } from "./provider";
import { groqInsightProvider } from "./providers/groq";

// §4.7 "caches per period": a requested kind is generated at most once per
// 23 hours. The hourly slack keeps the daily job + an on-demand request from
// both firing in the same day (and from racing at the boundary).
export const INSIGHT_CACHE_WINDOW_MS = 23 * 60 * 60 * 1000;

// The lookback window for the snapshot context fed to the model.
const INSIGHT_PERIOD_DAYS = 7;

const log = (userId: number, message: string): void => {
  console.log(`[insights] userId=${userId} ${message}`);
};

// ── Snapshot context assembly (bounding prompt size) ───────────────────────
// Reads precomputed snapshots when present; falls back to the Analytics
// Engine's pure computation functions only when a snapshot row is missing
// (same seam the REST fallback uses). Never queries PlayEvent directly.

type SnapshotJsonRow = {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  _count?: { trackId?: number; artistId?: number; albumId?: number };
};

const playsFromRow = (
  row: SnapshotJsonRow,
  countKey: "trackId" | "artistId" | "albumId"
): number => row._count?.[countKey] ?? 0;

const readTopSnapshot = async (
  userId: number,
  type: string,
  timeRange: string
): Promise<SnapshotJsonRow[]> => {
  const snapshot = await prisma.topSnapshot.findUnique({
    where: {
      userId_type_timeRange: { userId, type, timeRange },
    },
  });
  return Array.isArray(snapshot?.data)
    ? (snapshot.data as SnapshotJsonRow[])
    : [];
};

const readTopTracks = async (userId: number): Promise<SnapshotContext["topTracks"]> => {
  const snapshot = await readTopSnapshot(userId, "tracks", "28d");
  if (snapshot.length) {
    return snapshot
      .slice(0, PROMPT_TOP_TRACKS)
      .map((row) => ({
        trackName: row.trackName ?? "Unknown track",
        artistName: row.artistName ?? "Unknown artist",
        plays: playsFromRow(row, "trackId"),
      }));
  }
  // Fallback (no snapshot yet): same pure functions the Analytics Engine writes with.
  const rows = await computeTopTracksSince(userId, new Date(Date.now() - INSIGHT_PERIOD_DAYS * 24 * 60 * 60 * 1000));
  return rows.slice(0, PROMPT_TOP_TRACKS).map((row) => ({
    trackName: row.trackName,
    artistName: row.artistName,
    plays: row._count.trackId,
  }));
};

const readTopArtists = async (userId: number): Promise<SnapshotContext["topArtists"]> => {
  const snapshot = await readTopSnapshot(userId, "artists", "28d");
  if (snapshot.length) {
    return snapshot
      .slice(0, PROMPT_TOP_ARTISTS)
      .map((row) => ({
        artistName: row.artistName ?? "Unknown artist",
        plays: playsFromRow(row, "artistId"),
      }));
  }
  const rows = await computeTopArtistsSince(userId, new Date(Date.now() - INSIGHT_PERIOD_DAYS * 24 * 60 * 60 * 1000));
  return rows.slice(0, PROMPT_TOP_ARTISTS).map((row) => ({
    artistName: row.artistName,
    plays: row._count.artistId,
  }));
};

const readTopAlbums = async (userId: number): Promise<SnapshotContext["topAlbums"]> => {
  const snapshot = await readTopSnapshot(userId, "albums", "28d");
  if (snapshot.length) {
    return snapshot
      .slice(0, PROMPT_TOP_ALBUMS)
      .map((row) => ({
        albumName: row.albumName ?? "Unknown album",
        artistName: null,
        plays: playsFromRow(row, "albumId"),
      }));
  }
  const rows = await computeTopAlbumsSince(userId, new Date(Date.now() - INSIGHT_PERIOD_DAYS * 24 * 60 * 60 * 1000));
  return rows.slice(0, PROMPT_TOP_ALBUMS).map((row) => ({
    albumName: row.albumName,
    artistName: null,
    plays: row._count.albumId,
  }));
};

const readSnapshotContext = async (userId: number): Promise<SnapshotContext> => {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - INSIGHT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const [stats, topTracks, topArtists, topAlbums] = await Promise.all([
    prisma.statsSnapshot.findUnique({ where: { userId } }),
    readTopTracks(userId),
    readTopArtists(userId),
    readTopAlbums(userId),
  ]);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    stats: stats
      ? {
          totalPlays: stats.totalPlays,
          totalMinutes: stats.totalMinutes,
          uniqueTracks: stats.uniqueTracks,
          uniqueArtists: stats.uniqueArtists,
        }
      : null,
    topTracks,
    topArtists,
    topAlbums,
  };
};

// ── Content validation + persistence ───────────────────────────────────────
const isValidInsightContent = (content: Record<string, unknown>): content is InsightContent =>
  typeof content.title === "string" &&
  content.title.length > 0 &&
  typeof content.summary === "string" &&
  content.summary.length > 0;

const toInsightPayload = (row: {
  id: number;
  userId: number;
  kind: string;
  content: Prisma.JsonValue;
  model: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
}): InsightPayload => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind,
  content: (row.content as Record<string, unknown>) ?? {},
  model: row.model,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  generatedAt: row.generatedAt.toISOString(),
});

const persistInsight = async (
  userId: number,
  kind: InsightKind,
  content: InsightContent,
  model: string,
  periodStart: Date,
  periodEnd: Date
): Promise<InsightPayload> => {
  const row = await prisma.insight.create({
    data: {
      userId,
      kind,
      content: content as unknown as Prisma.InputJsonValue,
      model,
      periodStart,
      periodEnd,
    },
  });
  return toInsightPayload(row);
};

// ── Generation (runs only under the per-user in-flight guard) ──────────────
const generate = async (
  userId: number,
  kind: InsightKind,
  provider: InsightProvider = groqInsightProvider
): Promise<InsightPayload | null> => {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - INSIGHT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const context = await readSnapshotContext(userId);
  const userPrompt = buildInsightPrompt(kind, context);

  const result = await provider.generate({
    system:
      "You generate JSON listening insights from precomputed music analytics. Always respond with valid JSON.",
    user: userPrompt,
  });

  const content = result.content;
  if (!isValidInsightContent(content)) {
    log(userId, `provider returned invalid content for kind=${kind}, skipping`);
    return null;
  }

  const payload = await persistInsight(
    userId,
    kind,
    content,
    result.model,
    periodStart,
    periodEnd
  );
  log(userId, `generated insight kind=${kind} model=${result.model}`);
  return payload;
};

// ── Per-user in-flight guard + cache/dup prevention ────────────────────────
const inFlight = new Set<number>();

const alreadyGeneratedThisWindow = async (
  userId: number,
  kind: InsightKind
): Promise<boolean> => {
  const latest = await prisma.insight.findFirst({
    where: { userId, kind },
    orderBy: { generatedAt: "desc" },
    select: { generatedAt: true },
  });
  if (!latest) {
    return false;
  }
  return Date.now() - latest.generatedAt.getTime() < INSIGHT_CACHE_WINDOW_MS;
};

// Entry point: the bus subscriber calls this; REST/Workers publish
// insight.requested. Fire-and-forget-safe: never throws (callers use `void`).
export const generateInsight = async (
  userId: number,
  kind: InsightKind
): Promise<void> => {
  // §4.7 graceful degradation: no key configured → skip, never crash.
  if (!getGroqApiKey()) {
    log(userId, `insight requested (kind=${kind}) but GROQ_API_KEY is not set — skipping`);
    return;
  }

  if (inFlight.has(userId)) {
    log(userId, `generation already in flight, absorbing duplicate request`);
    return;
  }
  inFlight.add(userId);

  try {
    if (await alreadyGeneratedThisWindow(userId, kind)) {
      log(userId, `kind=${kind} already generated within cache window, skipping`);
      return;
    }

    const payload = await generate(userId, kind);
    if (payload) {
      eventBus.publish("insight.generated", { userId, insight: payload });
    }
  } catch (error) {
    // §4.7: "Does not block any request path; failures degrade to no new insight."
    console.error(`[insights] userId=${userId} generation failed for kind=${kind}`, error);
  } finally {
    inFlight.delete(userId);
  }
};

// Bus wiring: REST (on-demand) and the daily job both publish insight.requested.
export const registerInsightSubscribers = (): (() => void) =>
  eventBus.subscribe("insight.requested", ({ userId, kind }) => {
    void generateInsight(userId, kind);
  });

