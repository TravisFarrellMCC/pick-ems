import { Locator } from "playwright";
import { Match } from "./entity";
import { navigateTo, parseSignedNumber, getBrowserInstance } from "../../utils";
import { CONFIG } from "../../config";

const URL = `https://fantasy.espn.com/games/nfl-pickem-${CONFIG.NFL_SEASON}/picks`;
const WAIT_FOR = ".EntryContent";
const MATCH_LOCATOR = ".Proposition-content";
const TEAM_LOCATOR = ".OutcomeDetails-title";
// ESPN's Pick'em splits "Standard" (straight-up) and "Spread" into separate
// game modes on the same URL, switched client-side via this control rather
// than a distinct page — there's no way to land directly on the spread
// picks via navigation alone.
const SPREAD_MODE_BUTTON =
  'div:has(> .GameModeOption-button):has-text("Pick winners against the spread.") .GameModeOption-button';
const SELECTED_WEEK = ".EntryScoringPeriodItem--selected";
const SPREAD_LOCATOR = ".OutcomeDetails-spreadPill";

/**
 * A repository for retrieving and mutating Matches for the current week.
 */
export class MatchRepo {
  // Cached list of matches for the week.
  private static matches: Match[] | null = null;

  /**
   * Get the list of matches for the week.
   *
   * This returns one entry for each game that will be played, each containing
   * the two teams that will play.
   *
   * @returns {Promise<Match[]>} The list of matches for the week.
   */
  public async list(): Promise<Match[]> {
    if (MatchRepo.matches == null) {
      MatchRepo.matches = await MatchRepo.fetch();
    }
    return MatchRepo.matches;
  }

  /**
   * Navigates to the page containing this week's matches
   * and scrapes them.
   *
   * The table of game matches looks like:
   *
   *  ┌──────────────────────────────────────────────────────┐
   *  │ MATCH_LOCATOR                                        │
   *  │ │  ┌────────────────────┬──────────────────────────┐ │
   *  │ ├─→│ TEAM_LOCATOR       │ TEAM_LOCATOR             │ │
   *  │ │  ├────────────────────┼──────────────────────────┤ │
   *  │ ├─→│ TEAM_LOCATOR       │ TEAM_LOCATOR             │ │
   *  │ │  ├────────────────────┼──────────────────────────┤ │
   *  │ └─→│ TEAM_LOCATOR       │ TEAM_LOCATOR             │ │
   *  │    └────────────────────┴──────────────────────────┘ │
   *  └──────────────────────────────────────────────────────┘
   *
   * Each row in the table is a game match, and each game match has two teams.
   */
  private static async fetch(): Promise<Match[]> {
    const page = await navigateTo(URL, WAIT_FOR);
    const rows = await page.locator(MATCH_LOCATOR).all();

    // Retrieve the raw text from each cell in each row.
    const rawTeams = await Promise.all(
      rows.map((match) => match.locator(TEAM_LOCATOR).allTextContents()),
    );

    // Validate that the rows match our shape assumptions.
    if (rawTeams.some((teams) => teams.length !== 2)) {
      throw new Error("Unexpected number of teams in a match");
    }

    // Validate we're not reading empty cells or something
    if (
      rawTeams.some((teams) =>
        teams.some((team) => team == null || team === ""),
      )
    ) {
      throw new Error("Expected a team name, but found an empty cell");
    }

    const homeSpreads = await MatchRepo.fetchSpreadLines(page);

    // Note: We can safely assume no nulls because we validated the shape.
    return rawTeams.map(
      ([away, home]) =>
        new Match(away!, home!, homeSpreads.get(`${away}@${home}`) ?? null),
    );
  }

  /**
   * Switches the same page over to the "Spread" game mode (see
   * SPREAD_MODE_BUTTON above) and scrapes each matchup's posted spread —
   * the actual line ESPN's against-the-spread pool grades picks against,
   * as opposed to the general market odds `GameRepo` reads from a
   * different ESPN page.
   *
   * Best-effort: this is supplementary to the straight-up matches already
   * scraped above, so any failure here (control removed, markup changed,
   * no line posted yet) just means `Match.homeSpread` comes back null for
   * everything rather than failing the whole run.
   */
  private static async fetchSpreadLines(
    page: Locator,
  ): Promise<Map<string, number>> {
    const lines = new Map<string, number>();

    try {
      // The mode-switch control and week selector live outside the
      // `.EntryContent` scope `page` (from navigateTo) is limited to, so
      // they need the real Page. The matchup rows read afterward, though,
      // render back inside `.EntryContent` once the spread mode loads, so
      // `page` works fine for those.
      const fullPage = await getBrowserInstance();
      await fullPage.locator(SPREAD_MODE_BUTTON).click();

      const selectedWeek = fullPage.locator(SELECTED_WEEK).first();
      await selectedWeek.waitFor({ state: "visible", timeout: 10000 });
      await selectedWeek.click();

      const rows = await page.locator(MATCH_LOCATOR).all();
      for (const row of rows) {
        const teams = await row.locator(TEAM_LOCATOR).allTextContents();
        const spreadTexts = await row.locator(SPREAD_LOCATOR).allTextContents();

        if (teams.length !== 2 || spreadTexts.length !== 2) {
          continue;
        }

        const [away, home] = teams;
        const [, homeSpreadText] = spreadTexts;
        const homeSpread = parseSignedNumber(homeSpreadText!);

        if (away && home && homeSpread != null) {
          lines.set(`${away}@${home}`, homeSpread);
        }
      }
    } catch (e) {
      // Fall through with whatever (possibly empty) lines we'd already
      // parsed — see docstring above.
    }

    return lines;
  }
}
