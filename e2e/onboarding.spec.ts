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

  // Selecting the language advances straight to step 2 (StepConnect) — no separate "Next" click.
  await farsiCard.click();
  await expect(
    page.getByRole("heading", { name: "Copy one prompt into your AI — it does the rest." }),
  ).toBeVisible();

  // The one-paste bootstrap prompt names get_tutor_instructions (it's what teaches the AI to
  // become the tutor and run the first-curriculum import) — it must be visible up front, not
  // hidden behind the manual fallback. Scope to the visible <pre> — the collapsed "Set up
  // manually instead" <details> below also contains a <pre> (the manual tutor skill), still
  // present in the DOM but hidden until expanded.
  await expect(page.locator("pre:visible")).toContainText("get_tutor_instructions");

  // The manual/advanced fallback (skill tabs + per-tool connector steps) is still reachable,
  // collapsed by default behind a <details>.
  await expect(page.getByText("Set up manually instead")).toBeVisible();

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
