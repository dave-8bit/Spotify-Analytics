import axios from "axios";

import type {
  Album,
  Artist,
  DbArtist,
  DbTrack,
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



