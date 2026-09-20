import { expect, test } from './fixtures'
import type { Locator, Page } from '@playwright/test'

const LONG = 'word '.repeat(3000)

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}

const cards = (page: Page) => page.locator('[data-card]')

async function seed(server: import('./fake-server').FakeServer) {
  await server.addNote('Short', 'hi')
  await server.addNote('A very long note', LONG)
  await server.addNote('Another with a rather long title that keeps going and going and going', 'text '.repeat(500))
  await server.addNote('Empty', '')
  await server.addFolder('Work')
}

test.describe('list view', () => {
  test('is the default, and every row is exactly the same height', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await expect(cards(page).first()).toBeVisible()

    expect(await page.locator('[data-card="grid"]').count()).toBe(0)
    const heights = await cards(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    expect(heights.length).toBe(5) // four notes and one folder
    expect(new Set(heights).size).toBe(1)
  })

  test('shows one line of preview, however long the note is', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    const long = page.locator('[data-card]', { hasText: 'A very long note' })
    await expect(long).toBeVisible()
    // The card must not grow to hold the text: it is no taller than the short one.
    const short = page.locator('[data-card]', { hasText: /^Short/ })
    expect((await box(long)).height).toBeCloseTo((await box(short)).height, 0)
    // And the text is cut off inside the card rather than spilling out of it.
    const clipped = await long.evaluate((el) => {
      const preview = el.querySelector('span.truncate.text-sm') as HTMLElement
      return preview.scrollWidth > preview.clientWidth
    })
    expect(clipped).toBe(true)
  })
})

test.describe('grid view', () => {
  test('every card has the same size, with at most two lines of preview', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('button', { name: 'Grid view' }).click()
    await expect(page.locator('[data-card="grid"]').first()).toBeVisible()

    const sizes = await cards(page).evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect()
      return `${Math.round(r.width)}x${Math.round(r.height)}`
    }))
    expect(new Set(sizes).size).toBe(1)

    // The long note's preview shows no more than two lines of text.
    const long = page.locator('[data-card]', { hasText: 'A very long note' })
    const lines = await long.evaluate((el) => {
      const preview = el.querySelector('span.line-clamp-2') as HTMLElement
      return Math.round(preview.getBoundingClientRect().height / parseFloat(getComputedStyle(preview).lineHeight))
    })
    expect(lines).toBeLessThanOrEqual(2)
  })

  test('the choice is remembered after a reload', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    await page.getByRole('button', { name: 'Grid view' }).click()
    await page.reload()
    await expect(page.locator('[data-card="grid"]').first()).toBeVisible()
  })
})

test.describe('the top bar does not move when you select things', () => {
  test('same height, and the list stays exactly where it was', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    const isPhone = await page.evaluate(() => matchMedia('(max-width: 767px)').matches)
    const bar = page.locator('[data-toolbar]')
    await expect(cards(page).first()).toBeVisible()

    const barBefore = await box(bar)
    const firstBefore = await box(cards(page).first())

    if (isPhone) await page.getByRole('button', { name: 'Select' }).click()
    await page.getByRole('checkbox', { name: 'Select Short' }).check()
    await expect(page.getByText(/1 selected/)).toBeVisible()
    const one = { bar: await box(bar), first: await box(cards(page).first()) }

    await page.getByRole('checkbox', { name: 'Select Empty' }).check()
    await expect(page.getByText(/2 selected/)).toBeVisible()
    const two = { bar: await box(bar), first: await box(cards(page).first()) }

    await page.getByRole('checkbox', { name: 'Select Work' }).check() // a folder as well
    const withFolder = { bar: await box(bar), first: await box(cards(page).first()) }

    for (const state of [one, two, withFolder]) {
      expect(state.bar.height).toBe(barBefore.height)
      expect(state.bar.y).toBe(barBefore.y)
      expect(state.first.y).toBe(firstBefore.y) // the list did not shift
    }
  })

  test('the buttons are the same whether one or several are selected', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    const isPhone = await page.evaluate(() => matchMedia('(max-width: 767px)').matches)
    if (isPhone) await page.getByRole('button', { name: 'Select' }).click()
    const names = async () =>
      page.locator('[data-toolbar] button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim()))

    await page.getByRole('checkbox', { name: 'Select Short' }).check()
    const one = await names()
    await page.getByRole('checkbox', { name: 'Select Empty' }).check()
    const two = await names()
    expect(two).toEqual(one)
    if (!isPhone) {
      // Rename stays, greyed out.
      const rename = page.getByRole('button', { name: 'Rename' })
      await expect(rename).toBeVisible()
      await expect(rename).toBeDisabled()
    }
  })

  test('nothing overflows the screen sideways', async ({ device, server }) => {
    await seed(server)
    const { page } = await device()
    const isPhone = await page.evaluate(() => matchMedia('(max-width: 767px)').matches)
    if (isPhone) await page.getByRole('button', { name: 'Select' }).click()
    await page.getByRole('checkbox', { name: 'Select Short' }).check()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
