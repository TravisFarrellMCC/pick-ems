import type { FromSchema, JSONSchema } from "json-schema-to-ts";

const DEFINITION = {
  type: "object",
  properties: {
    winningTeam: {
      type: "string",
      description: "The name of the winning team.",
    },
    winProbability: {
      type: "number",
      description:
        "Your estimated probability (0.5 to 1.0) that winningTeam actually wins. 0.5 means a true coin flip; closer to 1.0 means high confidence. Never below 0.5 — winningTeam is by definition the side you think is more likely, so this is a measure of how lopsided you think the game is, not which side you picked.",
    },
  },
  additionalProperties: false,
  required: ["winningTeam", "winProbability"],
} as const satisfies JSONSchema;

export const SCHEMA = {
  schema: DEFINITION,
  type: {} as FromSchema<typeof DEFINITION>,
};
