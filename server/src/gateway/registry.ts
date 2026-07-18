// Socket Registry (ARCHITECTURE.md §4.4) — tracks which users currently have
// at least one open socket. Consumed by the playback poller in M5
// (getActiveUserIds → only poll users with an open dashboard), which is the
// rate-limit guarantee of §3.2: zero connected users → zero Spotify calls.
//
// Pure in-memory bookkeeping: no database, no services, no bus.

const connectionCounts = new Map<number, number>();

export const registerConnection = (userId: number): void => {
  connectionCounts.set(userId, (connectionCounts.get(userId) ?? 0) + 1);
};

export const unregisterConnection = (userId: number): void => {
  const count = connectionCounts.get(userId);
  if (count === undefined) return;
  if (count <= 1) {
    connectionCounts.delete(userId);
  } else {
    connectionCounts.set(userId, count - 1);
  }
};

// Users with ≥1 open socket (§3.2). The M5 pollPlayback job's target list.
export const getActiveUserIds = (): number[] => [...connectionCounts.keys()];

export const getConnectionCount = (userId: number): number =>
  connectionCounts.get(userId) ?? 0;

// Called when the gateway shuts down: sockets are being closed, so no user is
// "active" for polling purposes anymore.
export const clearRegistry = (): void => {
  connectionCounts.clear();
};
