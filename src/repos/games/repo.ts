import { Locator } from "playwright";
import { navigateTo } from "../../utils";
import { Team } from "../teams";
import { GameDetails, GameOdds, RecentGameResult, TeamOdds } from "./entity";

// NOTE: we can't wait on `[data-testid="opponent"]` directly since the
// schedule page has 20+ matches for it (one per game) and Playwright's
// strict mode requires a `waitFor` target to resolve to exactly one
// element. `#fittPageContainer` is ESPN's standard unique page wrapper.
const SCHEDULE_WAIT_FOR = "#fittPageContainer";
// NOTE: `navigateTo` returns a Locator *scoped to this selector*, not the
// whole page — every downstream `.locator()` call searches only within it.
// `.Gamestrip__StickyContainer` (the game's header strip) does NOT contain
// the last-5-games/odds sections, which live in sibling sections elsewhere
// on the page. `#fittPageContainer` is ESPN's outer wrapper that actually
// contains everything.
const MATCHUP_WAIT_FOR = "#fittPageContainer";

/**
 * A repository for retrieving details about a specific matchup that aren't
 * captured by season-long stats: recent form, market odds, and (when
 * available) the two teams' most recent meeting.
 */
export class GameRepo {
  private static gameIds: Map<string, string | null> = new Map();
  private static details: Map<string, GameDetails | null> = new Map();

  /**
   * Get the supplementary details for a matchup between two teams.
   *
   * @param away The away team.
   * @param home The home team.
   * @returns {Promise<GameDetails | null>} The game details, or null if the
   *   matchup couldn't be found on ESPN (e.g. too far in the future, or the
   *   page layout has changed).
   */
  public async findDetails(
    away: Team,
    home: Team,
  ): Promise<GameDetails | null> {
    const gameId = await this.findGameId(away, home);
    if (gameId == null) {
      return null;
    }

    if (!GameRepo.details.has(gameId)) {
      try {
        const details = await GameRepo.fetchDetails(gameId, away, home);
        GameRepo.details.set(gameId, details);
      } catch (e) {
        // Best-effort: this is supplementary signal, not required data. A
        // page layout change here shouldn't take down the whole prediction.
        GameRepo.details.set(gameId, null);
      }
    }

    return GameRepo.details.get(gameId)!;
  }

  /**
   * Resolves the ESPN gameId for a matchup between two teams by scanning
   * the away team's full-season schedule for a row whose opponent is the
   * home team.
   *
   * NOTE: If the two teams play each other twice in a season (division
   * rivals), this returns whichever meeting appears first in the schedule
   * table, which may be the one that's already been played rather than the
   * upcoming one. Good enough for a best-effort supplementary signal, but
   * worth knowing about.
   *
   * @param away The away team.
   * @param home The home team.
   * @returns {Promise<string | null>} The gameId, or null if not found.
   */
  private async findGameId(away: Team, home: Team): Promise<string | null> {
    const key = `${away.slug}@${home.slug}`;
    if (GameRepo.gameIds.has(key)) {
      return GameRepo.gameIds.get(key)!;
    }

    let gameId: string | null = null;
    try {
      gameId = await GameRepo.fetchGameId(away, home);
    } catch (e) {
      gameId = null;
    }

    GameRepo.gameIds.set(key, gameId);
    return gameId;
  }

  private static async fetchGameId(
    away: Team,
    home: Team,
  ): Promise<string | null> {
    const url = `https://www.espn.com/nfl/team/schedule/_/name/${away.abbreviation}`;
    const page = await navigateTo(url, SCHEDULE_WAIT_FOR);

    // The schedule rows hydrate in slightly after the page shell itself, so
    // wait for at least one to show up before searching for our opponent.
    await page
      .locator('[data-testid="opponent"]')
      .first()
      .waitFor({ state: "visible" });

    const opponentLinks = await page
      .locator(`[data-testid="opponent"] a[href*="${home.slug}"]`)
      .all();

    if (opponentLinks.length === 0) {
      return null;
    }

    const row = opponentLinks[0]!.locator("xpath=ancestor::tr[1]");
    const gameLink = row.locator('a[href*="gameId"]').first();
    const href = await gameLink.getAttribute("href");
    const match = href?.match(/gameId\/(\d+)/);

    return match?.[1] ?? null;
  }

  private static async fetchDetails(
    gameId: string,
    away: Team,
    home: Team,
  ): Promise<GameDetails> {
    const url = `https://www.espn.com/nfl/matchup?gameId=${gameId}`;
    const page = await navigateTo(url, MATCHUP_WAIT_FOR);

    const recentForm = await GameRepo.parseRecentForm(page);
    const odds = await GameRepo.parseOdds(page);
    const headToHead = GameRepo.findHeadToHead(recentForm, away, home);

    return new GameDetails(gameId, recentForm, odds, headToHead);
  }

  /**
   * Parses the "Last Five Games" widget, which shows each team's most
   * recent games (opponent, home/away, result, score).
   *
   * This section (like the odds section below) hydrates in after the page
   * shell (`MATCHUP_WAIT_FOR`) is already visible, so we wait for it
   * explicitly rather than assuming it's there as soon as navigation
   * resolves. If it never shows up (timeout), that means this game
   * genuinely doesn't have the widget (e.g. a bye/rare edge case), not
   * that we didn't wait long enough.
   */
  private static async parseRecentForm(
    page: Locator,
  ): Promise<{ away: RecentGameResult[]; home: RecentGameResult[] }> {
    const section = page.locator('[data-testid="lastGames"]');
    try {
      await section.first().waitFor({ state: "visible", timeout: 10000 });
    } catch (e) {
      return { away: [], home: [] };
    }

    const teamBlocks = await section.locator(".ResponsiveTable").all();

    if (teamBlocks.length < 2) {
      return { away: [], home: [] };
    }

    const [away, home] = await Promise.all([
      GameRepo.parseTeamRecentForm(teamBlocks[0]!),
      GameRepo.parseTeamRecentForm(teamBlocks[1]!),
    ]);

    return { away, home };
  }

