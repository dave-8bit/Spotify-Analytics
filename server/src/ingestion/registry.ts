// Provider → adapter lookup (ARCHITECTURE.md §5). Adding a provider means
// implementing MusicProviderAdapter and registering it here — nothing else.

import type { MusicProviderAdapter, ProviderKind } from "./types";
import { spotifyAdapter } from "./providers/spotify/adapter";

const adapters: Record<ProviderKind, MusicProviderAdapter> = {
  spotify: spotifyAdapter,
};

export const getAdapter = (provider: string): MusicProviderAdapter => {
  const adapter = adapters[provider as ProviderKind];
  if (!adapter) {
    throw new Error(`[ingestion] no adapter registered for provider "${provider}"`);
  }
  return adapter;
};
