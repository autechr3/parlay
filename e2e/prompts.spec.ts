import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test("prompts page renders the Create a course section when signed in", async ({ page }) => {
  await loginWithPassword(page);
  await page.goto("/prompts");
  await expect(page.getByRole("heading", { name: "Create a course" })).toBeVisible();
});
