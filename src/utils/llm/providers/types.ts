import { JSONSchema } from "json-schema-to-ts";

export interface LlmOptions {
  /**
   * Sampling temperature. Ignored for reasoning models, which don't accept
   * a custom temperature. Callers doing self-consistency ensembling
   * (multiple samples + majority vote) should pass something like 0.7 here
   * so the samples actually differ from each other; single-shot callers
   * should leave it at the low, near-deterministic default.
   */
  temperature?: number;
}

/**
 * A backend capable of taking a system/user prompt plus a JSON-schema tool
 * definition and returning a parsed, typed response matching that schema.
 * `llm()` tries providers in order and falls back to the next one on any
 * error, so each implementation should throw rather than return partial/
 * invalid data on failure.
 */
export interface LlmProvider {
  /** Short identifier used in logs (e.g. "gemini", "openai"). */
  readonly name: string;

  complete<T>(
    systemPrompt: string,
    userPrompt: any,
    toolSchema: { schema: JSONSchema; type: T },
    options: LlmOptions,
  ): Promise<T>;
}
