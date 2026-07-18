import { useEffect, useMemo, useState } from "react";

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
import {
  getMe,
  getRecentlyPlayed,
  getStats,
  getTopAlbums,
  getTopAlbumsDb,
  getTopArtists,
  getTopArtistsDb,
  getTopTracks,
  getTopTracksDb,
  triggerSync,
} from "../services/api";
import useSocket from "../hooks/useSocket";
import useLiveEvent from "../hooks/useLiveEvents";
import LiveIndicator from "../components/LiveIndicator";
import { socket } from "../services/socket";

type TabKey = "tracks" | "artists" | "albums" | "recent";

type RangeOption = {
  label: string;
  source: "db" | "spotify";
  days?: number;
  spotifyRange?: TimeRange;
};

function formatDurationMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutesAgo(playedAt: string) {
  const playedTime = new Date(playedAt);
  const now = new Date();
  const diffMs = now.getTime() - playedTime.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (Number.isNaN(diffMins)) return playedTime.toLocaleDateString();
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return playedTime.toLocaleDateString();
}

function glassCardStyle() {
  return {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
  } as const;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const rangeOptions: RangeOption[] = useMemo(
    () => [
      { label: "3 Days", source: "db", days: 3 },
      { label: "4 Weeks", source: "db", days: 28 },
      { label: "3 Months", source: "spotify", spotifyRange: "medium_term" },
      { label: "6 Months", source: "db", days: 180 },
      { label: "All Time", source: "spotify", spotifyRange: "long_term" },
    ],
    []
  );

  const initialSelectedRange = useMemo(
    () => rangeOptions.find((o) => o.label === "3 Months") ?? rangeOptions[0],
    [rangeOptions]
  );

  const [selectedRange, setSelectedRange] = useState<RangeOption>(
    initialSelectedRange
  );

  const dataSource = selectedRange.source;

  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabKey>("tracks");

  const [dbTracks, setDbTracks] = useState<DbTrack[]>([]);
  const [dbArtists, setDbArtists] = useState<DbArtist[]>([]);

  // M4 real-time layer (ARCHITECTURE.md §7): the socket *enhances* the
  // REST-loaded dashboard; every handler below patches state that REST already
  // populates, so a missing socket degrades to today's behavior.
  const { connected } = useSocket(true);

  useLiveEvent("sync:started", () => {
    setSyncing(true);
  });

  useLiveEvent("sync:completed", ({ newEvents }) => {
    setSyncing(false);
    if (newEvents > 0) {
      void getRecentlyPlayed().then(setRecentTracks).catch(() => {});
      void getStats().then(setStats).catch(() => {});
    }
  });

  useLiveEvent("sync:failed", () => {
    setSyncing(false);
  });

  useLiveEvent("playEvent:created", ({ event }) => {
    setRecentTracks((prev) => {
      if (prev.some((t) => t.id === event.id)) return prev;
      return [event, ...prev].slice(0, 50);
    });
  });

  useEffect(() => {
    // keep dataSource and selectedRange in sync
    if (selectedRange.source !== dataSource) {
      // no-op; selectedRange drives dataSource
    }
  }, [dataSource, selectedRange.source]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDbTracks([]);
      setDbArtists([]);
      setTracks([]);
      setArtists([]);
      setLoading(true);
      try {
        const mePromise = getMe();
        const statsPromise = getStats();
        const recentPromise = getRecentlyPlayed();

        let topTracksData: Track[] | DbTrack[];
        let topArtistsData: Artist[] | DbArtist[];
        let albumsResult: Album[];

        if (selectedRange.source === "db") {
          const days = selectedRange.days ?? 28;
          [topTracksData, topArtistsData, albumsResult] = await Promise.all([
            getTopTracksDb(days),
            getTopArtistsDb(days),
            getTopAlbumsDb(days),
          ]);
        } else {
          const spotifyRange = selectedRange.spotifyRange ?? "medium_term";
          [topTracksData, topArtistsData, albumsResult] = await Promise.all([
            getTopTracks(spotifyRange),
            getTopArtists(spotifyRange),
            getTopAlbums(),
          ]);
        }

        const [me, recentlyPlayedResult, statsResult] = await Promise.all([
          mePromise,
          recentPromise,
          statsPromise,
        ]);

        if (cancelled) return;

        setUser(me);
        setAlbums(albumsResult);
        setRecentTracks(recentlyPlayedResult);
        setStats(statsResult);

        if (selectedRange.source === "db") {
          setDbTracks(topTracksData as DbTrack[]);
          setDbArtists(topArtistsData as DbArtist[]);
          setTracks([]);
          setArtists([]);
        } else {
          setTracks(topTracksData as Track[]);
          setArtists(topArtistsData as Artist[]);
          setDbTracks([]);
          setDbArtists([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRange]);

  const refetchAll = async () => {
    const mePromise = getMe();
    const statsPromise = getStats();
    const recentPromise = getRecentlyPlayed();

    let topTracksData: Track[] | DbTrack[];
    let topArtistsData: Artist[] | DbArtist[];
    let albumsResult: Album[];

    if (selectedRange.source === "db") {
      const days = selectedRange.days ?? 28;
      [topTracksData, topArtistsData, albumsResult] = await Promise.all([
        getTopTracksDb(days),
        getTopArtistsDb(days),
        getTopAlbumsDb(days),
      ]);
    } else {
      const spotifyRange = selectedRange.spotifyRange ?? "medium_term";
      [topTracksData, topArtistsData, albumsResult] = await Promise.all([
        getTopTracks(spotifyRange),
        getTopArtists(spotifyRange),
        getTopAlbums(),
      ]);
    }

    const [me, recentlyPlayedResult, statsResult] = await Promise.all([
      mePromise,
      recentPromise,
      statsPromise,
    ]);

    setUser(me);
    setAlbums(albumsResult);
    setRecentTracks(recentlyPlayedResult);
    setStats(statsResult);

    if (selectedRange.source === "db") {
      setDbTracks(topTracksData as DbTrack[]);
      setDbArtists(topArtistsData as DbArtist[]);
      setTracks([]);
      setArtists([]);
    } else {
      setTracks(topTracksData as Track[]);
      setArtists(topArtistsData as Artist[]);
      setDbTracks([]);
      setDbArtists([]);
    }
  };

  const onSyncNow = async () => {
    setSyncing(true);
    // §7.3: sync:request replaces the polling REST call when the socket is
    // live — the sync:completed / sync:failed handlers clear the spinner and
    // refresh data. REST stays as the offline fallback (§7.4).
    if (connected) {
      socket.emit("sync:request", () => {});
      return;
    }
    try {
      await triggerSync();
      await refetchAll();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fff",
        padding: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: -0.6,
              color: "#1DB954",
            }}
          >
            Wrapped365
          </div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Your music story, updated every play
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <LiveIndicator connected={connected} />

          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {user?.displayName ?? ""}
            </div>
          </div>

          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              overflow: "hidden",
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt="User avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ color: "rgba(255,255,255,0.6)" }}>👤</span>
            )}
          </div>

          <button
            type="button"
            onClick={onSyncNow}
            disabled={syncing}
            style={{
              cursor: syncing ? "not-allowed" : "pointer",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(29,185,84,0.35)",
              background: syncing ? "rgba(29,185,84,0.25)" : "#1DB954",
              color: syncing ? "rgba(255,255,255,0.9)" : "#071309",
              fontWeight: 900,
            }}
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: "Total Plays",
            value: stats?.totalPlays ?? 0,
          },
          {
            label: "Total Minutes",
            value: stats ? Math.round(stats.totalMinutes) : 0,
          },
          {
            label: "Unique Tracks",
            value: stats?.uniqueTracks ?? 0,
          },
          {
            label: "Unique Artists",
            value: stats?.uniqueArtists ?? 0,
          },
        ].map((c, idx) => (
          <div
            key={idx}
            style={{
              ...glassCardStyle(),
              padding: 14,
              minHeight: 72,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>
              {c.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {/* Time range selector */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {rangeOptions.map((opt) => {
          const isActive = opt.label === selectedRange.label;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSelectedRange(opt)}
              style={{
                cursor: "pointer",
                padding: "10px 12px",
                borderRadius: 12,
                border: isActive
                  ? "1px solid rgba(29,185,84,0.65)"
                  : "1px solid rgba(255,255,255,0.1)",
                background: isActive
                  ? "rgba(29,185,84,0.22)"
                  : "rgba(255,255,255,0.04)",
                color: isActive ? "#1DB954" : "rgba(255,255,255,0.85)",
                fontWeight: 900,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { key: "tracks" as const, label: "Top Tracks" },
            { key: "artists" as const, label: "Top Artists" },
            { key: "albums" as const, label: "Top Albums" },
            { key: "recent" as const, label: "Recently Played" },
          ].map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  cursor: "pointer",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: isActive
                    ? "1px solid rgba(29,185,84,0.65)"
                    : "1px solid rgba(255,255,255,0.1)",
                  background: isActive
                    ? "rgba(29,185,84,0.22)"
                    : "rgba(255,255,255,0.04)",
                  color: isActive ? "#1DB954" : "rgba(255,255,255,0.85)",
                  fontWeight: 900,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "rgba(255,255,255,0.75)", textAlign: "center" }}>
          Loading...
        </div>
      ) : (
        <div>
          {activeTab === "tracks" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dataSource === "db" &&
                dbTracks
                  .filter(
                    (t): t is DbTrack =>
                      t != null && typeof t.trackId === "string"
                  )
                  .map((t, idx) => (
                    <div
                      key={t.trackId}
                      style={{
                        ...glassCardStyle(),
                        padding: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          flex: "0 0 auto",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {t.albumImage ? (
                          <img
                            src={t.albumImage}
                            alt={t.trackName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ color: "rgba(255,255,255,0.5)" }}>🎵</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              color: "rgba(255,255,255,0.55)",
                              fontSize: 12,
                            }}
                          >
                            #{idx + 1}
                          </div>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 14,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {t.trackName}
                          </div>
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
                          {t.artistName}
                        </div>
                      </div>

                      <div
                        style={{
                          color: "rgba(255,255,255,0.75)",
                          fontWeight: 800,
                        }}
                      >
                        {t._count?.trackId ?? 0}
                      </div>
                    </div>
                  ))}

              {dataSource === "spotify" &&
                tracks.map((t, idx) => (
                  <div
                    key={t.id}
                    style={{
                      ...glassCardStyle(),
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        flex: "0 0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {t.album.images[0]?.url ? (
                        <img
                          src={t.album.images[0].url}
                          alt={t.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>🎵</span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            color: "rgba(255,255,255,0.55)",
                            fontSize: 12,
                          }}
                        >
                          #{idx + 1}
                        </div>
                        <div
                          style={{
                            fontWeight: 900,
                            fontSize: 14,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {t.name}
                        </div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
                        {t.artists[0]?.name ?? ""}
                      </div>
                    </div>

                    <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800 }}>
                      {formatDurationMs(t.duration_ms)}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === "artists" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {dataSource === "db" &&
                dbArtists
                  .filter(
                    (a): a is DbArtist =>
                      a != null && typeof a.artistId === "string"
                  )
                  .map((a) => (
                    <div
                      key={a.artistId}
                      style={{
                        ...glassCardStyle(),
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        minHeight: 170,
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: 999,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>🎤</span>
                      </div>

                      <div style={{ fontWeight: 900 }}>{a.artistName}</div>
                      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                        Plays: {a._count?.artistId ?? 0}
                      </div>
                    </div>
                  ))}

              {dataSource === "spotify" &&
                artists.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      ...glassCardStyle(),
                      padding: 12,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      minHeight: 170,
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 999,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {a.images[0]?.url ? (
                        <img
                          src={a.images[0].url}
                          alt={a.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>🎤</span>
                      )}
                    </div>

                    <div style={{ fontWeight: 900 }}>{a.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                      Top genre: {a.genres[0] ?? "—"}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {activeTab === "albums" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {albums.map((al) => (
                <div
                  key={al.albumId}
                  style={{
                    ...glassCardStyle(),
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    minHeight: 190,
                  }}
                >
                  <div
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 14,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {al.albumImage ? (
                      <img
                        src={al.albumImage}
                        alt={al.albumName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>💿</span>
                    )}
                  </div>

                  <div style={{ fontWeight: 900, fontSize: 14 }}>{al.albumName}</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                    Plays: {al._count?.albumId ?? 0}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "recent" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {recentTracks.map((r) => (
                <div
                  key={r.id}
                  style={{
                    ...glassCardStyle(),
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      flex: "0 0 auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {r.albumImage ? (
                      <img
                        src={r.albumImage}
                        alt={r.trackName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.5)" }}>🎵</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.trackName}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>
                      {r.artistName}
                    </div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.75)", fontWeight: 800, fontSize: 13 }}>
                    {formatMinutesAgo(r.playedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

