import { resolveCover, impliedWinner } from "./tool";
import { Match } from "../../repos";

const match = new Match("Away Team", "Home Team");

test("home team covers when predicted margin beats a home favorite's line", () => {
  // Home favored by 6.5 (homeSpread = -6.5); predicting home wins by 10 clears it.
  const result = resolveCover(10, 0.7, -6.5, match);

  expect(result.atsWinner).toBe("Home Team");
  expect(result.push).toBe(false);
});

test("away team covers when the home favorite is predicted to win by less than the line", () => {
  // Home favored by 6.5; predicting home only wins by 3 doesn't clear it.
  const result = resolveCover(3, 0.7, -6.5, match);

  expect(result.atsWinner).toBe("Away Team");
  expect(result.push).toBe(false);
});

test("away team covers when the home favorite is predicted to lose outright", () => {
  const result = resolveCover(-2, 0.6, -6.5, match);

  expect(result.atsWinner).toBe("Away Team");
});

test("home underdog covers by losing narrowly", () => {
  // Home getting 6.5 points (homeSpread = +6.5); predicted to lose by 3 still covers.
  const result = resolveCover(-3, 0.65, 6.5, match);

  expect(result.atsWinner).toBe("Home Team");
});

test("home underdog fails to cover by losing by more than the points received", () => {
  const result = resolveCover(-10, 0.65, 6.5, match);

  expect(result.atsWinner).toBe("Away Team");
});

test("reports a push when the predicted margin lands exactly on the line", () => {
  const result = resolveCover(6.5, 0.5, -6.5, match);

  expect(result.push).toBe(true);
  expect(result.atsWinner).toBeNull();
});

test("returns null atsWinner with no push when there's no line to compare against", () => {
  const result = resolveCover(4, 0.55, null, match);

  expect(result.atsWinner).toBeNull();
  expect(result.push).toBe(false);
  expect(result.homeSpread).toBeNull();
  expect(result.predictedMargin).toBe(4);
});

test("impliedWinner picks the home team on a positive margin", () => {
  expect(impliedWinner(7, match)).toBe("Home Team");
});

test("impliedWinner picks the away team on a negative margin", () => {
  expect(impliedWinner(-7, match)).toBe("Away Team");
});

test("impliedWinner is null on an exact tie prediction", () => {
  expect(impliedWinner(0, match)).toBeNull();
});
