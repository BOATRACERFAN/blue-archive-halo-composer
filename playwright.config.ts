import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.HALO_BROWSER ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
    },
  },
  reporter: "list",
});
