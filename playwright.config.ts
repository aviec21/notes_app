import { defineConfig, devices } from '@playwright/test'

// End-to-end tests in real browsers: Chrome, Firefox and Safari's engine on a computer,
// plus Chrome as an Android phone (touch, small screen).
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Several real browsers at once is heavy; two at a time keeps timing-based checks steady.
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    // 127.0.0.1 rather than "localhost": Safari's engine is unreliable with cookies on the latter.
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Tests run against the real production build, served the way it will be in production.
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
})
