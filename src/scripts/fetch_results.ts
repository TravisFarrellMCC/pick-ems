import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { PredictionRecord } from "../utils/tracking";
import { Match } from "../repos";
import { resolveCover } from "../tools/predict_spread";

const PREDICTIONS_DIR = path.join(process.cwd(), "predictions");
const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

interface EspnCompetitor {
  team: { displayName: string };
  score: string;
  homeAway: "home" | "away";
}

interface EspnEvent {
  status: { type: { completed: boolean } };
  competitions: Array<{ competitors: EspnCompetitor[] }>;
}

interface FinalScore {
  awayScore: number;
  homeScore: number;
}

/**
 * Fetches every completed game's final score from ESPN's public scoreboard
 * API for the given date range, keyed by `${awayName}@${homeName}` (team
 * full display names, which match the convention already used elsewhere in
 * this repo — see Team.name).
 *
 * This hits ESPN's JSON API directly rather than scraping a rendered page
 * (unlike the rest of `repos/`, which scrapes HTML via Playwright): the
 * scoreboard page's `?week=`/`?year=` params turned out to be ignored
 * (always returns the current week regardless), but `?dates=` ranges work
 * and this endpoint returns clean structured data anyway, so there's no
 * DOM to keep up with here.
 */
async function fetchFinalScores(
  start: Date,
  end: Date,
): Promise<Map<string, FinalScore>> {
  const format = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `${SCOREBOARD_URL}?dates=${format(start)}-${format(end)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `ESPN scoreboard request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { events?: EspnEvent[] };
  const results = new Map<string, FinalScore>();

  for (const event of data.events ?? []) {
    if (!event.status.type.completed) {
      continue;
    }

    const competitors = event.competitions[0]?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === "away");
    const home = competitors.find((c) => c.homeAway === "home");
    if (away == null || home == null) {
      continue;
    }

    const key = `${away.team.displayName}@${home.team.displayName}`;
    results.set(key, {
      awayScore: parseInt(away.score, 10),
      homeScore: parseInt(home.score, 10),
    });
  }

  return results;
}

/**
 * Same predicted-margin-vs-line comparison `predictSpread` uses, just fed
 * the actual final margin instead of the model's predicted one — reusing
 * `resolveCover` keeps the "what counts as a cover" logic in one place.
 */
function resolveActualAtsWinner(
  match: Match,
  homeSpread: number | null,
  awayScore: number,
  homeScore: number,
): string | null {
  const actualMargin = homeScore - awayScore;
  const result = resolveCover(actualMargin, 1, homeSpread, match);
  if (result.homeSpread == null) {
    return null;
  }
  return result.push ? "PUSH" : result.atsWinner;
}

/**
 * The file to update: an explicit path/filename passed as the first CLI
 * arg, or (by default) the most recently written file under `predictions/`.
 */
function targetFile(): string {
  const arg = process.argv[2];
  if (arg != null) {
    return path.isAbsolute(arg) ? arg : path.join(PREDICTIONS_DIR, arg);
  }

  const files = readdirSync(PREDICTIONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  if (latest == null) {
    throw new Error(`No prediction files found in ${PREDICTIONS_DIR}`);
  }

  return path.join(PREDICTIONS_DIR, latest);
}

/**
 * The filename is an ISO timestamp written at prediction time (see
 * `recordPredictions`), always shortly before that week's games. We widen
 * it into a search window (a day before, through over a week after) rather
 * than trying to pin down exact kickoff dates, since that's all the
 * scoreboard API needs to bracket the whole week (Thursday night through
 * the following Monday night).
 */
function searchWindow(filepath: string): { start: Date; end: Date } {
  const stem = path.basename(filepath, ".json");
  const isoLike = stem.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/,
    "$1T$2:$3:$4",
  );
  const recordedAt = new Date(isoLike);
  if (Number.isNaN(recordedAt.getTime())) {
    throw new Error(
      `Could not parse a timestamp out of filename "${stem}" — pass an explicit predictions file if this wasn't produced by \`npm run start\`.`,
    );
  }

  const DAY = 24 * 60 * 60 * 1000;
  return {
    start: new Date(recordedAt.getTime() - DAY),
    end: new Date(recordedAt.getTime() + 8 * DAY),
  };
}

async function main(): Promise<void> {
  const filepath = targetFile();
  const records: PredictionRecord[] = JSON.parse(
    readFileSync(filepath, "utf8"),
  );

  const unscored = records.filter((r) => r.actualWinner == null);
  if (unscored.length === 0) {
    console.log(`Every game in ${path.basename(filepath)} is already scored.`);
    return;
  }

  const { start, end } = searchWindow(filepath);
  console.log(
    `Fetching final scores from ESPN for ${start.toISOString().slice(0, 10)} through ${end.toISOString().slice(0, 10)}...`,
  );
  const finals = await fetchFinalScores(start, end);

  let updated = 0;
  for (const record of records) {
    if (record.actualWinner != null) {
      continue;
    }

    const final = finals.get(`${record.away}@${record.home}`);
    if (final == null) {
      continue;
    }

    const { awayScore, homeScore } = final;
    record.actualWinner =
      awayScore === homeScore
        ? "TIE"
        : awayScore > homeScore
          ? record.away
          : record.home;
    record.actualAtsWinner = resolveActualAtsWinner(
      new Match(record.away, record.home),
      record.homeSpread,
      awayScore,
      homeScore,
    );
    updated++;
  }

  writeFileSync(filepath, JSON.stringify(records, null, 2));

  const stillPending = unscored.length - updated;
  console.log(
    `Updated ${updated}/${unscored.length} game(s) in ${path.basename(filepath)}.`,
  );
  if (stillPending > 0) {
    console.log(
      `${stillPending} game(s) haven't finished yet (or weren't found on ESPN) — left as null. Re-run this once they've wrapped up.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
