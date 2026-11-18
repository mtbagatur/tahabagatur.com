// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'python3 scripts/serve.py 8787',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
