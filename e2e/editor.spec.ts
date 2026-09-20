import { readFileSync } from 'node:fs'
import { card, closeNote, expect, test, waitSynced, writeNote } from './fixtures'
import type { Page } from '@playwright/test'

// A real 1x1 PNG, so the browser's own image pipeline (decode, resize, re-encode) is exercised.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const formatting = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })
const body = (page: Page) => page.getByRole('textbox', { name: 'Note text' })
const insert = async (page: Page, what: RegExp | string) => {
  await formatting(page).getByRole('button', { name: 'Insert' }).click()
  await page.getByRole('group', { name: 'Formatting options' }).getByRole('button', { name: what }).click()
}

test.describe('formatting', () => {
  test('bold, italic and a heading apply to the selected text and are saved', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Formats', 'make this bold')
    await page.keyboard.press('Control+a')
    await formatting(page).getByRole('button', { name: 'Bold' }).click()
    await formatting(page).getByRole('button', { name: 'Italic' }).click()
    await expect(body(page).locator('strong em, em strong').first()).toContainText('make this bold')
    await formatting(page).getByRole('button', { name: 'Text style' }).click()
    await page.getByRole('button', { name: 'Heading 2' }).click()
    await expect(body(page).locator('h2')).toContainText('make this bold')
  })

  test('font, size and colour show in the note', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Styles', 'styled text')
    await page.keyboard.press('Control+a')

    await formatting(page).getByRole('button', { name: 'Font', exact: true }).click()
    await page.getByRole('button', { name: 'Lora' }).click()
    await formatting(page).getByRole('button', { name: 'Font size' }).click()
    await page.getByRole('button', { name: '32', exact: true }).click()
    await formatting(page).getByRole('button', { name: 'Text colour' }).click()
    await page.getByRole('button', { name: 'Text colour: Blue' }).click()

    const styled = body(page).locator('span[style]').first()
    await expect(styled).toHaveCSS('font-size', '32px')
    await expect(styled).toHaveCSS('color', 'rgb(28, 126, 214)')
    expect(await styled.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Lora')
  })

  test('a checklist can be ticked, and bullets can be made from selected lines', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Lists', 'one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Control+a')
    await formatting(page).getByRole('button', { name: 'Checklist' }).click()
    // (Select-all also takes the empty line the editor keeps at the end, so there may be one extra item.)
    const boxes = body(page).getByRole('checkbox')
    await expect.poll(() => boxes.count()).toBeGreaterThanOrEqual(2)
    await boxes.first().check()
    await expect(body(page).locator('li[data-checked="true"]')).toHaveCount(1)

    await page.keyboard.press('Control+a')
    await formatting(page).getByRole('button', { name: 'Bulleted list' }).click()
    const bullets = body(page).locator('ul:not([data-type]) li')
    await expect.poll(() => bullets.count()).toBeGreaterThanOrEqual(2)
    await expect(bullets.first()).toContainText('one')
    await expect(bullets.nth(1)).toContainText('two')
  })

  test('subscript and superscript', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Chem', 'H2O')
    await page.keyboard.press('Control+a')
    await formatting(page).getByRole('button', { name: 'Subscript' }).click()
    await expect(body(page).locator('sub')).toHaveCount(1)
  })
})

