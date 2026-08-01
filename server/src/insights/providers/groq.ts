// Groq insight provider (M7, ARCHITECTURE.md §4.7 — "Groq (groq-sdk already a
// dependency)"). Implements the InsightProvider seam; nothing else in the
// system knows Groq exists. Uses chat.completions with JSON-mode output
// (response_format json_object) so the model returns parseable structured
// content for the Insight row.

import Groq from "groq-sdk";
import { getGroqApiKey, getGroqModel } from "../../config/env";
import type {
  InsightProvider,
  InsightProviderResult,
} from "../provider";

// Lazily-created client: boot must not fail when GROQ_API_KEY is unset (§4.7
// degradation — "no new insight", not a crash). Only a generation attempt
// with no key is a no-op (the engine short-circuits before calling us).
let client: Groq | null = null;

const getClient = (): Groq | null => {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return null;
  }
  if (!client) {
    client = new Groq({ apiKey });
  }
  return client;
};

export const groqInsightProvider: InsightProvider = {
  async generate({ system, user }): Promise<InsightProviderResult> {
    const groq = getClient();
    if (!groq) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const model = getGroqModel();
    const completion = await groq.chat.completions.create({
      model,
      temperature: 0.7,
      // JSON mode: the model returns a JSON object matching our prompt's
      // requested shape (title / summary / highlights).
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Empty completion from Groq");
    }

    let content: Record<string, unknown>;
    try {
      content = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Defensive: JSON mode should guarantee parseable output, but a malformed
      // response must degrade to "no new insight", not crash the pipeline.
      throw new Error("Groq returned non-JSON content");
    }

    return { content, model: completion.model ?? model };
  },
};

