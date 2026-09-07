import { closeBrowser } from "./utils";
import { recordPredictions } from "./utils/tracking";
import { predictWinner, predictSpread } from "./tools";
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

  // Predict both the straight-up winner (ESPN Pick'em style) and the
  // against-the-spread pick (CBS Pick'em style) for each match in
  // parallel. By this point every data source both predictors read from is
  // already cached, so this is pure LLM calls with no further browser use.
  const [predictions, spreadPredictions] = await Promise.all([
    Promise.all(matches.map(predictWinner)),
    Promise.all(matches.map(predictSpread)),
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

  // Record predictions so accuracy can be scored later (see `npm run
  // score`), once the games have actually been played.
  const recordedTo = recordPredictions(matches, predictions, spreadPredictions);
  console.log(`\nRecorded predictions to ${recordedTo}`);
  console.log(
    "Once this week's games are played, fill in `actualWinner` for each match in that file and run `npm run score`.",
  );

  // Close up shop
  await closeBrowser();
})();
