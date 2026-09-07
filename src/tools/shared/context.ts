import { Match, TeamStats, TeamStatType, Article } from "../../repos";
import { GameDetails, RecentGameResult } from "../../repos/games";
import { Injury } from "../../repos/injuries";
import { computeDerivedStats } from "../../repos/stats";
import { toMarkdown, appendTable } from "../../utils";

/**
 * The full block of match context (derived stats, recent form,
 * head-to-head, market odds, injuries, full season stats, news) shared by
 * every prediction tool (`predict_winner`, `predict_spread`, ...). Each
 * tool's prompt wraps this with its own task-specific framing and closing
 * instructions — the underlying data these tasks reason over is identical,
 * only the question being asked of it differs.
 */
export function buildMatchContext(
  stats: { [key in TeamStatType]: TeamStats[] },
  match: Match,
  articles: Article[],
  gameDetails: GameDetails | null,
  injuries: { away: Injury[]; home: Injury[] },
): string {
  const awayDerived = computeDerivedStats(stats, 0);
  const homeDerived = computeDerivedStats(stats, 1);

  return `
Key Derived Signals (season-long)
====================================
These are the highest-signal numbers to anchor on before digging into the raw stat tables below: point differential and yard differential per game, and turnover margin for the season.

  * ${match.away}: point differential ${awayDerived.pointDifferential > 0 ? "+" : ""}${awayDerived.pointDifferential}/game, yard differential ${awayDerived.yardDifferential > 0 ? "+" : ""}${awayDerived.yardDifferential}/game, turnover margin ${awayDerived.turnoverMargin > 0 ? "+" : ""}${awayDerived.turnoverMargin}
  * ${match.home}: point differential ${homeDerived.pointDifferential > 0 ? "+" : ""}${homeDerived.pointDifferential}/game, yard differential ${homeDerived.yardDifferential > 0 ? "+" : ""}${homeDerived.yardDifferential}/game, turnover margin ${homeDerived.turnoverMargin > 0 ? "+" : ""}${homeDerived.turnoverMargin}

Recent Form (last 5 games played, most recent first)
====================================
A team's form over its last few games is often more predictive than its season-long average, especially if the season-long stats include games from very different circumstances (injuries since resolved, a bye week reset, a coaching change, etc). Each entry also shows whether that recent game was home or away.

${formatRecentForm(match.away, gameDetails?.recentForm.away ?? [])}

${formatRecentForm(match.home, gameDetails?.recentForm.home ?? [])}
${formatHeadToHead(match, gameDetails?.headToHead ?? null)}
Market Odds
====================================
${formatOdds(match, gameDetails)}

Injury Report
====================================
This is ESPN's structured injury report, not just whatever happened to be mentioned in a news headline — treat it as more complete/reliable than the articles below for injury status specifically.

${formatInjuries(match.away, injuries.away)}

${formatInjuries(match.home, injuries.home)}

Full Season Stats
====================================
${Object.values(TeamStatType)
  .map(
    (type) => `
${type}
====================================
${toMarkdown(appendTable(stats[type][0]!.toTable(), stats[type][1]!.toTable()))}
`,
  )
  .join("\n")}

${
  articles.length == 0
    ? ""
    : `
Here are some possibly relevant news articles to help you:
${articles
  .map(
    (article) => `
****************************************
${article.title}
===
${article.summary}
****************************************
`,
  )
  .join("\n")}`
}`;
}

function formatRecentGame(game: RecentGameResult): string {
  const location = game.location === "HOME" ? "vs" : "@";
  return `${game.date}: ${location} ${game.opponent} — ${game.outcome} ${game.teamScore}-${game.opponentScore}`;
}

function formatRecentForm(teamName: string, games: RecentGameResult[]): string {
  if (games.length === 0) {
    return `${teamName}: No recent game data available.`;
  }

  const wins = games.filter((g) => g.outcome === "W").length;
  const losses = games.filter((g) => g.outcome === "L").length;
  const ties = games.filter((g) => g.outcome === "T").length;
  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  return `${teamName} (${record} in last ${games.length}):
${games.map((g) => `  * ${formatRecentGame(g)}`).join("\n")}`;
}

/**
 * Describes the market odds for both teams. Exported separately (not just
 * used internally) because `predict_spread`'s prompt needs to call out the
 * home spread specifically as the line to beat, beyond this general
 * description.
 */
export function formatOdds(
  match: Match,
  gameDetails: GameDetails | null,
): string {
  if (gameDetails?.odds == null) {
    return "No market odds are available for this game yet.";
  }

  const { away, home } = gameDetails.odds;
  const describe = (name: string, odds: typeof away) => {
    const parts: string[] = [];
    if (odds.spread != null) {
      parts.push(`spread ${odds.spread > 0 ? "+" : ""}${odds.spread}`);
    }
    if (odds.moneyline != null) {
      parts.push(`moneyline ${odds.moneyline > 0 ? "+" : ""}${odds.moneyline}`);
    }
    if (odds.overUnder != null) {
      parts.push(`over/under ${odds.overUnder}`);
    }
    return `  * ${name}: ${parts.join(", ")}`;
  };

  return `Sportsbook lines for this game (a negative spread/moneyline means the market favors that team; these are a well-calibrated aggregate signal, but not infallible — weigh them alongside the stats and news below, don't defer to them blindly):
${describe(match.away, away)}
${describe(match.home, home)}`;
}

function formatHeadToHead(
  match: Match,
  headToHead: RecentGameResult | null,
): string {
  if (headToHead == null) {
    return "";
  }

  return `
Most Recent Meeting Between These Two Teams
====================================
On ${headToHead.date}, ${match.away} played ${match.home} (${headToHead.location === "AWAY" ? "away" : "home"} for ${match.away}) and the result was ${match.away} ${headToHead.teamScore}, ${match.home} ${headToHead.opponentScore} (${headToHead.outcome === "W" ? `${match.away} won` : headToHead.outcome === "L" ? `${match.home} won` : "tied"}).
`;
}

function formatInjuries(teamName: string, injuries: Injury[]): string {
  if (injuries.length === 0) {
    return `${teamName}: No significant reported injuries.`;
  }

  return `${teamName}:
${injuries
  .map(
    (i) =>
      `  * ${i.player} (${i.position}) — ${i.status}, est. return ${i.estimatedReturn}. ${i.comment}`,
  )
  .join("\n")}`;
}
