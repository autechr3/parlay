import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test("login → dashboard → review a card with keyboard", async ({ page }) => {
  await loginWithPassword(page);
  await expect(page.getByText("day streak")).toBeVisible();

  await page.goto("/review");
  // recognition card: space reveals, "3" grades Good and advances
  const counter = page.getByText(/^1\/\d+/);
  await expect(counter).toBeVisible();

  // The dev server compiles this route's client bundle on first visit, so the
  // keydown listener may not be attached the instant the page "loads". Reveal
  // (space) is idempotent — it only ever sets revealed=true — so retrying the
  // press until the grade buttons appear is safe.
  await expect(async () => {
    await page.keyboard.press(" ");
    await expect(page.getByRole("button", { name: "Good" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });

  // Likewise grade() no-ops unless the card is revealed, so retrying "3" is safe too.
  await expect(async () => {
    await page.keyboard.press("3");
    await expect(page.getByText(/^2\/\d+/)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
});
