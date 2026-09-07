import { readdirSync, readFileSync, existsSync } from "fs";
import path from "path";
import { PredictionRecord } from "./record";

export interface CalibrationBucket {
  bucket: string;
  count: number;
  accuracy: number;
}

export interface AccuracyReport {
  totalScored: number;
  correct: number;
  accuracy: number;
  /** Does confidence track actual accuracy? A well-calibrated model's 90%+
   * bucket should be right ~90% of the time, not the same as its 50-60% bucket. */
  calibration: CalibrationBucket[];
}

export interface ScoreReport {
  /** Straight-up "who wins" accuracy (ESPN Pick'em style). */
  headToHead: AccuracyReport;
  /** Against-the-spread accuracy (CBS Pick'em style). Pushes and games with
   * no line available are excluded from both the numerator and denominator. */
  ats: AccuracyReport;
}

const PREDICTIONS_DIR = path.join(process.cwd(), "predictions");

const BUCKETS = [
  { label: "50-60%", min: 0.5, max: 0.6 },
  { label: "60-70%", min: 0.6, max: 0.7 },
  { label: "70-80%", min: 0.7, max: 0.8 },
  { label: "80-90%", min: 0.8, max: 0.9 },
  { label: "90-100%", min: 0.9, max: 1.01 },
];

/**
 * Reads every recorded prediction file and reports accuracy + calibration
 * for both the head-to-head and against-the-spread picks, over whichever
 * records have had their actual outcome filled in.
 *
 * @returns {ScoreReport} The accuracy report for both prediction types.
 */
export function scoreAllPredictions(): ScoreReport {
  const records = loadAllRecords();

  const headToHead = scoreBy(
    records.filter((r) => r.actualWinner != null),
    (r) => r.winProbability,
    (r) => r.actualWinner === r.winningTeam,
  );

  const ats = scoreBy(
    records.filter((r) => r.actualAtsWinner != null && r.atsWinner != null),
    (r) => r.atsConfidence,
    (r) => r.actualAtsWinner === r.atsWinner,
  );

  return { headToHead, ats };
}

function scoreBy(
  scored: PredictionRecord[],
  confidenceOf: (r: PredictionRecord) => number,
  isCorrect: (r: PredictionRecord) => boolean,
): AccuracyReport {
  const correct = scored.filter(isCorrect);

  const calibration: CalibrationBucket[] = BUCKETS.map((bucket) => {
    const inBucket = scored.filter((r) => {
      const confidence = confidenceOf(r);
      return confidence >= bucket.min && confidence < bucket.max;
    });
    const correctInBucket = inBucket.filter(isCorrect);
    return {
      bucket: bucket.label,
      count: inBucket.length,
      accuracy:
        inBucket.length > 0 ? correctInBucket.length / inBucket.length : 0,
    };
  });

  return {
    totalScored: scored.length,
    correct: correct.length,
    accuracy: scored.length > 0 ? correct.length / scored.length : 0,
    calibration,
  };
}

function loadAllRecords(): PredictionRecord[] {
  if (!existsSync(PREDICTIONS_DIR)) {
    return [];
  }

  const files = readdirSync(PREDICTIONS_DIR).filter((f) => f.endsWith(".json"));
  const records: PredictionRecord[] = [];

  for (const file of files) {
    const contents = readFileSync(path.join(PREDICTIONS_DIR, file), "utf8");
    records.push(...(JSON.parse(contents) as PredictionRecord[]));
  }

  return records;
}
