import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test",
  testMatch: "ui.spec.js",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3031",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node test/ui-server.mjs",
    url: "http://127.0.0.1:3031",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
