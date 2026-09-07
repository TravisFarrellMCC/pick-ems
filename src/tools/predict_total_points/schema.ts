import type { FromSchema, JSONSchema } from "json-schema-to-ts";

const DEFINITION = {
  type: "object",
  properties: {
    predictedTotalPoints: {
      type: "number",
      description:
        "Your predicted TOTAL combined points scored by both teams (away + home added together), e.g. 44.5. This is what ESPN's tiebreaker question asks for directly — not a margin, not either team's individual score.",
    },
    confidence: {
      type: "number",
      description:
        "Your confidence (0.5 to 1.0) in this total. 0.5 means you're highly uncertain; closer to 1.0 means you're quite confident in your predicted total.",
    },
  },
  additionalProperties: false,
  required: ["predictedTotalPoints", "confidence"],
} as const satisfies JSONSchema;

export const SCHEMA = {
  schema: DEFINITION,
  type: {} as FromSchema<typeof DEFINITION>,
};
