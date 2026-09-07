import type { FromSchema, JSONSchema } from "json-schema-to-ts";

/**
 * Builds the schema with `primaryTeam` constrained to an enum of the exact
 * team names in play, rather than a free-form string. Previously the model
 * was only *told* the valid team names in the prompt, but nothing stopped
 * it from returning a slightly different string (whitespace, a nickname
 * instead of the full city + name, etc). Since every downstream join
 * (`ArticleRepo.findByTeams`) matches on exact string equality, any drift
 * there silently dropped the article instead of erroring. `strict: true`
 * JSON schema enums make that class of mismatch impossible.
 *
 * @param teamNames The full display names of every valid team.
 */
export const SCHEMA = (teamNames: readonly string[]) => {
  const DEFINITION = {
    type: "object",
    properties: {
      primaryTeam: {
        type: "string",
        enum: teamNames as unknown as string[],
        description: "The primary team associated with the article.",
      },
      summary: {
        type: "string",
        description: "The summary of the article.",
      },
      league: {
        enum: ["NFL", "COLLEGE", "FANTASY", "OTHER"],
        description: "The league associated with the article.",
      },
    },
    additionalProperties: false,
    required: ["summary", "primaryTeam", "league"],
  } as const satisfies JSONSchema;

  return {
    schema: DEFINITION,
    type: {} as FromSchema<typeof DEFINITION>,
  };
};
