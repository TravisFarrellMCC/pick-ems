import { TeamStats, TeamStatType } from "./entity";

/**
 * A handful of derived, curated signals computed from the raw scraped stat
 * tables. The raw tables have 20-30+ columns per team, many of which are
 * marginal (e.g. punt return fair catches). Point/yard/turnover margins are
 * consistently among the stats most correlated with winning, so we surface
 * them explicitly rather than relying on the LLM to notice and compute them
 * itself from a wall of raw numbers.
 */
export interface DerivedStats {
  /** Points scored per game minus points allowed per game. */
  pointDifferential: number;
  /** Net yards gained per game minus net yards allowed per game. */
  yardDifferential: number;
  /** Takeaways minus giveaways for the season (ESPN's own "Turnover Ratio"). */
  turnoverMargin: number;
}

/**
 * Parses a stat value that may contain thousands separators (e.g. "4,557")
 * or a leading sign (e.g. "+5", "-3") into a number.
 */
function parseStatNumber(value: string | undefined): number {
  if (value == null) {
    return 0;
  }
  const cleaned = value.replace(/,/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Computes derived stats for one team from the full set of per-type stats
 * for a match.
 *
 * @param stats The stats for the match, as returned by `Match.stats()`.
 * @param index Which team to compute for: 0 for away, 1 for home (matches
 *   the order `Match.stats()` pushes teams in).
 * @returns {DerivedStats} The derived stats for the team.
 */
export function computeDerivedStats(
  stats: { [key in TeamStatType]: TeamStats[] },
  index: 0 | 1,
): DerivedStats {
  const offense = stats[TeamStatType.OFFENSE][index]!.stats;
  const defense = stats[TeamStatType.DEFENSE][index]!.stats;
  const turnover = stats[TeamStatType.TURNOVER][index]!.stats;

  const pointsFor = parseStatNumber(offense["Total Points Per Game"]);
  const pointsAgainst = parseStatNumber(defense["Total Points Per Game"]);
  const yardsFor = parseStatNumber(offense["Net Yards Per Game"]);
  const yardsAgainst = parseStatNumber(defense["Net Yards Per Game"]);
  const turnoverMargin = parseStatNumber(turnover["Turnover Ratio"]);

  return {
    pointDifferential: Math.round((pointsFor - pointsAgainst) * 10) / 10,
    yardDifferential: Math.round((yardsFor - yardsAgainst) * 10) / 10,
    turnoverMargin,
  };
}
