import { expect, test } from "@playwright/test";

const KEEPER = "1377306985065619456";
const DYNASTY = "1315718697288990720";
const SHOTS = process.env.SHOT_DIR ?? "e2e/screenshots";

test("setup flow links a Sleeper user and lands on league cards", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/setup");
  await page.getByPlaceholder("Sleeper username").fill("demo");
  await page.screenshot({ path: `${SHOTS}/1-setup.png` });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("http://localhost:3100/");
  await expect(page.getByRole("heading", { name: "The Real Deal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dynasty League" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/2-home.png` });
});

test("dynasty roster dashboard renders starters, strength, and demo banner", async ({ page }) => {
  await page.goto(`/league/${DYNASTY}`);
  await expect(page.getByTestId("source-banner")).toBeVisible();
  await expect(page.getByText("Starters")).toBeVisible();
  await expect(page.getByTestId("strength-bars")).toBeVisible();
  await expect(page.getByText("Taxi squad")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/3-roster-dynasty.png`, fullPage: true });
});

test("keeper roster dashboard renders with KTC context values", async ({ page }) => {
  await page.goto(`/league/${KEEPER}`);
  await expect(page.getByText("Starters")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/4-roster-keeper.png` });
});

test("trade analyzer evaluates a player-plus-pick swap", async ({ page }) => {
  await page.goto(`/league/${DYNASTY}/trade`);

  // The full asset browser lists every rostered player (12 in the fixture,
  // taxi/IR included) plus the complete pick inventory — no truncation.
  const listA = page.getByTestId("asset-list-A");
  const optionCount = await listA.getByRole("listitem").count();
  expect(optionCount).toBeGreaterThanOrEqual(24);
  await expect(listA.getByText("Draft picks")).toBeVisible();
  await expect(listA.getByText("TAXI").first()).toBeVisible();

  const sideA = page.getByTestId("trade-side-A");
  await sideA.getByPlaceholder("Filter players & picks…").fill("1st");
  await sideA.getByRole("button", { name: /1st/ }).first().click();

  const sideB = page.getByTestId("trade-side-B");
  await sideB.getByRole("listitem").locator("button").first().click();

  const verdict = page.getByTestId("verdict-panel");
  await expect(verdict).toBeVisible();
  await expect(verdict.getByText(/Fair trade|favors/i).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/5-trade.png`, fullPage: true });
});

test("strategy page shows value table, matrix, picks, rookies", async ({ page }) => {
  await page.goto(`/league/${DYNASTY}/strategy`);
  await expect(page.getByTestId("team-value-table").locator("tbody tr")).toHaveCount(10);
  await expect(page.getByTestId("contender-matrix")).toBeVisible();
  await expect(page.getByTestId("pick-grid")).toBeVisible();
  const rookieRows = page.getByTestId("rookie-watchlist").locator("> div");
  expect(await rookieRows.count()).toBeGreaterThan(3);
  await page.screenshot({ path: `${SHOTS}/6-strategy.png`, fullPage: true });
});

test("start/sit stub renders", async ({ page }) => {
  await page.goto(`/league/${KEEPER}/startsit`);
  await expect(page.getByText("coming in v2")).toBeVisible();
});
