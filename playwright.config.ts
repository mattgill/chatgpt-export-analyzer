import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173/chatgpt-export-analytics-tool/', trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview:pages', url: 'http://127.0.0.1:4173/chatgpt-export-analytics-tool/', reuseExistingServer: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
