import { expect, test, writeNote } from './fixtures'

function report(testInfo: import('@playwright/test').TestInfo, label: string, value: string) {
  testInfo.annotations.push({ type: label, description: value })
  console.log('PERF [' + testInfo.project.name + '] ' + label + ': ' + value)
}

const BODY = 'The quick brown fox jumps over the lazy dog. '.repeat(20)

async function seedMany(server: import('./fake-server').FakeServer, count: number) {
  const folders = await Promise.all(Array.from({ length: 10 }, (_, i) => server.addFolder(`Folder ${i}`)))
  for (let i = 0; i < count; i++) {
    await server.addNote(`Note number ${i}`, `${BODY} unique-${i}`, { folderId: i % 3 === 0 ? folders[i % 10] : undefined })
  }
}

test.describe('with a lot of notes', () => {
  test.slow() // seeding and syncing thousands of notes takes a while

  test('thousands of notes: first sync, listing, search and scrolling stay quick', async ({ device, server, browserName }, testInfo) => {
    // Safari's engine on this Windows test machine is far slower than real Safari, so it gets a smaller library.
    const total = browserName === 'webkit' ? 600 : 3000
    await seedMany(server, total)
    const started = Date.now()
    const { page } = await device()
    const isPhone = testInfo.project.name === 'android'

    // The first sync pulls every note (in pages) and the list shows the ones not in folders.
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 60_000 })
    await expect
      .poll(() => page.evaluate(() => new Promise<number>((resolve) => {
        const open = indexedDB.open('notes-app')
        open.onsuccess = () => {
          const db = open.result
          const req = db.transaction('notes').objectStore('notes').count()
          req.onsuccess = () => resolve(req.result)
        }
      })), { timeout: 90_000 })
      .toBe(total)
    const syncSeconds = (Date.now() - started) / 1000
    report(testInfo, `first sync of ${total} notes`, `${syncSeconds.toFixed(1)} s`)

    // Only a page of cards is on screen at once (thousands would make a phone sluggish)...
    const cards = page.locator('[data-card]')
    const rendered = await cards.count()
    report(testInfo, 'cards on the page at first', String(rendered))
    expect(rendered).toBeLessThanOrEqual(130)

    // ...and more arrive as you scroll down.
    await page.mouse.wheel(0, 100_000).catch(() => {})
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await expect.poll(() => cards.count()).toBeGreaterThan(rendered)
    // Return to the top for the search test.
    await page.evaluate(() => window.scrollTo(0, 0))

    // Typing in search stays responsive: measure from the last keystroke to results appearing.
    const box = page.getByRole('searchbox', { name: 'Search notes' })
    await box.click()
    const t0 = Date.now()
    await page.keyboard.type(`unique-${total - 1}`, { delay: 10 })
    await expect(page.locator('[data-card]', { hasText: `Note number ${total - 1}` })).toBeVisible({ timeout: 10_000 })
    const searchMs = Date.now() - t0
    report(testInfo, 'search: typing to result', `${searchMs} ms`)
    expect(searchMs).toBeLessThan(6000)

    // No keystroke is left waiting for the page: the longest gap between frames stays small.
    const worstFrame = await page.evaluate(async () => {
      let worst = 0
      let last = performance.now()
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        const now = performance.now()
        worst = Math.max(worst, now - last)
        last = now
      }
      return Math.round(worst)
    })
    report(testInfo, 'longest idle frame', `${worstFrame} ms`)
    expect(worstFrame).toBeLessThan(isPhone ? 700 : 500)
  })

  test('the "Show more" button loads the next page', async ({ device, server }) => {
    for (let i = 0; i < 150; i++) await server.addNote(`Item ${String(i).padStart(3, '0')}`, 'text')
    const { page } = await device()
    const cards = page.locator('[data-card]')
    await expect(cards.first()).toBeVisible()
    await expect.poll(() => cards.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(60)
    const more = page.getByRole('button', { name: /^Show \d+ more/ })
    await expect(more).toBeVisible()
    const before = await cards.count()
    // Activate it directly: scrolling it into view would also trigger the automatic loading.
    await more.evaluate((button) => (button as HTMLButtonElement).click())
    await expect.poll(() => cards.count()).toBeGreaterThan(before)
  })

  test('a note with 200,000 characters still types and saves smoothly', async ({ device }, testInfo) => {
    const { page } = await device()
    await writeNote(page, 'Very long note', '')
    const body = page.getByRole('textbox', { name: 'Note text' })

    // Put a huge amount of text in at once (as pasting would), then type on the end of it.
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text).catch(() => {})
    }, 'x'.repeat(10))
    const big = ('lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40) + '\n').repeat(90) // ~200k chars
    await body.evaluate((el, text) => {
      const editor = (el as HTMLElement & { editor?: { commands: { setContent: (t: string) => void } } }).editor
      editor?.commands.setContent(text.split('\n').map((line) => `<p>${line}</p>`).join(''))
    }, big)
    await expect(body).toContainText('lorem ipsum')

    await body.click()
    await page.keyboard.press('Control+End')
    const t0 = Date.now()
    await page.keyboard.type('typed after the long text', { delay: 0 })
    const typingMs = Date.now() - t0
    report(testInfo, '24 keystrokes in a 200k-character note', `${typingMs} ms`)
    expect(typingMs).toBeLessThan(5000)

    await page.waitForTimeout(800) // autosave
    const saved = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('notes-app')
          open.onsuccess = () => {
            const req = open.result.transaction('notes').objectStore('notes').getAll()
            req.onsuccess = () => resolve((req.result as { contentText: string }[]).reduce((max, n) => Math.max(max, n.contentText.length), 0))
          }
        }),
    )
    expect(saved).toBeGreaterThan(190_000)
  })
})
