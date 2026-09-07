import { ArticleRepo, Article } from "../articles";
import { TeamStatsRepo, TeamStats, TeamStatType } from "../stats";

/**
 * Represents a team.
 */
export class Team {
  /**
   * Creates a new instance of Team.
   *
   * @param name The full display name of the team (e.g. "Cincinnati Bengals").
   * @param abbreviation ESPN's short code for the team (e.g. "cin"). Used to
   *   join this team's identity across pages that only expose an
   *   abbreviation/slug (schedule, odds, injuries) instead of the full name.
   * @param slug ESPN's URL slug for the team (e.g. "cincinnati-bengals").
   */
  constructor(
    public name: string,
    public abbreviation: string,
    public slug: string,
  ) {}

  /**
   * Get the list of articles associated with the team.
   *
   * @returns {Promise<Article[]>} The list of articles for the given teams.
   */
  public async articles(): Promise<Article[]> {
    return new ArticleRepo().findByTeams([this.name]);
  }

  /**
   * Get a particular type of stats for this team's season.
   *
   * @returns {Promise<{[key in TeamStatType]: TeamStats[]}>} The stats for this team.
   */
  public async stats(type: TeamStatType): Promise<TeamStats> {
    const stat = await new TeamStatsRepo().findByTeamAndType(this.name, type);
    if (stat == null) {
      throw new Error(`No stats found for ${this.name} and ${type}`);
    }

    return stat;
  }
}
