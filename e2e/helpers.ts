import type { Page } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./constants";

export async function loginWithPassword(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
  await page.getByPlaceholder("password (dev only)").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Password sign-in" }).click();
  // successful sign-in does a full navigation (window.location.href = "/"); wait for it
  // to land before callers navigate elsewhere, or a race causes net::ERR_ABORTED.
  await page.waitForURL("/");
}
