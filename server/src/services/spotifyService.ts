// LEGACY SHIM (ARCHITECTURE.md §5 migration note). The implementation moved to
// ingestion/providers/spotify/ in M2. This file preserves the old
// userId-keyed call signature for routes/analytics.ts's Spotify proxy
// endpoints (top-tracks / top-artists), which retire when snapshot reads land
// in M6. Delete this file when nothing imports it.

export {
  spotifyGetForUser as spotifyGet,
  getValidAccessTokenForUser as getValidAccessToken,
} from "../ingestion/providers/spotify/client";
