// Socket connection lifecycle (ARCHITECTURE.md §5, M4): connect while the
// authenticated dashboard is mounted, disconnect when it unmounts. Exposes
// connection state for the Live indicator (§7.4: "offline" when the socket
// never connects — the app itself keeps working on REST).

import { useEffect, useState } from "react";

import { connectSocket, disconnectSocket, socket } from "../services/socket";

export default function useSocket(enabled: boolean) {
  const [connected, setConnected] = useState<boolean>(socket.connected);

  useEffect(() => {
    if (!enabled) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    connectSocket();
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      disconnectSocket();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
