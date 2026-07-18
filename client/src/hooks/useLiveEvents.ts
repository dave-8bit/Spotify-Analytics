// Typed socket event subscription (ARCHITECTURE.md §5, M4). Subscribes a
// handler to one server→client event for the lifetime of the component; the
// latest handler is always invoked without re-subscribing on every render.

import { useEffect, useRef } from "react";

import { socket } from "../services/socket";
import type { ServerToClientEvents } from "../types/socketEvents";

export default function useLiveEvent<K extends keyof ServerToClientEvents>(
  event: K,
  handler: ServerToClientEvents[K]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = ((...args: Parameters<ServerToClientEvents[K]>) => {
      (handlerRef.current as (...a: typeof args) => void)(...args);
    }) as ServerToClientEvents[K];

    socket.on(event, listener as never);
    return () => {
      socket.off(event, listener as never);
    };
  }, [event]);
}
