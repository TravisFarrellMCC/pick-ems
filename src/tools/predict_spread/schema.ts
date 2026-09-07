import type { FromSchema, JSONSchema } from "json-schema-to-ts";

const DEFINITION = {
  type: "object",
  properties: {
    predictedHomeMargin: {
      type: "number",
      description:
        "Your predicted final score margin, from the HOME team's perspective. Positive means you predict the home team wins by this many points; negative means you predict the away team wins by this many points. E.g. 3.5 means you predict the home team wins by a field goal plus a bit; -10 means you predict the away team wins by 10. This should be your genuine best estimate of the final score difference, independent of what the market's spread line already says.",
    },
    confidence: {
      type: "number",
      description:
        "Your confidence (0.5 to 1.0) in this margin estimate. 0.5 means you're highly uncertain about the exact margin; closer to 1.0 means you're quite confident in your predicted margin.",
    },
  },
  additionalProperties: false,
  required: ["predictedHomeMargin", "confidence"],
} as const satisfies JSONSchema;

export const SCHEMA = {
  schema: DEFINITION,
  type: {} as FromSchema<typeof DEFINITION>,
};
