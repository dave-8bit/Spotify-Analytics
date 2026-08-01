// Insight prompt builder (M7, ARCHITECTURE.md §4.7): reads bounded snapshot
// data — never raw events — and assembles a compact prompt. Cost control by
// design: only the top-N rows of each precomputed snapshot window are sent,
// never PlayEvent rows. Pure module: no Prisma, no bus, no provider calls.

import type { InsightKind } from "../events/types";

// Bounded context sizes (§4.7 "reads bounded snapshot data"). Top-N per list
// keeps the prompt small and the token cost predictable.
export const PROMPT_TOP_TRACKS = 10;
export const PROMPT_TOP_ARTISTS = 10;
export const PROMPT_TOP_ALBUMS = 5;

// The structured body the provider is asked to return. `highlights` is a
// short list of bullet-style strings; `summary` is 2–4 sentences.
export type InsightContent = {
  title: string;
  summary: string;
  highlights: string[];
};

// Bounded snapshot context handed to the prompt builder. Dates are ISO
// strings so the builder stays serializable and testable.
export type SnapshotContext = {
  periodStart: string;
  periodEnd: string;
  stats: {
    totalPlays: number;
    totalMinutes: number;
    uniqueTracks: number;
    uniqueArtists: number;
  } | null;
  topTracks: { trackName: string; artistName: string; plays: number }[];
  topArtists: { artistName: string; plays: number }[];
  topAlbums: { albumName: string; artistName: string | null; plays: number }[];
};

const fmtMinutes = (minutes: number): string => {
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
};

const truncate = (rows: string[], max: number): string =>
  rows.slice(0, max).join("\n");

const buildWeeklyRecapPrompt = (ctx: SnapshotContext): string => {
  const statsLines: string[] = [];
  if (ctx.stats) {
    statsLines.push(
      `- Total plays: ${ctx.stats.totalPlays}`,
      `- Total listening time: ${fmtMinutes(ctx.stats.totalMinutes)}`,
      `- Unique tracks: ${ctx.stats.uniqueTracks}`,
      `- Unique artists: ${ctx.stats.uniqueArtists}`
    );
  }

  const topTracksLines = ctx.topTracks.map(
    (t, i) => `${i + 1}. "${t.trackName}" by ${t.artistName} (${t.plays} plays)`
  );
  const topArtistsLines = ctx.topArtists.map(
    (a, i) => `${i + 1}. ${a.artistName} (${a.plays} plays)`
  );
  const topAlbumsLines = ctx.topAlbums.map(
    (a, i) =>
      `${i + 1}. ${a.albumName}${a.artistName ? ` by ${a.artistName}` : ""} (${a.plays} plays)`
  );

  return [
    `You are a music analyst writing a weekly listening recap for one user.`,
    `Period: ${ctx.periodStart} → ${ctx.periodEnd}.`,
    ``,
    `Here is the user's snapshot data for the period (already aggregated — top ${PROMPT_TOP_TRACKS} tracks, ${PROMPT_TOP_ARTISTS} artists, ${PROMPT_TOP_ALBUMS} albums):`,
    ``,
    ctx.stats ? `Overall stats:\n${statsLines.join("\n")}` : "Overall stats: unavailable",
    ``,
    topTracksLines.length
      ? `Top tracks:\n${truncate(topTracksLines, PROMPT_TOP_TRACKS)}`
      : "Top tracks: none in this period",
    ``,
    topArtistsLines.length
      ? `Top artists:\n${truncate(topArtistsLines, PROMPT_TOP_ARTISTS)}`
      : "Top artists: none in this period",
    ``,
    topAlbumsLines.length
      ? `Top albums:\n${truncate(topAlbumsLines, PROMPT_TOP_ALBUMS)}`
      : "Top albums: none in this period",
    ``,
    `Write a friendly, insightful recap of the user's listening week.`,
    `Return ONLY a JSON object (no markdown fences, no commentary) with exactly this shape:`,
    `{"title": string, "summary": string (2-4 sentences), "highlights": string[] (3-5 short bullets)}`,
    `The title should be catchy (max ~60 chars). The summary should reference actual artists/tracks from the data.`,
    `Do not invent data that is not present above.`,
  ].join("\n");
};

const buildTrendPrompt = (ctx: SnapshotContext): string =>
  buildWeeklyRecapPrompt(ctx); // v1: trend reuses the recap shape

const buildDiscoveryPrompt = (ctx: SnapshotContext): string =>
  buildWeeklyRecapPrompt(ctx); // v1: discovery reuses the recap shape

const builders: Record<InsightKind, (ctx: SnapshotContext) => string> = {
  weekly_recap: buildWeeklyRecapPrompt,
  trend: buildTrendPrompt,
  discovery: buildDiscoveryPrompt,
};

export const buildInsightPrompt = (
  kind: InsightKind,
  ctx: SnapshotContext
): string => {
  const builder = builders[kind] ?? buildWeeklyRecapPrompt;
  return builder(ctx);
};

