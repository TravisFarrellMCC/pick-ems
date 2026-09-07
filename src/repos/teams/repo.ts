import { Team } from "./entity";
import { navigateTo } from "../../utils";

const URL = "https://www.espn.com/nfl/teams";
const WAIT_FOR = "#fittPageContainer";
const SELECTOR = ".TeamLinks h2";

/**
 * A repository for retrieving the full set of teams in the NFL.
 */
export class TeamRepo {
  // Cached list of teams
  private static teams: Team[] | null = null;

  /**
   * Find a team by name.
   *
   * @param name The name of the team to find.
   * @returns {Promise<Team>} The team with the given name.
   * @throws {Error} If no team with the given name exists.
   */
  public async find(name: string): Promise<Team> {
    const teams = await this.list();

    for (const team of teams) {
      if (team.name === name) {
        return team;
      }
    }

    throw new Error(`Could not find team with name: ${name}`);
  }

  /**
   * Find a team by its ESPN abbreviation (e.g. "cin"). Case-insensitive.
   *
   * Several ESPN pages (schedule, odds, injuries) only expose a team's
   * abbreviation or slug rather than its full display name, so this is the
   * join key used to reconcile those pages with the canonical team list.
   *
   * @param abbreviation The abbreviation of the team to find.
   * @returns {Promise<Team>} The team with the given abbreviation.
   * @throws {Error} If no team with the given abbreviation exists.
   */
  public async findByAbbreviation(abbreviation: string): Promise<Team> {
    const teams = await this.list();
    const target = abbreviation.toLowerCase();

    for (const team of teams) {
      if (team.abbreviation.toLowerCase() === target) {
        return team;
      }
    }

    throw new Error(`Could not find team with abbreviation: ${abbreviation}`);
  }

  /**
   * Find a list of teams by name.
   *
   * @param names The names of the teams to find.
   * @returns {Promise<Team[]>} The teams with the given names.
   * @throws {Error} If any of the given names do not exist.
   */
  public findAll(names: string[]): Promise<Team[]> {
    return Promise.all(names.map((name) => this.find(name)));
  }

  /**
   * Get the list of teams in the NFL.
   *
   * @returns {Promise<Team[]>} The list of teams in the NFL.
   */
  public async list(): Promise<Team[]> {
    if (TeamRepo.teams == null) {
      TeamRepo.teams = await TeamRepo.fetch();
    }
    return TeamRepo.teams;
  }

  /**
   * Navigates to the page containing the list of teams in the NFL
   * and scrapes them.
   *
   * Each team name is a link to `/nfl/team/_/name/{abbreviation}/{slug}`
   * (e.g. `/nfl/team/_/name/cin/cincinnati-bengals`), which is where we pull
   * the abbreviation and slug from.
   *
   * @returns {Promise<Team[]>} The list of teams in the NFL.
   */
  private static async fetch(): Promise<Team[]> {
    const locator = await navigateTo(URL, WAIT_FOR);
    const headers = await locator.locator(SELECTOR).all();

    const teams: Team[] = [];
    for (const header of headers) {
      const name = await header.textContent();
      if (name == null) {
        continue;
      }

      const anchor = header.locator("xpath=ancestor::a[1]");
      const href = await anchor.getAttribute("href");
      const match = href?.match(/\/name\/([^/]+)\/([^/]+)/);

      if (match == null) {
        throw new Error(`Could not parse team identity from href: ${href}`);
      }

      const [, abbreviation, slug] = match;
      teams.push(new Team(name, abbreviation!, slug!));
    }

    return teams;
  }
}
