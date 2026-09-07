import { scoreAllPredictions, AccuracyReport } from "../utils/tracking";

function printSection(title: string, report: AccuracyReport): void {
  console.log(title);

  if (report.totalScored === 0) {
    console.log(
      "  No scored predictions yet. Fill in the corresponding `actual*` field in the files under predictions/ once the games are played.\n",
    );
    return;
  }

  console.log(
    `  ${report.correct}/${report.totalScored} correct (${(report.accuracy * 100).toFixed(1)}%)`,
  );
  console.log("  Calibration (does confidence track actual accuracy?):");
  for (const bucket of report.calibration) {
    if (bucket.count === 0) {
      continue;
    }
    console.log(
      `    ${bucket.bucket}: ${bucket.count} picks, ${(bucket.accuracy * 100).toFixed(1)}% correct`,
    );
  }
  console.log("");
}

const { headToHead, ats } = scoreAllPredictions();

printSection("Head-to-Head (ESPN Pick'em style):", headToHead);
printSection("Against the Spread (CBS Pick'em style):", ats);
