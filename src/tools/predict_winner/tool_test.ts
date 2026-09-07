import { aggregate } from "./tool";

test("returns the sole result unchanged when there's only one sample", () => {
  const result = aggregate([{ winningTeam: "Bengals", winProbability: 0.7 }]);

  expect(result.winningTeam).toBe("Bengals");
  expect(result.winProbability).toBeCloseTo(0.7);
  expect(result.consensus).toBe(1);
  expect(result.samples).toBe(1);
});

test("picks the majority winner across multiple samples", () => {
  const result = aggregate([
    { winningTeam: "Bengals", winProbability: 0.6 },
    { winningTeam: "Bengals", winProbability: 0.7 },
    { winningTeam: "Lions", winProbability: 0.55 },
  ]);

  expect(result.winningTeam).toBe("Bengals");
  expect(result.samples).toBe(3);
  expect(result.consensus).toBeCloseTo(2 / 3);
});

test("averages win probability only across samples that agreed with the winner", () => {
  const result = aggregate([
    { winningTeam: "Bengals", winProbability: 0.6 },
    { winningTeam: "Bengals", winProbability: 0.8 },
    { winningTeam: "Lions", winProbability: 0.9 },
  ]);

  // Should average (0.6 + 0.8) / 2, not include Lions' 0.9.
  expect(result.winProbability).toBeCloseTo(0.7);
});

test("reports full consensus when every sample agrees", () => {
  const result = aggregate([
    { winningTeam: "Bengals", winProbability: 0.55 },
    { winningTeam: "Bengals", winProbability: 0.65 },
  ]);

  expect(result.consensus).toBe(1);
});

test("breaks a tie deterministically by keeping the first-seen team", () => {
  const result = aggregate([
    { winningTeam: "Bengals", winProbability: 0.6 },
    { winningTeam: "Lions", winProbability: 0.6 },
  ]);

  expect(result.winningTeam).toBe("Bengals");
  expect(result.consensus).toBe(0.5);
});
