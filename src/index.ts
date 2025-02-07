import { closeBrowser } from "./utils";
import { predictWinner } from "./tools";
import { MatchRepo } from "./repos";

(async () => {
  // Get all of the game matches for this week
  const matches = await new MatchRepo().list();

  // Preload data (loads all data for all matches)
  await matches[0]!.articles();
  await matches[0]!.stats();

  // Predict the winner of each match in parallel
  const winners = await Promise.all(matches.map(predictWinner));

  matches.forEach((match, i) => {
    console.log(`${match.away} vs. ${match.home}: ${winners[i]}`);
  });

  // Close up shop
  await closeBrowser();
})();
