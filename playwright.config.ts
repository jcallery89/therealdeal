import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1280, height: 900 },
    // Use the environment's pre-installed Chromium regardless of the
    // @playwright/test version's pinned browser build.
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "npm run start -- -p 3100",
    port: 3100,
    reuseExistingServer: true,
    timeout: 60_000,
    env: { SLEEPER_FIXTURES: "1" },
  },
});
