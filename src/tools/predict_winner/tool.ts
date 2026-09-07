import { llm, llmMulti } from "../../utils";
import { SYSTEM_PROMPT } from "./prompt";
import { SCHEMA } from "./schema";
import { Match } from "../../repos";
import { CONFIG } from "../../config";

export interface Prediction {
  winningTeam: string;
  /** Averaged win probability across all samples that agreed on the winner. */
  winProbability: number;
  /** Fraction of samples that agreed on the winning team (1.0 = unanimous). */
  consensus: number;
  /** How many times the model was independently sampled for this pick. */
  samples: number;
}

/**
 * Predict the winner of a match.
 *
 * When CONFIG.PREDICTION_SAMPLES > 1, this samples the model multiple times
 * at a higher temperature and takes a majority vote (self-consistency),
 * which tends to reduce variance on close calls compared to a single
 * low-temperature sample. `consensus` reports how unanimous the samples
 * were, so a caller can tell a genuine toss-up (e.g. 3-2) from a confident
 * pick (5-0) even when winProbability alone looks similar.
 *
 * When CONFIG.CONSENSUS_MODE is on, each "sample" queries every configured
 * LLM provider (Gemini and OpenAI) instead of just the primary, and all of
 * their answers get folded into the same majority vote — so e.g. Gemini
 * and OpenAI splitting on a pick shows up as a lower `consensus` rather
 * than silently only using whichever happened to be primary.
 *
 * @param match The match to predict the winner of.
 * @returns {Promise<Prediction>} The predicted winner and confidence.
 */
export async function predictWinner(match: Match): Promise<Prediction> {
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

  const samples = Math.max(1, CONFIG.PREDICTION_SAMPLES);
  const temperature = samples > 1 ? 0.7 : 0.1;

  const results = CONFIG.CONSENSUS_MODE
    ? (
        await Promise.all(
          Array.from({ length: samples }, () =>
            llmMulti(systemPrompt, match, SCHEMA, { temperature }),
          ),
        )
      ).flat()
    : await Promise.all(
        Array.from({ length: samples }, () =>
          llm(systemPrompt, match, SCHEMA, { temperature }),
        ),
      );

  return aggregate(results);
}

/**
 * Combines multiple independent predictions into one via majority vote on
 * the winning team, averaging win probability across the samples that
 * agreed with the winning vote.
 *
 * Exported (rather than kept private) so it can be unit tested directly
 * against synthetic samples, independent of the network/LLM calls in
 * predictWinner.
 */
export function aggregate(
  results: { winningTeam: string; winProbability: number }[],
): Prediction {
  const votes = new Map<string, number[]>();
  for (const result of results) {
    const probabilities = votes.get(result.winningTeam) ?? [];
    probabilities.push(result.winProbability);
    votes.set(result.winningTeam, probabilities);
  }

  let winningTeam = results[0]!.winningTeam;
  let winningProbabilities = votes.get(winningTeam)!;

  for (const [team, probabilities] of votes) {
    if (probabilities.length > winningProbabilities.length) {
      winningTeam = team;
      winningProbabilities = probabilities;
    }
  }

  const winProbability =
    winningProbabilities.reduce((sum, p) => sum + p, 0) /
    winningProbabilities.length;

  return {
    winningTeam,
    winProbability,
    consensus: winningProbabilities.length / results.length,
    samples: results.length,
  };
}
