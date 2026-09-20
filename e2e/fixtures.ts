import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { FakeServer } from './fake-server'

export interface Device {
  context: BrowserContext
  page: Page
  /** Console errors and Content-Security-Policy violations seen in this window. */
  problems: string[]
}

async function open(browser: Browser, server: FakeServer, options: Parameters<Browser['newContext']>[0]): Promise<Device> {
  const context = await browser.newContext(options)
  await server.attach(context)
  const page = await context.newPage()
  const problems: string[] = []
  page.on('console', (msg) => {
    // Before signing in, the app checks its session and gets a 401; browsers log that. Expected.
    // Also ignored: Safari's engine reports the Chrome-only "interactive-widget" viewport hint.
    if (msg.type() === 'error' && !/status of 401|interactive-widget/.test(msg.text())) problems.push(`console: ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`)
    })
  })
  return { context, page, problems }
}

export async function signIn(page: Page, pin = '123456') {
  await page.goto('/')
  await page.getByLabel('PIN', { exact: true }).fill(pin)
  await page.getByRole('button', { name: 'Unlock' }).click()
  // The notes screen has the search box (both on a phone and on a computer).
  await expect(page.getByRole('searchbox', { name: 'Search notes' })).toBeVisible()
}

export const test = base.extend<{
  server: FakeServer
  /**
   * Opens a signed-in browser window as a device of the same account. The app's offline
   * helper (service worker) is switched off unless asked for: some browser engines let its
   * requests slip past the test server, which would hide what the tests want to check.
   */
  device: (options?: { serviceWorker?: boolean }) => Promise<Device>
}>({
  // eslint-disable-next-line no-empty-pattern
  server: async ({}, provide) => provide(new FakeServer()),
  device: async ({ browser, server, contextOptions, colorScheme }, provide) => {
    const opened: Device[] = []
    await provide(async (options = {}) => {
      const device = await open(browser, server, {
        ...contextOptions,
        // (Not part of contextOptions, so pass it on: otherwise Firefox and Safari would test
        // the "dark theme" in light mode.)
        colorScheme,
        acceptDownloads: true,
        serviceWorkers: options.serviceWorker ? 'allow' : 'block',
      })
      opened.push(device)
      await signIn(device.page)
      return device
    })
    // Whatever a test did, the security policy must never have been violated and the page
    // must never have thrown an uncaught error.
    for (const d of opened) {
      expect(d.problems.filter((p) => /CSP violation|page error/.test(p))).toEqual([])
      await d.context.close()
    }
  },
})

export { expect }

/** Asks the app to sync now (the same thing that happens when a connection returns). */
export async function syncNow(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
}

/** How many changes are still waiting on this device to be sent (read from its own database). */
export function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('notes-app')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction('outbox').objectStore('outbox').count()
          req.onsuccess = () => {
            open.result.close()
            resolve(req.result)
          }
        }
      }),
  )
}

/**
 * Waits until everything this device has done has really been sent. (Looking for the word
 * "Synced" is not enough: right after an edit it is still on screen for a moment before it
 * changes to "1 change waiting".)
 */
export async function waitSynced(page: Page) {
  await syncNow(page)
  await expect.poll(() => outboxCount(page), { timeout: 20_000 }).toBe(0)
  await expect(page.getByRole('status').filter({ hasText: /^Synced$/ }).first()).toBeVisible({ timeout: 15_000 })
}

export const card = (page: Page, title: string) => page.locator('[data-card]', { hasText: title }).first()

/** Opens a note from the list and puts the cursor at the end of its text. */
export async function openNote(page: Page, title: string) {
  await card(page, title).click()
  const text = page.getByRole('textbox', { name: 'Note text' })
  await text.click()
  await page.keyboard.press('Control+End')
}

/** Leaves the open note (the side panel's Close, or the full-screen Back). */
export async function closeNote(page: Page) {
  await page.waitForTimeout(600) // let the autosave land
  await page.getByRole('button', { name: /^(Close|Back)$/ }).click()
  await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveCount(0)
}

/**
 * Opens the editor once while still online. The editor loads on first use, and an installed
 * app has already downloaded it, so tests that go offline do the same beforehand.
 */
export async function warmUpEditor(page: Page) {
  await writeNote(page, 'Warm-up', 'x')
  await closeNote(page)
}

/** Creates a note in the open app by typing into its title and body. */
export async function writeNote(page: Page, title: string, body: string) {
  const isPhone = await page.evaluate(() => matchMedia('(max-width: 767px)').matches)
  if (isPhone) await page.getByRole('button', { name: 'New note' }).click()
  else await page.getByRole('button', { name: /^Note$/ }).click()
  await page.getByRole('textbox', { name: 'Note title' }).fill(title)
  const text = page.getByRole('textbox', { name: 'Note text' })
  await text.click()
  await page.keyboard.type(body)
}
