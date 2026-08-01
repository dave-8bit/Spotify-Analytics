import axios from "axios";

import type {
  Album,
  Artist,
  DbArtist,
  DbTrack,
  Insight,
  RecentTrack,
  Stats,
  TimeRange,
  Track,
  User,
} from "../types";








export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});


export async function getMe(): Promise<User> {
  const res = await axios.get("/auth/me", { withCredentials: true });
  return res.data;
}

export async function triggerSync(): Promise<void> {
  await api.get("/user/sync");
}

export async function getTopTracks(timeRange: TimeRange): Promise<Track[]> {
  const res = await api.get("/user/top-tracks", {
    params: { time_range: timeRange },
  });
  return res.data.data;
}

export async function getTopArtists(timeRange: TimeRange): Promise<Artist[]> {
  const res = await api.get("/user/top-artists", {
    params: { time_range: timeRange },
  });
  return res.data.data;
}

export async function getTopAlbums(): Promise<Album[]> {
  const res = await api.get("/user/top-albums");
  return res.data.data;
}

export async function getRecentlyPlayed(): Promise<RecentTrack[]> {
  const res = await api.get("/user/recently-played");
  return res.data.data;
}

export async function getStats(): Promise<Stats> {
  const res = await api.get("/user/stats");
  return res.data;
}

export async function getTopTracksDb(days: number): Promise<DbTrack[]> {
  const res = await api.get("/user/top-tracks-db", { params: { days } });
  return res.data.data;
}

export async function getTopArtistsDb(
  days: number
): Promise<DbArtist[]> {
  const res = await api.get("/user/top-artists-db", { params: { days } });
  return res.data.data;
}

export async function getTopAlbumsDb(days: number): Promise<Album[]> {
  const res = await api.get("/user/top-albums-db", { params: { days } });
  return res.data.data;
}

// M7 (§4.7): AI insights — REST read of persisted Insight rows. The live
// insight:generated socket event enhances this; a missing socket degrades to
// this REST-loaded list (§7.4).
export async function getInsights(): Promise<Insight[]> {
  const res = await api.get("/user/insights");
  return res.data.data;
}

// M7: on-demand generation. The server accepts immediately and generates in
// the background (publishing insight:generated when the socket is live); the
// caller re-fetches via getInsights() to converge on REST.
export async function requestInsight(kind = "weekly_recap"): Promise<void> {
  await api.post("/user/insights/request", { kind });
}



