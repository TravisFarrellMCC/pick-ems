import { closeBrowser } from "./utils";
import { recordPredictions } from "./utils/tracking";
import { predictWinner, predictSpread, predictTotalPoints } from "./tools";
import {
  MatchRepo,
  TeamRepo,
  ArticleRepo,
  TeamStatsRepo,
  InjuryRepo,
} from "./repos";

(async () => {
  // Get all of the game matches for this week
  const matches = await new MatchRepo().list();

  // Warm the shared, match-independent caches up front. TeamRepo,
  // ArticleRepo, TeamStatsRepo, and InjuryRepo each cache their full result
  // set at the class level the first time they're queried, no matter which
  // team/match triggers the fetch. Warming them here — sequentially, since
  // they all share a single Playwright browser page — means the parallel
  // predictWinner() calls below can safely read from cache without racing
  // on browser navigation.
  await new TeamRepo().list();
  await new ArticleRepo().list();
  await new TeamStatsRepo().list();
  await new InjuryRepo().findByTeam(matches[0]!.away);

  // GameRepo's per-matchup details (recent form, odds, head-to-head) are
  // keyed per match rather than shared globally, so each match needs its
  // own warm-up call. Also sequential, for the same shared-browser-page
  // reason as above.
  for (const match of matches) {
    await match.gameDetails();
  }

  // The one match (almost always Monday night) ESPN's weekly tiebreaker
  // question asks about — see Match.isTiebreaker for how it's identified.
  const tiebreakerMatch = matches.find((m) => m.isTiebreaker) ?? null;

  // Predict the straight-up winner (ESPN Pick'em style), the
  // against-the-spread pick (CBS Pick'em style), and — for the tiebreaker
  // match only — the total combined points, all in parallel. By this point
  // every data source these predictors read from is already cached, so
  // this is pure LLM calls with no further browser use.
  const [predictions, spreadPredictions, totalPointsPrediction] =
    await Promise.all([
      Promise.all(matches.map(predictWinner)),
      Promise.all(matches.map(predictSpread)),
      tiebreakerMatch != null ? predictTotalPoints(tiebreakerMatch) : null,
    ]);

  matches.forEach((match, i) => {
    const { winningTeam, winProbability, consensus, samples } = predictions[i]!;
    const confidence = `${Math.round(winProbability * 100)}%`;
    const agreement =
      samples > 1
        ? ` [${Math.round(consensus * 100)}% of ${samples} samples agreed]`
        : "";
    console.log(
      `${match.away} vs. ${match.home} — Head-to-Head: ${winningTeam} (${confidence} confidence)${agreement}`,
    );

    const spread = spreadPredictions[i]!;
    if (spread.homeSpread == null) {
      console.log(
        `${match.away} vs. ${match.home} — Against the Spread: no line available`,
      );
    } else if (spread.push) {
      console.log(
        `${match.away} vs. ${match.home} — Against the Spread: push (predicted margin lands exactly on the line)`,
      );
    } else {
      console.log(
        `${match.away} vs. ${match.home} — Against the Spread: ${spread.atsWinner} covers (predicted margin ${spread.predictedMargin > 0 ? "+" : ""}${spread.predictedMargin} vs. line ${spread.homeSpread > 0 ? "+" : ""}${spread.homeSpread})`,
      );
    }
  });

  if (tiebreakerMatch != null && totalPointsPrediction != null) {
    const { predictedTotalPoints, confidence, marketTotal } = totalPointsPrediction;
    const marketNote =
      marketTotal != null ? ` (market total: ${marketTotal})` : "";
    console.log(
      `\n${tiebreakerMatch.away} vs. ${tiebreakerMatch.home} — TIEBREAKER: ${predictedTotalPoints} total points${marketNote} (${Math.round(confidence * 100)}% confidence)`,
    );
  }

  // Record predictions so accuracy can be scored later (see `npm run
  // score`), once the games have actually been played.
  const recordedTo = recordPredictions(
    matches,
    predictions,
    spreadPredictions,
    totalPointsPrediction,
  );
  console.log(`\nRecorded predictions to ${recordedTo}`);
  console.log(
    "Once this week's games are played, fill in `actualWinner` for each match in that file and run `npm run score`.",
  );

  // Close up shop
  await closeBrowser();
})();
