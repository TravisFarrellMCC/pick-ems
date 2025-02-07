import type { JSONSchema } from "json-schema-to-ts";

// Define the thought structure
const thoughtSchema = {
  type: "object",
  properties: {
    topic: {
      type: "string",
      description: "Topic for the current step",
    },
    thinking: {
      type: "string",
      description: "Detailed thinking for the current topic.",
    },
    reflection: {
      type: "string",
      description:
        "Detailed reflection on the current approach and reasoning. Think about if we should change or alter course.",
    },
    reward: {
      type: "number",
      description:
        "Quality score between 0.0 and 1.0 to evaluate the current approach",
    },
    next_step: {
      type: "string",
      enum: ["CONTINUE", "ADJUST", "BACKTRACK"],
      description: `
        CONTINUE (0.8+): Continue with current approach
        ADJUST (0.5-0.7): Make minor adjustments to current approach
        BACKTRACK (<0.5): Try a completely different approach
      `,
    },
  },
  additionalProperties: false,
  required: ["topic", "thinking", "reflection", "reward", "next_step"],
} as const;

// Schema for the analysis structure
const analysisSchema = {
  type: "object",
  properties: {
    step1: thoughtSchema,
    step2: thoughtSchema,
    step3: thoughtSchema,
    step4: thoughtSchema,
    step5: thoughtSchema,
    step6: thoughtSchema,
    step7: thoughtSchema,
    step8: thoughtSchema,
    step9: thoughtSchema,
    step10: thoughtSchema,
    step11: thoughtSchema,
    step12: thoughtSchema,
    step13: thoughtSchema,
    step14: thoughtSchema,
    step15: thoughtSchema,
    finalthought: {
      type: "string",
      description: "Clear, concise summary of the solution",
    },
    finalReflection: {
      type: "string",
      description: "Clear, concise reflection of your thinking",
    },
  },
  additionalProperties: false,
  required: [
    "step1",
    "step2",
    "step3",
    "step4",
    "step5",
    "step6",
    "step7",
    "step8",
    "step9",
    "step10",
    "step11",
    "step12",
    "step13",
    "step14",
    "step15",
    "finalthought",
    "finalReflection",
  ],
} as JSONSchema;

export const SCHEMA = (toolSchema: JSONSchema) =>
  ({
    type: "object",
    description: `
We'll be thinking about a problem step-by-step, exploring multiple angles and approaches.

We will break down the solution into clear steps. We have a 15 step budget and will always use the entire budget.

Be careful and thorough. Start by coming up with a high-level plan and then break it down into smaller steps as
you progress.

Every thought step will begin with a topic, which is a high-level idea, approach, topic, or question.
After that, you will spend time thinking about the topic. Your thinking should be highly detailed and
precise, exploring all possible angles, calculations, and considerations. It is okay and encouraged for
the thinking to be paragraphs long.

You should start with high-level thoughts, and then gradually expand, refine, critique, revisit,
improve, question, and finalize your thinking.

Do not be afraid to challenge yourself, identify and question assumptions, and explore
alternative approaches, solutions, and answers.

Continuously adjust your reasoning based on intermediate results and reflections, adapting your strategy as you progress.
Regularly evaluate progress in the reflection steps. Be critical and honest about your reasoning process.

IF YOU'VE EXHAUSTED ONE LINE OF THOUGHT, TRY ANOTHER.

Assign a reward that is a quality score to each step between 0.0 and 1.0 after each thought.
Use this to guide your approach.

Your thoughts should:
- Serve as a scratchpad for calculations and reasoning
- Include detailed reflections on your approach
- Evaluate quality with reward scores (0.0-1.0)
- Guide next steps based on rewards:
  • 0.8+ → CONTINUE current approach
  • 0.5-0.7 → ADJUST with minor changes
  • Below 0.5 → BACKTRACK and try different approach

When you're finished, summarize your solution and thinking in the \`answer\`, and
then provide your final answer in the \`conclusion\`.
`,
    properties: {
      analysis: analysisSchema,
      conclusion: toolSchema,
    },
    additionalProperties: false,
    required: ["analysis", "conclusion"],
  }) as const satisfies JSONSchema;
