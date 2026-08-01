// Provider-agnostic seam for AI insight generation (M7, ARCHITECTURE.md §4.7).
// The Insights Engine depends only on this interface — swapping Groq for any
// other model provider is one implementation, no engine changes. Providers
// fetch nothing: the engine hands them a compact prompt built from snapshots.

export type InsightProviderResult = {
  // The raw JSON body the model returned (parsed). The engine validates the
  // shape before persisting.
  content: Record<string, unknown>;
  // Provider-reported model identifier, stored on the Insight row.
  model: string;
};

export interface InsightProvider {
  generate(input: {
    system: string;
    user: string;
  }): Promise<InsightProviderResult>;
}

