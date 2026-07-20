// ListeningSession derivation (M6, ARCHITECTURE.md §4.3, §9.2): a gap > 30
// minutes between consecutive plays starts a new session. The pure derivation
// is separated from persistence so it can be unit-verified and reused; the
// write path belongs to the Analytics Engine (one-writer rule, §6.1).

import prisma from "../config/prisma";

export const SESSION_GAP_MS = 30 * 60 * 1000;

export type SessionSourceEvent = {
  playedAt: Date;
  durationMs: number | null;
};

export type DerivedSession = {
  startedAt: Date;
  endedAt: Date;
  trackCount: number;
  totalMs: number;
};

// Pure: `events` must be sorted by playedAt ascending. A session ends at the
// last play's start plus its duration (0 when the provider reports none).
export const deriveSessions = (
  events: SessionSourceEvent[]
): DerivedSession[] => {
  const sessions: DerivedSession[] = [];
  let current: DerivedSession | null = null;
  let previousPlayedAtMs = 0;

  for (const event of events) {
    const playedAtMs = event.playedAt.getTime();
    if (current === null || playedAtMs - previousPlayedAtMs > SESSION_GAP_MS) {
      current = {
        startedAt: event.playedAt,
        endedAt: event.playedAt,
        trackCount: 0,
        totalMs: 0,
      };
      sessions.push(current);
    }

    current.trackCount += 1;
    current.totalMs += event.durationMs ?? 0;
    current.endedAt = new Date(playedAtMs + (event.durationMs ?? 0));
    previousPlayedAtMs = playedAtMs;
  }

  return sessions;
};

// Full replace per user inside one transaction: ListeningSession is a derived,
// rebuildable table (§6.1) — v1 recomputes it wholesale on each engine run
// (§9.3 "correct and simple beats clever"). Returns the session count.
export const rebuildListeningSessions = async (
  userId: number
): Promise<number> => {
  const events = await prisma.playEvent.findMany({
    where: { userId },
    orderBy: { playedAt: "asc" },
    select: { playedAt: true, durationMs: true },
  });

  const sessions = deriveSessions(events);

  await prisma.$transaction([
    prisma.listeningSession.deleteMany({ where: { userId } }),
    ...(sessions.length
      ? [
          prisma.listeningSession.createMany({
            data: sessions.map((session) => ({ userId, ...session })),
          }),
        ]
      : []),
  ]);

  return sessions.length;
};
