// Now Playing card (M5, ARCHITECTURE.md §5, §7.4): rendered only while the
// socket delivers playback:updated — playback state has no REST representation
// by design (ephemeral), so when the socket is offline or playback stops, the
// card simply hides. Progress advances locally between polls.

import { useEffect, useState } from "react";

import type { SocketPlaybackState } from "../types/socketEvents";

type Props = {
  playback: SocketPlaybackState;
};

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function NowPlayingCard({ playback }: Props) {
  // Interpolate progress between server polls while playing.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!playback.isPlaying) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [playback]);

  const baseProgress = playback.progressMs ?? 0;
  const elapsedSinceFetch = playback.isPlaying
    ? Math.max(0, nowMs - new Date(playback.fetchedAt).getTime())
    : 0;
  const duration = playback.track.durationMs ?? 0;
  const progress = duration
    ? Math.min(baseProgress + elapsedSinceFetch, duration)
    : baseProgress + elapsedSinceFetch;
  const progressPct = duration ? (progress / duration) * 100 : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        marginBottom: 16,
        background: "rgba(29,185,84,0.08)",
        border: "1px solid rgba(29,185,84,0.35)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 8,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          flex: "0 0 auto",
        }}
      >
        {playback.track.albumImage ? (
          <img
            src={playback.track.albumImage}
            alt="Album art"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#1DB954",
            marginBottom: 2,
          }}
        >
          {playback.isPlaying ? "Now Playing" : "Paused"}
        </div>
        <div
          style={{
            fontWeight: 900,
            fontSize: 15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {playback.track.name}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.65)",
            fontSize: 13,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {playback.track.artistName}
        </div>

        {duration > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              {formatMs(progress)}
            </span>
            <div
              style={{
                flex: 1,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "#1DB954",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
              {formatMs(duration)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
