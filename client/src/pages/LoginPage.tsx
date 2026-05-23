import { useMemo } from "react";

function SpotifyLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2.5C6.75 2.5 2.5 6.75 2.5 12C2.5 17.25 6.75 21.5 12 21.5C17.25 21.5 21.5 17.25 21.5 12C21.5 6.75 17.25 2.5 12 2.5Z"
        fill="#1DB954"
        opacity="0.15"
      />
      <path
        d="M7.2 10.45C11.0 8.8 16.9 9.45 18.9 11.05"
        stroke="#1DB954"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.7 13.05C10.75 11.9 16.0 12.4 17.75 13.6"
        stroke="#1DB954"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M8.2 15.5C10.4 14.7 14.5 15.0 16.0 15.9"
        stroke="#1DB954"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export default function LoginPage() {
  const notes = useMemo(
    () => ["♪", "♫", "♬", "♩", "♭", "♮"],
    []
  );

  const onConnect = () => {
    window.location.href = "/auth/spotify";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        color: "#fff",
      }}
    >
      {/* Animated background orbs */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        {[
          { left: "-10%", top: "15%", size: 240, opacity: 0.22, dur: 14 },
          { left: "70%", top: "-12%", size: 320, opacity: 0.18, dur: 18 },
          { left: "60%", top: "65%", size: 260, opacity: 0.16, dur: 16 },
          { left: "-20%", top: "65%", size: 220, opacity: 0.14, dur: 20 },
        ].map((o, idx) => (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: o.left,
              top: o.top,
              width: o.size,
              height: o.size,
              borderRadius: "999px",
              background:
                "radial-gradient(circle at 30% 30%, rgba(29,185,84,0.55), rgba(29,185,84,0) 60%)",
              filter: "blur(10px)",
              opacity: o.opacity,
              animation: `floatOrb${idx} ${o.dur}s ease-in-out infinite`,
            }}
          />
        ))}

        {/* Floating music notes */}
        {Array.from({ length: 14 }).map((_, i) => {
          const note = notes[i % notes.length];
          const left = (i * 7 + 11) % 100;
          const delay = i * 0.6;
          const dur = 10 + (i % 5) * 2;
          const size = 14 + (i % 4) * 6;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: "110%",
                fontSize: size,
                color: "rgba(255,255,255,0.75)",
                textShadow: "0 0 14px rgba(29,185,84,0.35)",
                animation: `floatNote${i} ${dur}s linear infinite`,
                animationDelay: `${delay}s`,
              }}
              aria-hidden="true"
            >
              {note}
            </div>
          );
        })}
      </div>

      {/* Glass card */}
      <div
        style={{
          width: "min(520px, 100%)",
          borderRadius: 18,
          background: "rgba(20, 20, 20, 0.55)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow:
            "0 20px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(29,185,84,0.06) inset",
          position: "relative",
          zIndex: 1,
          padding: "28px 26px",
        }}
      >
        {/* Inline keyframes */}
        <style>{`
          @keyframes floatOrb0 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(18px, -26px) } }
          @keyframes floatOrb1 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-22px, 20px) } }
          @keyframes floatOrb2 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(16px, 18px) } }
          @keyframes floatOrb3 { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-10px, -18px) } }

          ${Array.from({ length: 14 })
            .map((_, i) => {
              const drift = (i % 6) * 10 - 25;
              return `@keyframes floatNote${i} { 0% { transform: translate(-50%, 0) scale(1); opacity: 0; } 10% { opacity: 0.9; } 100% { transform: translate(${drift}px, -160vh) scale(1.05); opacity: 0; } }`;
            })
            .join("\n")}
        `}</style>

        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 900,
              letterSpacing: -0.8,
              lineHeight: 1.05,
              background:
                "linear-gradient(90deg, #1DB954 0%, #38e36b 55%, #8dffb1 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              marginBottom: 10,
              filter: "drop-shadow(0 10px 30px rgba(29,185,84,0.18))",
            }}
          >
            Wrapped365
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 15,
              color: "rgba(255,255,255,0.78)",
              marginBottom: 22,
            }}
          >
            Your music story, updated every play
          </div>

          <button
            type="button"
            onClick={onConnect}
            style={{
              width: "100%",
              cursor: "pointer",
              border: "1px solid rgba(29,185,84,0.35)",
              background: "#1DB954",
              color: "#071309",
              borderRadius: 14,
              padding: "12px 14px",
              fontWeight: 800,
              fontSize: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              boxShadow:
                "0 18px 45px rgba(29,185,84,0.25), inset 0 0 0 1px rgba(255,255,255,0.12)",
              transition: "transform 140ms ease, filter 140ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1.04)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.filter = "brightness(1)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <SpotifyLogo />
            </span>
            Connect with Spotify
          </button>

          <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            By connecting, you’ll let us sync your top tracks and recent plays.
          </div>
        </div>
      </div>
    </div>
  );
}

