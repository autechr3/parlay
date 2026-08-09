import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 60_000,
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: !process.env.CI },
});
