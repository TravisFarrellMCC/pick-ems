import OpenAI from "openai";
import { JSONSchema } from "json-schema-to-ts";
import { SCHEMA as WRAP_WITH_SCRATCHPAD } from "../schema";
import { CONFIG } from "../../../config";
import { getOpenAiApiKey } from "../../secrets";
import { LlmOptions, LlmProvider } from "./types";

/**
 * OpenAI chat-completions backend. Uses `strict: true` JSON-schema tool
 * output, and wraps the schema in a forced chain-of-thought scratchpad for
 * non-reasoning models (see schema.ts for why).
 *
 * The API key is resolved lazily (OPENAI_API_KEY env var, or GCP Secret
 * Manager) on first use rather than at module load, matching the Gemini
 * provider — see secrets.ts.
 */
export class OpenAiProvider implements LlmProvider {
  public readonly name = "openai";

  private client: OpenAI | null = null;

  public async complete<T>(
    systemPrompt: string,
    userPrompt: any,
    toolSchema: { schema: JSONSchema; type: T },
    options: LlmOptions,
  ): Promise<T> {
    const client = await this.getClient();
    const useScaffold = !CONFIG.OPENAI_IS_REASONING_MODEL;
    const schema = (
      useScaffold ? WRAP_WITH_SCRATCHPAD(toolSchema.schema) : toolSchema.schema
    ) as any;

    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPrompt) },
        ],
        model: CONFIG.OPENAI_MODEL,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            strict: true,
            schema,
          },
        },
      };

    if (!CONFIG.OPENAI_IS_REASONING_MODEL) {
      request.temperature = options.temperature ?? 0.1;
    }

    const response = await client.chat.completions.create(request);
    const raw = response.choices[0]?.message.content;

    if (raw == null) {
      throw new Error("OpenAI did not return any content to parse");
    }

    const content = JSON.parse(raw);
    return (useScaffold ? content.conclusion : content) as T;
  }

  private async getClient(): Promise<OpenAI> {
    if (this.client == null) {
      const apiKey = await getOpenAiApiKey();
      this.client = new OpenAI({ apiKey, organization: CONFIG.OPENAI_ORG_ID });
    }
    return this.client;
  }
}
