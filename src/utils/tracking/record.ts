import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { Match } from "../../repos";
import { Prediction, SpreadPrediction } from "../../tools";

export interface PredictionRecord {
  away: string;
  home: string;
  winningTeam: string;
  winProbability: number;
  consensus: number;
  samples: number;
  /**
   * Filled in later, once the game has actually been played. Null until
   * then. `npm run fetch-results` (or `npm run week`, which also runs
   * `score`) fills this in automatically from ESPN's scoreboard once the
   * game is final; fall back to editing the JSON file directly (the
   * actual winning team's name, or "TIE") if a game can't be matched.
   */
  actualWinner: string | null;
  /** Null if no spread line was available at prediction time. */
  homeSpread: number | null;
  predictedMargin: number | null;
  /** The model's confidence (0.5-1.0) in its predicted margin. */
  atsConfidence: number;
  /** The team predicted to cover, null on a push or if there was no line. */
  atsWinner: string | null;
  /**
   * Filled in later, same as actualWinner (and by the same
   * `fetch-results`/`week` scripts): the team that actually covered once
   * the game is played (or "PUSH"), so `npm run score` can report ATS
   * accuracy alongside straight-up accuracy.
   */
  actualAtsWinner: string | null;
}

const PREDICTIONS_DIR = path.join(process.cwd(), "predictions");

/**
 * Writes this run's predictions to a dated JSON file under `predictions/`
 * so accuracy can be scored later, once the games have actually been
 * played.
 *
 * This is how you build up real data to evaluate whether a prompt/model/
 * feature change actually helped: there's no shortcut that doesn't involve
 * either fabricating results or scraping ESPN's historical archives (which,
 * as far as we've found, don't expose "stats as they stood at prediction
 * time" anyway — only final, complete-season numbers). Recording forward
 * from here and scoring against actual outcomes each week is the honest
 * path to a real backtest.
 *
 * @returns {string} The path to the file that was written.
 */
export function recordPredictions(
  matches: Match[],
  predictions: Prediction[],
  spreadPredictions: SpreadPrediction[],
): string {
  if (!existsSync(PREDICTIONS_DIR)) {
    mkdirSync(PREDICTIONS_DIR, { recursive: true });
  }

  const records: PredictionRecord[] = matches.map((match, i) => ({
    away: match.away,
    home: match.home,
    winningTeam: predictions[i]!.winningTeam,
    winProbability: predictions[i]!.winProbability,
    consensus: predictions[i]!.consensus,
    samples: predictions[i]!.samples,
    actualWinner: null,
    homeSpread: spreadPredictions[i]!.homeSpread,
    predictedMargin: spreadPredictions[i]!.predictedMargin,
    atsConfidence: spreadPredictions[i]!.confidence,
    atsWinner: spreadPredictions[i]!.atsWinner,
    actualAtsWinner: null,
  }));

  const filename = `${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  const filepath = path.join(PREDICTIONS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(records, null, 2));

  return filepath;
}
