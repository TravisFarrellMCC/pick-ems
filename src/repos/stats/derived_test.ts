import { computeDerivedStats } from "./derived";
import { TeamStats, TeamStatType } from "./entity";

function buildStats(
  offense: { pointsPerGame: string; yardsPerGame: string },
  defense: { pointsPerGame: string; yardsPerGame: string },
  turnoverRatio: string,
): { [key in TeamStatType]: TeamStats[] } {
  return {
    [TeamStatType.OFFENSE]: [
      new TeamStats("Away Team", TeamStatType.OFFENSE, {
        "Total Points Per Game": offense.pointsPerGame,
        "Net Yards Per Game": offense.yardsPerGame,
      }),
      new TeamStats("Home Team", TeamStatType.OFFENSE, {
        "Total Points Per Game": "20.0",
        "Net Yards Per Game": "350.0",
      }),
    ],
    [TeamStatType.DEFENSE]: [
      new TeamStats("Away Team", TeamStatType.DEFENSE, {
        "Total Points Per Game": defense.pointsPerGame,
        "Net Yards Per Game": defense.yardsPerGame,
      }),
      new TeamStats("Home Team", TeamStatType.DEFENSE, {
        "Total Points Per Game": "20.0",
        "Net Yards Per Game": "350.0",
      }),
    ],
    [TeamStatType.TURNOVER]: [
      new TeamStats("Away Team", TeamStatType.TURNOVER, {
        "Turnover Ratio": turnoverRatio,
      }),
      new TeamStats("Home Team", TeamStatType.TURNOVER, {
        "Turnover Ratio": "0",
      }),
    ],
    [TeamStatType.SPECIAL]: [
      new TeamStats("Away Team", TeamStatType.SPECIAL, {}),
      new TeamStats("Home Team", TeamStatType.SPECIAL, {}),
    ],
  };
}

test("computes positive point/yard differential and turnover margin", () => {
  const stats = buildStats(
    { pointsPerGame: "27.5", yardsPerGame: "410.2" },
    { pointsPerGame: "18.0", yardsPerGame: "330.0" },
    "+8",
  );

  const derived = computeDerivedStats(stats, 0);

  expect(derived.pointDifferential).toBeCloseTo(9.5);
  expect(derived.yardDifferential).toBeCloseTo(80.2);
  expect(derived.turnoverMargin).toBe(8);
});

test("computes negative differentials for a team that's worse than its opponents", () => {
  const stats = buildStats(
    { pointsPerGame: "14.0", yardsPerGame: "290.0" },
    { pointsPerGame: "26.0", yardsPerGame: "400.0" },
    "-5",
  );

  const derived = computeDerivedStats(stats, 0);

  expect(derived.pointDifferential).toBeCloseTo(-12.0);
  expect(derived.yardDifferential).toBeCloseTo(-110.0);
  expect(derived.turnoverMargin).toBe(-5);
});

test("strips thousands separators when parsing raw stat strings", () => {
  const stats = buildStats(
    { pointsPerGame: "24.0", yardsPerGame: "1,234.5" },
    { pointsPerGame: "20.0", yardsPerGame: "1,000.0" },
    "0",
  );

  const derived = computeDerivedStats(stats, 0);

  expect(derived.yardDifferential).toBeCloseTo(234.5);
});

test("treats a non-numeric stat value as zero instead of NaN", () => {
  const stats = buildStats(
    { pointsPerGame: "N/A", yardsPerGame: "300.0" },
    { pointsPerGame: "20.0", yardsPerGame: "300.0" },
    "0",
  );

  const derived = computeDerivedStats(stats, 0);

  expect(derived.pointDifferential).toBe(-20);
  expect(Number.isNaN(derived.pointDifferential)).toBe(false);
});

test("treats missing stat keys as zero instead of throwing or NaN", () => {
  const stats = buildStats(
    { pointsPerGame: "", yardsPerGame: "300.0" },
    { pointsPerGame: "20.0", yardsPerGame: "300.0" },
    "0",
  );

  const derived = computeDerivedStats(stats, 0);

  expect(derived.pointDifferential).toBe(-20);
  expect(Number.isNaN(derived.pointDifferential)).toBe(false);
});