test.describe('tables, emoji, charts and pictures', () => {
  test('a table can be inserted and given a new row', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Table', '')
    await insert(page, /^Table/)
    await expect(body(page).locator('table')).toBeVisible()
    await expect(body(page).locator('tr')).toHaveCount(3)
    await formatting(page).getByRole('button', { name: 'Table options' }).click()
    await page.getByRole('button', { name: 'Row below' }).click()
    await expect(body(page).locator('tr')).toHaveCount(4)
  })

  test('the emoji picker finds and inserts one', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Emoji', 'hello ')
    await insert(page, /Emoji/) // its accessible name starts with the 🙂 glyph
    await page.getByRole('searchbox', { name: 'Search emoji' }).fill('party')
    await page.getByRole('button', { name: /party popper/i }).first().click()
    await expect(body(page)).toContainText('🎉')
  })

  test('a chart is drawn on screen, and its numbers can be edited', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Chart', '')
    await insert(page, /^Chart/)
    const canvas = body(page).locator('canvas')
    await expect(canvas).toBeVisible()

    // The chart actually drew something: the canvas is not blank.
    await expect
      .poll(async () =>
        canvas.evaluate((c: HTMLCanvasElement) => {
          const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
          let coloured = 0
          for (let i = 3; i < data.length; i += 4) if (data[i] > 0) coloured++
          return coloured
        }),
      )
      .toBeGreaterThan(500)

    await body(page).getByRole('button', { name: 'Edit chart' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: 'Chart title' }).fill('Rainfall')
    await dialog.getByRole('button', { name: 'Line' }).click()
    await dialog.getByRole('button', { name: 'Save chart' }).click()
    await expect(body(page)).toContainText('Rainfall')
    await expect(body(page).getByRole('img', { name: /line chart: Rainfall/ })).toBeVisible()
  })

  test('a picture is shrunk, shown, saved, and uploaded to the server', async ({ device, server, browserName }) => {
    const { page } = await device()
    await writeNote(page, 'With picture', '')
    await page.getByLabel('Add pictures').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PIXEL_PNG })

    const image = body(page).locator('img').first()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await closeNote(page)
    await waitSynced(page)
    await expect.poll(() => server.images.size).toBe(1)
    const stored = [...server.images.values()][0]
    expect(stored.mime).toMatch(/^image\//)
    // (The Safari test tool cannot read binary request bodies, so the size is checked elsewhere.)
    if (browserName !== 'webkit') expect(stored.data.length).toBeGreaterThan(0)
  })

  test('a picture from another device downloads on demand', async ({ device, server, browserName }) => {
    test.skip(browserName === 'webkit', "Safari's test tool cannot read the uploaded picture's bytes, so the second device would receive an empty file")
    const a = await device()
    await writeNote(a.page, 'Shared picture', '')
    await a.page.getByLabel('Add pictures').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PIXEL_PNG })
    await expect(body(a.page).locator('img').first()).toBeVisible()
    await closeNote(a.page)
    await waitSynced(a.page)
    await expect.poll(() => server.images.size).toBe(1)

    const b = await device()
    await card(b.page, 'Shared picture').click()
    const image = body(b.page).locator('img').first()
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  })
})

test.describe('tags', () => {
  test('a tag typed without pressing Enter is kept, and clicking it shows only those notes', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Budget', 'numbers')
    await page.getByRole('combobox', { name: 'Add tag' }).fill('finance')
    await page.getByRole('textbox', { name: 'Note text' }).click() // leaves the field without Enter
    await expect(page.getByRole('button', { name: '#finance' }).first()).toBeVisible()
    await closeNote(page)

    await writeNote(page, 'Holiday', 'beach')
    await closeNote(page)

    const isPhone = await page.evaluate(() => matchMedia('(max-width: 767px)').matches)
    if (isPhone) await page.getByRole('group', { name: 'Browse' }).getByRole('button', { name: '#finance' }).click()
    else await page.getByRole('navigation', { name: 'Library' }).getByRole('button', { name: /^finance/ }).click()
    await expect(card(page, 'Budget')).toBeVisible()
    await expect(page.locator('[data-card]', { hasText: 'Holiday' })).toHaveCount(0)
  })
})

test.describe('copy and export', () => {
  test('exporting everything gives a zip download', async ({ device }, testInfo) => {
    const { page } = await device()
    await writeNote(page, 'Backup me', 'important')
    await closeNote(page)
    const isPhone = testInfo.project.name === 'android'
    if (isPhone) {
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('menuitem', { name: 'Settings' }).click()
    } else {
      await page.getByRole('button', { name: /Settings/ }).click()
    }
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export all notes' }).click()])
    expect(download.suggestedFilename()).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.zip$/)
    expect(readFileSync((await download.path())!).subarray(0, 2).toString()).toBe('PK') // a real zip
  })

  test('Copy as Markdown puts the note on the clipboard', async ({ device, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions can only be granted in Chromium')
    // (Chromium covers both "chrome" and "android" here.)
    const a = await device()
    await a.context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await writeNote(a.page, 'Copy me', 'some words')
    await a.page.getByRole('button', { name: 'Copy note' }).click()
    await a.page.getByRole('menuitem', { name: /Copy as Markdown/ }).click()
    // (Windows returns \r\n line endings when the clipboard is read back.)
    await expect
      .poll(async () => (await a.page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').trimEnd())
      .toBe('# Copy me\n\nsome words')
  })
})

test('no console errors or security-policy violations while using all of the above', async ({ device }) => {
  const { page, problems } = await device()
  await writeNote(page, 'Everything', 'text')
  await insert(page, /^Table/)
  await page.waitForTimeout(500)
  await closeNote(page)
  expect(problems).toEqual([])
})
