/**
 * The outcome of a single played game, from one team's perspective.
 */
export interface RecentGameResult {
  /** The opponent's full team name. */
  opponent: string;
  /** e.g. "1/4/26" */
  date: string;
  location: "HOME" | "AWAY";
  outcome: "W" | "L" | "T";
  teamScore: number;
  opponentScore: number;
}

/**
 * A team's market odds for a specific game. Values are null when the
 * market/book hasn't posted a line for this game yet (e.g. too far out).
 */
export interface TeamOdds {
  /** Point spread, from this team's perspective. Negative means favored. */
  spread: number | null;
  overUnder: number | null;
  /** American moneyline odds. Negative means favored. */
  moneyline: number | null;
}

export interface GameOdds {
  away: TeamOdds;
  home: TeamOdds;
}

/**
 * Supplementary detail for one specific matchup, beyond season-long stats:
 * each team's recent form, the market's odds for the game, and (when we
 * happen to have it in the last-5-games window) their most recent meeting.
 */
export class GameDetails {
  constructor(
    public gameId: string,
    public recentForm: { away: RecentGameResult[]; home: RecentGameResult[] },
    public odds: GameOdds | null,
    /**
     * The two teams' most recent meeting, if it happened to fall within
     * either team's last 5 games. This is opportunistic, not a full
     * head-to-head series history (ESPN doesn't expose one on this page) —
     * it will often be null, especially for non-divisional matchups.
     */
    public headToHead: RecentGameResult | null,
  ) {}
}
