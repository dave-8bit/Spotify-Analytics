// Live connection indicator (ARCHITECTURE.md §5, M4; §7.4 degradation
// contract): green "Live" when the socket is connected, dim "Offline" when it
// isn't — the dashboard itself keeps working on REST either way.

type Props = {
  connected: boolean;
};

export default function LiveIndicator({ connected }: Props) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: connected
          ? "1px solid rgba(29,185,84,0.45)"
          : "1px solid rgba(255,255,255,0.12)",
        background: connected
          ? "rgba(29,185,84,0.12)"
          : "rgba(255,255,255,0.04)",
        fontSize: 12,
        fontWeight: 700,
        color: connected ? "#1DB954" : "rgba(255,255,255,0.5)",
      }}
      title={
        connected
          ? "Real-time updates active"
          : "Real-time updates unavailable — data still refreshes on demand"
      }
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: connected ? "#1DB954" : "rgba(255,255,255,0.35)",
        }}
      />
      {connected ? "Live" : "Offline"}
    </div>
  );
}
