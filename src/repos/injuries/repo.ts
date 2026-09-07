import { navigateTo } from "../../utils";
import { Injury } from "./entity";

const URL = "https://www.espn.com/nfl/injuries";
const WAIT_FOR = "#fittPageContainer";

/**
 * A repository for retrieving the league-wide, structured injury report.
 *
 * This is more reliable than hoping an injury gets mentioned in a scraped
 * news headline: it's ESPN's dedicated, per-team injury table, updated
 * nightly with status, estimated return, and a short note per player.
 */
export class InjuryRepo {
  // Cached map of team name -> that team's injury report.
  private static injuriesByTeam: Map<string, Injury[]> | null = null;

  /**
   * Get the current injury report for a team.
   *
   * @param teamName The full display name of the team (e.g. "Cincinnati Bengals").
   * @returns {Promise<Injury[]>} The team's injury report, or an empty list
   *   if the team has no reported injuries (or wasn't found on the page).
   */
  public async findByTeam(teamName: string): Promise<Injury[]> {
    const all = await this.list();
    return all.get(teamName) ?? [];
  }

  private async list(): Promise<Map<string, Injury[]>> {
    if (InjuryRepo.injuriesByTeam == null) {
      InjuryRepo.injuriesByTeam = await InjuryRepo.fetchAll();
    }
    return InjuryRepo.injuriesByTeam;
  }

  /**
   * Navigates to the league-wide injuries page and scrapes each team's
   * table. The page renders one `.ResponsiveTable` per team, titled with
   * the team's full name, with rows of (name, position, est. return,
   * status, comment).
   *
   * @returns {Promise<Map<string, Injury[]>>} Team name -> injury report.
   */
  private static async fetchAll(): Promise<Map<string, Injury[]>> {
    const page = await navigateTo(URL, WAIT_FOR);
    const teamBlocks = await page.locator(".ResponsiveTable").all();

    const result = new Map<string, Injury[]>();
    for (const block of teamBlocks) {
      const teamName = (
        await block.locator(".Table__Title").textContent()
      )?.trim();
      if (teamName == null || teamName === "") {
        continue;
      }

      const rows = await block.locator("tbody tr").all();
      const injuries: Injury[] = [];

      for (const row of rows) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length < 5) {
          continue;
        }

        injuries.push({
          player: cells[0]!.trim(),
          position: cells[1]!.trim(),
          estimatedReturn: cells[2]!.trim(),
          status: cells[3]!.trim(),
          comment: cells[4]!.trim(),
        });
      }

      result.set(teamName, injuries);
    }

    return result;
  }
}
