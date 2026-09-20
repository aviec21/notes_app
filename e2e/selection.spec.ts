import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'

async function seed(server: import('./fake-server').FakeServer) {
  const work = await server.addFolder('Work')
  await server.addNote('Quarterly plan', 'roadmap', { folderId: work })
  await server.addNote('Groceries', 'milk and eggs')
  await server.addNote('Ideas', 'something new')
}

async function downloadText(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()])
  return { name: download.suggestedFilename(), text: readFileSync((await download.path())!, 'utf8') }
}

test.describe('on a computer', () => {
  // Playwright requires the first argument to be a destructuring pattern, even an empty one.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'android', 'computer layout only')
  })

  test('checkboxes are always there, and Delete asks with the themed dialog', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await expect(page.getByRole('checkbox', { name: 'Select Groceries' })).toBeVisible()

    let nativeDialog = false
    page.on('dialog', (d) => {
      nativeDialog = true
      void d.dismiss()
    })
    await page.getByRole('checkbox', { name: 'Select Groceries' }).check()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Move to recycle bin?')
    await dialog.getByRole('button', { name: 'Move to bin' }).click()

    await expect(page.getByText('Groceries', { exact: true })).toHaveCount(0)
    expect(nativeDialog).toBe(false) // the browser's own box never appeared
  })

  test('keyboard shortcuts: Ctrl+A selects all, Escape clears, N makes a note', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await expect(page.getByText('Groceries', { exact: true })).toBeVisible()
    await page.locator('body').click({ position: { x: 5, y: 5 } })

    await page.keyboard.press('Control+a')
    await expect(page.getByText(/3 selected/)).toBeVisible() // the folder and two loose notes
    await page.keyboard.press('Escape')
    await expect(page.getByText(/selected/)).toHaveCount(0)

    await page.keyboard.press('n')
    await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible()
  })

  test('exports the selected folder and note as one Markdown file with a heading hierarchy', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('checkbox', { name: 'Select Work' }).check()
    await page.getByRole('checkbox', { name: 'Select Groceries' }).check()

    const file = await downloadText(page, () => page.getByRole('button', { name: /^Export/ }).click())
    expect(file.name).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.md$/)
    const headings = file.text.split('\n').filter((l) => /^#{1,6} /.test(l))
    expect(headings).toEqual(['# Notes export', '## Contents', '## Work', '### Quarterly plan', '## Groceries'])
    expect(file.text).toContain('roadmap')
    expect(file.text).toContain('milk and eggs')
    expect(file.text).not.toContain('Ideas')
  })

  test('a single note exports as a file named after it', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('checkbox', { name: 'Select Groceries' }).check()
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('x')])
    expect(download.suggestedFilename()).toBe('Groceries.md')
  })

  test('pins from the bar and the note moves to the Pinned section', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('checkbox', { name: 'Select Ideas' }).check()
    await page.getByRole('button', { name: 'Pin', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pinned' })).toBeVisible()
  })
})

test.describe('on a phone', () => {
  // Playwright requires the first argument to be a destructuring pattern, even an empty one.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'android', 'phone layout only')
  })

  /** A real touch-and-hold, sent to the browser as touch events. */
  async function longPress(page: Page, target: import('@playwright/test').Locator, holdMs = 700) {
    const b = (await target.boundingBox())!
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await page.waitForTimeout(holdMs)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  test('touch and hold starts selecting, without opening the note', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await longPress(page, page.locator('[data-card]', { hasText: 'Groceries' }))

    await expect(page.getByText(/1 selected/)).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Select Groceries' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveCount(0) // still on the list

    await page.getByRole('checkbox', { name: 'Select Ideas' }).check() // more can be added by tapping
    await expect(page.getByText(/2 selected/)).toBeVisible()
  })

  test('a quick touch does not select, it opens', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.locator('[data-card]', { hasText: 'Groceries' }).tap()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toBeVisible()
  })

  test('scrolling with a finger does not trigger a selection', async ({ device, server }) => {
    for (let i = 0; i < 30; i++) await server.addNote(`Note ${i}`, 'text')
    const { page } = await device()
    const card = page.locator('[data-card]').first()
    const b = (await card.boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const x = b.x + b.width / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: b.y + 40 }] })
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: b.y + 40 - step * 25 }] })
      await page.waitForTimeout(90)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.getByText(/selected/)).toHaveCount(0)
  })

  test('the bar shows Move, Delete and More, and More holds the rest', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await longPress(page, page.locator('[data-card]', { hasText: 'Groceries' }))
    const names = await page.locator('[data-toolbar] button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()))
    expect(names).toEqual(['Clear selection', 'Move', 'Delete', 'More actions'])

    await page.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('dialog')
    // Each item may carry a short hint line, so match the start of each.
    await expect(menu.getByRole('menuitem')).toHaveText([/^Export as Markdown/, /^Copy as Markdown/, /^Rename/, /^Tag/, /^Pin/, /^Select all/])
  })

  test('Rename from the More menu changes the note', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await longPress(page, page.locator('[data-card]', { hasText: 'Groceries' }))
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /Rename/ }).click()
    const box = page.getByRole('dialog').getByRole('textbox')
    await box.fill('Shopping list')
    await box.press('Enter')
    await expect(page.getByText('Shopping list', { exact: true })).toBeVisible()
  })

  test('Export from the More menu downloads a Markdown file', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await longPress(page, page.locator('[data-card]', { hasText: 'Ideas' }))
    await page.getByRole('button', { name: 'More actions' }).click()
    const file = await downloadText(page, () => page.getByRole('menuitem', { name: /Export/ }).click())
    expect(file.name).toBe('Ideas.md')
    expect(file.text).toContain('# Ideas')
    expect(file.text).toContain('something new')
  })

  test('the â˜° menu opens Settings, How to use and Keyboard shortcuts', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['Settings', 'How to use', 'Keyboard shortcuts'])
    await page.getByRole('menuitem', { name: 'How to use' }).click()
    await page.getByRole('searchbox', { name: /Search help/ }).fill('restore')
    await expect(page.getByRole('dialog')).toContainText('Restore from the recycle bin')
  })
})
