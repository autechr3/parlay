import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test("flashcards deck flips to conjugation table", async ({ page }) => {
  await loginWithPassword(page);
  await page.goto("/flashcards?deck=conjugations");

  // The dev server compiles this route's client bundle on first visit, so the
  // keydown listener may not be attached the instant the page "loads". Flip is a
  // toggle (space press-before-hydration would otherwise silently be lost and a
  // later retry could flip back), so only press again while still unflipped.
  await expect(async () => {
    if (await page.locator("table").isVisible()) return;
    await page.keyboard.press(" ");
    await expect(page.locator("table")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
});
