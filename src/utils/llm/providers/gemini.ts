import { GoogleGenAI } from "@google/genai";
import { JSONSchema } from "json-schema-to-ts";
import { SCHEMA as WRAP_WITH_SCRATCHPAD } from "../schema";
import { CONFIG } from "../../../config";
import { getGeminiApiKey } from "../../secrets";
import { LlmOptions, LlmProvider } from "./types";

/**
 * Gemini backend, via Google's `@google/genai` SDK. `responseJsonSchema`
 * accepts standard JSON Schema directly (type/enum/properties/required/
 * additionalProperties are all supported), so unlike some other providers,
 * no schema format conversion is needed here — the same schema objects used
 * for OpenAI work as-is.
 *
 * The API key is resolved lazily (GOOGLE_API_KEY env var, or GCP Secret
 * Manager) on first use rather than at module load, since fetching it may
 * require a network call.
 *
 * `vertexai: true` is required here: the actual provisioned key is a
 * Vertex AI "Express Mode" key (an API-key-only, no project/location-
 * required way to call Vertex), which is restricted to
 * aiplatform.googleapis.com — it does NOT work against the plain Gemini
 * API (generativelanguage.googleapis.com), which is what the SDK targets
 * by default when `vertexai` is left unset.
 */
export class GeminiProvider implements LlmProvider {
  public readonly name = "gemini";

  public async complete<T>(
    systemPrompt: string,
    userPrompt: any,
    toolSchema: { schema: JSONSchema; type: T },
    options: LlmOptions,
  ): Promise<T> {
    const apiKey = await getGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey, vertexai: true });

    const useScaffold = !CONFIG.GOOGLE_IS_REASONING_MODEL;
    const schema = useScaffold
      ? WRAP_WITH_SCRATCHPAD(toolSchema.schema)
      : toolSchema.schema;

    const response = await ai.models.generateContent({
      model: CONFIG.GOOGLE_MODEL,
      contents: JSON.stringify(userPrompt),
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        ...(CONFIG.GOOGLE_IS_REASONING_MODEL
          ? {}
          : { temperature: options.temperature ?? 0.1 }),
      },
    });

    const raw = response.text;
    if (raw == null) {
      throw new Error("Gemini did not return any content to parse");
    }

    const content = JSON.parse(raw);
    return (useScaffold ? content.conclusion : content) as T;
  }
}
