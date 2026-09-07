import { llm } from "../../utils";
import { SYSTEM_PROMPT } from "./prompt";
import { SCHEMA } from "./schema";
import { Match } from "../../repos";

export interface TotalPointsPrediction {
  /** The model's predicted combined final score (away + home). */
  predictedTotalPoints: number;
  /** The model's confidence (0.5-1.0) in its total estimate. */
  confidence: number;
  /** The market's over/under total at prediction time, if one was posted. */
  marketTotal: number | null;
}

/**
 * Predicts the combined total points for a match — used only for ESPN
 * Pick'em's weekly tiebreaker question, which asks for the exact combined
 * score of one specific game (almost always Monday night) rather than a
 * winner or a spread cover. See `MatchRepo`/`Match.isTiebreaker` for how
 * that match is identified.
 *
 * @param match The tiebreaker match to predict a total for.
 * @returns {Promise<TotalPointsPrediction>} The predicted total.
 */
export async function predictTotalPoints(
  match: Match,
): Promise<TotalPointsPrediction> {
  const [articles, stats, gameDetails, injuries] = await Promise.all([
    match.articles(),
    match.stats(),
    match.gameDetails(),
    match.injuries(),
  ]);

  const systemPrompt = SYSTEM_PROMPT(stats, match, articles, gameDetails, injuries);
  const result = await llm(systemPrompt, match, SCHEMA, { temperature: 0.2 });

  const marketTotal =
    gameDetails?.odds?.home.overUnder ?? gameDetails?.odds?.away.overUnder ?? null;

  return {
    predictedTotalPoints: result.predictedTotalPoints,
    confidence: result.confidence,
    marketTotal,
  };
}
