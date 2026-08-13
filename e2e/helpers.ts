import type { Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./constants";

export async function loginWithPassword(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("password (dev only)").fill(password);
  await page.getByRole("button", { name: "Password sign-in" }).click();
  // successful sign-in does a full navigation (window.location.href = next, default "/"); wait
  // for it to land before callers navigate elsewhere, or a race causes net::ERR_ABORTED. The
  // onboarding spec's fresh user gets redirected /  -> /welcome server-side, so wait for either.
  await page.waitForURL(/\/(welcome)?$/);
}
