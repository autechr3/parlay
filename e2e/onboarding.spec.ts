import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";
import { ONBOARD_TEST_EMAIL, ONBOARD_TEST_PASSWORD } from "./constants";

// The onboarding test user's fixture state (no curriculum, onboarded_at null) is reset every run
// in e2e/global-setup.ts rather than torn down here — see that file's comment for why.

test("fresh user is routed through the wizard, skip stamps onboarded_at", async ({ page }) => {
  await loginWithPassword(page, ONBOARD_TEST_EMAIL, ONBOARD_TEST_PASSWORD);

  // A brand-new user with no curriculum and onboarded_at null gets bounced from "/" to "/welcome"
  // server-side before any client JS runs.
  await expect(page).toHaveURL("/welcome");

  // Step 1: language choice. Only "fa" is seeded locally, rendered as its native name.
  const farsiCard = page.getByRole("button", { name: /فارسی/ });
  await expect(farsiCard).toBeVisible();

  // Selecting the language advances straight to step 2 (StepSkill) — no separate "Next" click.
  await farsiCard.click();
  await expect(page.getByRole("heading", { name: "Install your tutor skill" })).toBeVisible();
  await expect(page.locator("pre")).toContainText("import_content_package");

  // Skip setup (header button) stamps onboarded_at and lands on the empty-library CTA.
  await page.getByRole("button", { name: "Skip setup" }).click();
  await expect(page).toHaveURL("/curriculums");
  await expect(page.getByRole("heading", { name: "Set up your AI tutor" })).toBeVisible();

  // Revisiting "/" no longer redirects to /welcome — onboarded_at is set, even with zero
  // curriculums (the dashboard shows its own "set up your AI tutor" fallback instead).
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("seeded user with a curriculum is not redirected to /welcome", async ({ page }) => {
  await loginWithPassword(page);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("day streak")).toBeVisible();
});
