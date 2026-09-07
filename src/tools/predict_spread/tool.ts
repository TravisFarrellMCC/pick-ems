import { llm } from "../../utils";
import { SYSTEM_PROMPT } from "./prompt";
import { SCHEMA } from "./schema";
import { Match } from "../../repos";

export interface SpreadPrediction {
  /** The team predicted to cover the spread, or null on a push (predicted margin exactly matches the line). */
  atsWinner: string | null;
  /** True when the predicted margin lands exactly on the line — no cover either way. */
  push: boolean;
  /** The model's predicted final margin, home team's perspective (positive = home wins by that much). */
  predictedMargin: number;
  /** The home team's spread line this was compared against, or null if no line was available. */
  homeSpread: number | null;
  /** The model's confidence (0.5-1.0) in its margin estimate. */
  confidence: number;
}

/**
 * Predict which team covers the spread for a match — a different question
 * from `predictWinner`'s straight-up "who wins" (ESPN Pick'em style):
 * against-the-spread pools (e.g. CBS's) score on whether the favorite won
 * by more than the market's line, not just on who won outright.
 *
 * The LLM is only asked for an independent predicted margin — comparing
 * that margin to the actual spread line to decide who covers is done here
 * in code, not left to the model, since it's a simple, exact numeric
 * comparison that doesn't benefit from being reasoned about in natural
 * language and is easy to get subtly wrong if phrased as a judgment call.
 *
 * @param match The match to predict against the spread.
 * @returns {Promise<SpreadPrediction>} The predicted margin and, if a line
 *   is available, which team is predicted to cover.
 */
export async function predictSpread(match: Match): Promise<SpreadPrediction> {
  const [articles, stats, gameDetails, injuries] = await Promise.all([
    match.articles(),
    match.stats(),
    match.gameDetails(),
    match.injuries(),
  ]);

  const systemPrompt = SYSTEM_PROMPT(
    stats,
    match,
    articles,
    gameDetails,
    injuries,
  );
  const result = await llm(systemPrompt, match, SCHEMA, { temperature: 0.1 });

  // Prefer the line ESPN's own against-the-spread pool actually grades
  // picks against (scraped in MatchRepo) over the general market odds line
  // (scraped separately in GameRepo from a different ESPN page) — the two
  // can differ, and only the former determines whether a pick is scored as
  // a cover. The market line remains as a fallback for weeks it hasn't
  // been scraped, and as supplementary context for the LLM's reasoning.
  const homeSpread = match.homeSpread ?? gameDetails?.odds?.home.spread ?? null;
  return resolveCover(
    result.predictedHomeMargin,
    result.confidence,
    homeSpread,
    match,
  );
}

/**
 * Given a predicted home-team margin and the home team's spread line,
 * decides who covers. Exported so this pure comparison logic can be unit
 * tested independent of the network/LLM call in predictSpread.
 *
 * The line to beat is `-homeSpread`: if the home team is favored by 6.5
 * (homeSpread = -6.5), they must win by MORE than 6.5 to cover; if they're
 * a 6.5-point underdog (homeSpread = +6.5), they cover by losing by fewer
 * than 6.5, tying, or winning outright.
 */
export function resolveCover(
  predictedMargin: number,
  confidence: number,
  homeSpread: number | null,
  match: Match,
): SpreadPrediction {
  if (homeSpread == null) {
    return {
      atsWinner: null,
      push: false,
      predictedMargin,
      homeSpread: null,
      confidence,
    };
  }

  const lineToBeat = -homeSpread;

  if (predictedMargin === lineToBeat) {
    return {
      atsWinner: null,
      push: true,
      predictedMargin,
      homeSpread,
      confidence,
    };
  }

  const atsWinner = predictedMargin > lineToBeat ? match.home : match.away;
  return { atsWinner, push: false, predictedMargin, homeSpread, confidence };
}
