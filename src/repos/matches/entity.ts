import { ArticleRepo, Article } from "../articles";
import { TeamStatsRepo, TeamStats, TeamStatType } from "../stats";
import { TeamRepo } from "../teams";
import { GameRepo, GameDetails } from "../games";
import { InjuryRepo, Injury } from "../injuries";
/**
 * A match up between two teams.
 *
 * e.g. If a given week has 16 games, then there are 16 matches.
 */
export class Match {
  /**
   * Creates a new instance of a Match.
   *
   * @param away The away team.
   * @param home The home team.
   * @returns A new instance of Match.
   */
  constructor(
    public away: string,
    public home: string,
    /**
     * The home team's spread line as posted in ESPN's own "against the
     * spread" Pick'em game mode — the actual number picks are graded
     * against, distinct from (and not always identical to) the general
     * market odds line from `GameRepo`/`gameDetails.odds`. Null if it
     * couldn't be scraped (e.g. no line posted yet, or the page layout
     * changed).
     */
    public homeSpread: number | null = null,
    /**
     * True for the one match each week that ESPN uses as the tiebreaker
     * question ("How many total points will be scored in ___ v. ___?") —
     * almost always the Monday night game. Used to decide which match, if
     * any, needs a total-points prediction alongside the usual winner/
     * spread picks. False if the tiebreaker couldn't be matched to a
     * scraped match (e.g. the page layout changed).
     */
    public isTiebreaker: boolean = false,
  ) {}

  /**
   * Get the list of articles associated with the given teams in the match.
   *
   * @returns {Promise<Article[]>} The list of articles for the week associated with the given teams.
   */
  public async articles(): Promise<Article[]> {
    const teams = [this.away, this.home];
    return new ArticleRepo().findByTeams(teams);
  }

  /**
   * Get all of this season's stats for the teams in this match.
   *
   * @returns {Promise<{[key in TeamStatType]: TeamStats[]}>} The stats for the teams
   */
  public async stats(): Promise<{ [key in TeamStatType]: TeamStats[] }> {
    const teams = [this.away, this.home];
    const repo = new TeamStatsRepo();

    const stats: { [key in TeamStatType]: TeamStats[] } = {
      [TeamStatType.OFFENSE]: [],
      [TeamStatType.DEFENSE]: [],
      [TeamStatType.TURNOVER]: [],
      [TeamStatType.SPECIAL]: [],
    };

    for (const type of Object.values(TeamStatType)) {
      for (const team of teams) {
        const stat = await repo.findByTeamAndType(team, type);
        if (stat == null) {
          throw new Error(`No stats found for ${team} and ${type}`);
        }
        stats[type].push(stat);
      }
    }

    return stats;
  }

  /**
   * Get supplementary details for this matchup: each team's recent form,
   * the market's odds for the game (if posted), and their most recent
   * meeting (if it falls within either team's last 5 games).
   *
   * @returns {Promise<GameDetails | null>} The game details, or null if
   *   they couldn't be found/scraped.
   */
  public async gameDetails(): Promise<GameDetails | null> {
    const teams = await new TeamRepo().findAll([this.away, this.home]);
    const [away, home] = teams;
    return new GameRepo().findDetails(away!, home!);
  }

  /**
   * Get the current injury report for both teams in this match.
   *
   * @returns {Promise<{away: Injury[], home: Injury[]}>} Each team's injuries.
   */
  public async injuries(): Promise<{ away: Injury[]; home: Injury[] }> {
    const repo = new InjuryRepo();
    const [away, home] = await Promise.all([
      repo.findByTeam(this.away),
      repo.findByTeam(this.home),
    ]);
    return { away, home };
  }
}
