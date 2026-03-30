import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'PORT=3010 npm run start',
    url: 'http://127.0.0.1:3010/brains',
    timeout: 120_000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: process.env.BRIAN_E2E_BASE_URL || 'http://127.0.0.1:3010',
    headless: true,
  },
})
