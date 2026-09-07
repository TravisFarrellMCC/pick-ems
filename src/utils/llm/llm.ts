import { JSONSchema } from "json-schema-to-ts";
import { CONFIG } from "../../config";
import {
  GeminiProvider,
  LlmOptions,
  LlmProvider,
  OpenAiProvider,
} from "./providers";

export { LlmOptions } from "./providers";

// Gemini first, OpenAI as the fallback. Any failure from a provider (bad/
// missing key, rate limit, network error, malformed response, etc.) just
// moves on to the next one rather than surfacing immediately — the whole
// point of having a fallback is that a single provider going down
// shouldn't stop predictions from running.
const PROVIDERS: LlmProvider[] = [new GeminiProvider(), new OpenAiProvider()];

/**
 * Wraps calls to the LLM that will call a well-typed tool and return a
 * well-typed response. Tries each configured provider in order, falling
 * back to the next on any error.
 *
 * Each provider decides for itself whether to wrap the schema in the
 * chain-of-thought scratchpad (see ./schema.ts) based on whether its own
 * configured model is a native-reasoning model.
 */
export async function llm<T>(
  systemPrompt: string,
  userPrompt: any,
  toolSchema: { schema: JSONSchema; type: T },
  options: LlmOptions = {},
): Promise<T> {
  if (CONFIG.VERBOSE) {
    console.log("=============================================");
    console.log("Starting request to LLM:");
    console.log("\nSYSTEM:\n", systemPrompt);
    console.log("\nUSER:\n", JSON.stringify(userPrompt));
  }

  let lastError: unknown = new Error("No LLM providers are configured");

  for (const provider of PROVIDERS) {
    try {
      const result = await provider.complete(
        systemPrompt,
        userPrompt,
        toolSchema,
        options,
      );

      if (CONFIG.VERBOSE) {
        console.log(`\nRESPONSE (via ${provider.name}):\n`);
        console.log(JSON.stringify(result, null, 2));
        console.log("=============================================");
      }

      return result;
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        `[llm] provider "${provider.name}" failed (${message}); trying next provider if any.`,
      );
    }
  }

  throw lastError;
}

/**
 * Queries every configured provider independently (in parallel) and
 * returns every answer that succeeded, rather than stopping at the first
 * one. Used for consensus mode, where the caller wants to merge Gemini's
 * and OpenAI's answers (e.g. via majority vote) instead of treating OpenAI
 * as a pure fallback.
 *
 * @throws if every provider fails.
 */
export async function llmMulti<T>(
  systemPrompt: string,
  userPrompt: any,
  toolSchema: { schema: JSONSchema; type: T },
  options: LlmOptions = {},
): Promise<T[]> {
  const outcomes = await Promise.allSettled(
    PROVIDERS.map((provider) =>
      provider.complete(systemPrompt, userPrompt, toolSchema, options),
    ),
  );

  const results: T[] = [];
  outcomes.forEach((outcome, i) => {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      const message =
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason);
      console.warn(
        `[llm] provider "${PROVIDERS[i]!.name}" failed in consensus mode: ${message}`,
      );
    }
  });

  if (results.length === 0) {
    throw new Error("All LLM providers failed in consensus mode");
  }

  return results;
}
