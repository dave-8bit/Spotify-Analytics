// Typed publish/subscribe transport (ARCHITECTURE.md §4.8).
// v1: in-process EventEmitter. v2 (multi-instance): Redis pub/sub behind this
// identical interface — subscribers never change.

import { EventEmitter } from "events";
import type {
  DomainEventHandler,
  DomainEventMap,
  DomainEventName,
} from "./types";

export interface EventBus {
  publish<K extends DomainEventName>(
    event: K,
    payload: DomainEventMap[K]
  ): void;
  subscribe<K extends DomainEventName>(
    event: K,
    handler: DomainEventHandler<K>
  ): () => void;
}

class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many modules subscribing to the same event is normal; don't warn.
    this.emitter.setMaxListeners(50);
  }

  publish<K extends DomainEventName>(
    event: K,
    payload: DomainEventMap[K]
  ): void {
    this.emitter.emit(event, payload);
  }

  subscribe<K extends DomainEventName>(
    event: K,
    handler: DomainEventHandler<K>
  ): () => void {
    // A throwing subscriber must never break the publisher or other subscribers.
    const safeHandler = (payload: DomainEventMap[K]): void => {
      try {
        const result = handler(payload);
        if (result instanceof Promise) {
          result.catch((error) => {
            console.error(`[events] subscriber error for "${event}"`, error);
          });
        }
      } catch (error) {
        console.error(`[events] subscriber error for "${event}"`, error);
      }
    };

    this.emitter.on(event, safeHandler);
    return () => {
      this.emitter.off(event, safeHandler);
    };
  }
}

export const eventBus: EventBus = new InProcessEventBus();
