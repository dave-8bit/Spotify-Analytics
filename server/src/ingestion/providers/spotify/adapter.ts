// SpotifyAdapter — implements MusicProviderAdapter (ARCHITECTURE.md §4.1).
// Fetches and translates; owns nothing about scheduling, persistence decisions,
// or analytics.

import type {
  CanonicalPlaybackState,
  CanonicalTopItem,
  MusicProviderAdapter,
  PlayHistoryPage,
  ProviderAccountRecord,
  ProviderCredentials,
  TopItemKind,
  TopItemRange,
} from "../../types";
import { refreshCredentials, spotifyGet } from "./client";
import {
  normalizePlayHistory,
  normalizePlayback,
  type SpotifyPlaybackResponse,
  type SpotifyRecentlyPlayedResponse,
} from "./normalize";

const HISTORY_PAGE_LIMIT = "50";

class SpotifyAdapter implements MusicProviderAdapter {
  readonly provider = "spotify" as const;

  async fetchPlayHistory(
    account: ProviderAccountRecord,
    cursor?: string | null
  ): Promise<PlayHistoryPage> {
    const params: Record<string, string> = { limit: HISTORY_PAGE_LIMIT };
    if (cursor) {
      // Spotify `after` cursor: ms timestamp; only plays after it are returned.
      params.after = cursor;
    }

    const response = await spotifyGet<SpotifyRecentlyPlayedResponse>(
      account,
      "/me/player/recently-played",
      params
    );

    const events = normalizePlayHistory(response);

    // Prefer Spotify's own cursor; fall back to the newest playedAt so the
    // cursor always advances when items exist.
    const newestPlayedAtMs = events.length
      ? Math.max(...events.map((event) => event.playedAt.getTime()))
      : null;
    const nextCursor =
      response.cursors?.after ??
      (newestPlayedAtMs !== null ? String(newestPlayedAtMs) : null);

    return { events, nextCursor };
  }

  async fetchCurrentPlayback(
    account: ProviderAccountRecord
  ): Promise<CanonicalPlaybackState | null> {
    const response = await spotifyGet<SpotifyPlaybackResponse | null>(
      account,
      "/me/player/currently-playing"
    );
    return normalizePlayback(response);
  }

  async fetchTopItems(
    account: ProviderAccountRecord,
    kind: TopItemKind,
    range: TopItemRange
  ): Promise<CanonicalTopItem[]> {
    const response = await spotifyGet<{ items: unknown[] }>(
      account,
      `/me/top/${kind}`,
      { time_range: range, limit: "50" }
    );

    return response.items.map((raw, index) => ({
      provider: this.provider,
      kind,
      rank: index + 1,
      raw,
    }));
  }

  async refreshCredentials(
    account: ProviderAccountRecord
  ): Promise<ProviderCredentials> {
    return refreshCredentials(account);
  }
}

export const spotifyAdapter = new SpotifyAdapter();
