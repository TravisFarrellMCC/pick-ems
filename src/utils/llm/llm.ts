import OpenAI from "openai";
import { JSONSchema } from "json-schema-to-ts";
import { SCHEMA } from "./schema";
import { CONFIG } from "../../config";

const openai = new OpenAI({
  apiKey: CONFIG.OPENAI_API_KEY,
  organization: CONFIG.OPENAI_ORG_ID,
});

/**
 * Wraps calls to the LLM that will call a well-typed tool and return
 * a well-typed response.
 *
 */
export async function llm<T>(
  systemPrompt: string,
  userPrompt: any,
  toolSchema: { schema: JSONSchema; type: T },
): Promise<T> {
  // TODO: There is a lot going on this function. We should
  // break it up / clean it up.

  if (CONFIG.VERBOSE) {
    console.log("=============================================");
    console.log("Starting request to LLM:");
    console.log("\nSYSTEM:\n", systemPrompt);
    console.log("\nUSER:\n", JSON.stringify(userPrompt));
  }

  // We wrap the provided schema in a parent schema that forces
  // the LLM to think and perform analysis before generating tool
  // parameters. If we don't do this, and you ask the LLM to, for
  // example, generate a boolean – it will just generate a boolean
  // without putting a lot of thought into that boolean. Even if
  // your prompt uses Chain-of-Thought or similar techniques.
  //
  // By forcing the first parameter the LLM generates to be
  // that analysis, we can ensure that the LLM will not just jump
  // right into generating the tool parameters, but will also
  // write down thoughts in a scratchpad (of sorts) about it first.
  const schema = SCHEMA(toolSchema.schema) as any;

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify(userPrompt),
      },
    ],
    model: CONFIG.OPENAI_MODEL,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "response",
        strict: true,
        schema: schema,
      },
    },
  });

  const content = JSON.parse(response.choices[0]!.message.content!);

  if (content == null) {
    throw new Error("LLM did not return arguments to parse");
  }

  if (CONFIG.VERBOSE) {
    console.log("\nRESPONSE:\n");
    console.log(JSON.stringify(content, null, 2));
    console.log("=============================================");
  }

  return content.conclusion as T;
}