  private static async parseTeamRecentForm(
    table: Locator,
  ): Promise<RecentGameResult[]> {
    const rows = await table.locator("tbody tr").all();
    const games: RecentGameResult[] = [];

    for (const row of rows) {
      const cells = await row.locator("td").all();
      if (cells.length < 3) {
        continue;
      }

      const date = (await cells[0]!.textContent())?.trim() ?? "";
      const location =
        (await cells[1]!.locator(".atVs").textContent())?.trim() === "@"
          ? "AWAY"
          : "HOME";
      const opponent =
        (await cells[1]!.locator(".OppAbbr").textContent())?.trim() ?? "";

      const outcomeText =
        (await cells[2]!
          .locator('[class*="GameResults"]')
          .textContent()
          .catch(() => null)) ?? "";
      const scoreText =
        (await cells[2]!
          .locator(".Score")
          .textContent()
          .catch(() => null)) ?? "";

      const outcome = outcomeText.trim().startsWith("W")
        ? "W"
        : outcomeText.trim().startsWith("L")
          ? "L"
          : "T";

      const [teamScore, opponentScore] = scoreText
        .trim()
        .split("-")
        .map((s) => parseInt(s.trim(), 10));

      if (
        date === "" ||
        opponent === "" ||
        teamScore == null ||
        opponentScore == null ||
        Number.isNaN(teamScore) ||
        Number.isNaN(opponentScore)
      ) {
        continue;
      }

      games.push({
        opponent,
        date,
        location,
        outcome,
        teamScore,
        opponentScore,
      });
    }

    return games;
  }

  /**
   * Parses the market odds (spread, total, moneyline) for both teams.
   * Returns null if no odds are posted for this game yet (or the widget
   * just hasn't hydrated within our wait budget — either way, null is the
   * right "no usable signal" answer).
   */
  private static async parseOdds(page: Locator): Promise<GameOdds | null> {
    const oddsCell = page.locator('[data-testid="OddsCell"]');
    try {
      await oddsCell.first().waitFor({ state: "visible", timeout: 5000 });
    } catch (e) {
      return null;
    }

    const cells = await oddsCell.all();
    if (cells.length < 6) {
      return null;
    }

    const values = await Promise.all(
      cells.slice(0, 6).map(async (cell) => {
        const text = await cell.locator("div").first().textContent();
        return text?.trim() ?? "";
      }),
    );

    const [
      awaySpread,
      awayTotal,
      awayMoneyline,
      homeSpread,
      homeTotal,
      homeMoneyline,
    ] = values;

    const away: TeamOdds = {
      spread: parseSignedNumber(awaySpread!),
      overUnder: parseSignedNumber(stripOverUnderPrefix(awayTotal!)),
      moneyline: parseSignedNumber(awayMoneyline!),
    };
    const home: TeamOdds = {
      spread: parseSignedNumber(homeSpread!),
      overUnder: parseSignedNumber(stripOverUnderPrefix(homeTotal!)),
      moneyline: parseSignedNumber(homeMoneyline!),
    };

    if (
      away.spread == null &&
      away.overUnder == null &&
      away.moneyline == null
    ) {
      return null;
    }

    return { away, home };
  }

  /**
   * Opportunistically finds a head-to-head meeting by checking if either
   * team's last 5 games lists the other team as the opponent. Only covers
   * meetings that happened to fall within that 5-game window — not a full
   * series history, which ESPN doesn't expose on this page.
   *
   * Always normalized to the *away* team's perspective (teamScore is the
   * away team's score) so callers don't need to know which team's list it
   * was originally found in.
   */
  private static findHeadToHead(
    recentForm: { away: RecentGameResult[]; home: RecentGameResult[] },
    away: Team,
    home: Team,
  ): RecentGameResult | null {
    const homeAbbreviation = home.abbreviation.toUpperCase();
    const awayAbbreviation = away.abbreviation.toUpperCase();

    const fromAway = recentForm.away.find(
      (g) => g.opponent.toUpperCase() === homeAbbreviation,
    );
    if (fromAway != null) {
      return fromAway;
    }

    const fromHome = recentForm.home.find(
      (g) => g.opponent.toUpperCase() === awayAbbreviation,
    );
    if (fromHome == null) {
      return null;
    }

    return {
      opponent: awayAbbreviation,
      date: fromHome.date,
      location: fromHome.location === "HOME" ? "AWAY" : "HOME",
      outcome:
        fromHome.outcome === "T" ? "T" : fromHome.outcome === "W" ? "L" : "W",
      teamScore: fromHome.opponentScore,
      opponentScore: fromHome.teamScore,
    };
  }
}

function parseSignedNumber(text: string): number | null {
  const match = text.match(/[-+]?\d+(\.\d+)?/);
  if (match == null) {
    return null;
  }
  const parsed = parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

function stripOverUnderPrefix(text: string): string {
  return text.replace(/^[ou]/i, "");
}
