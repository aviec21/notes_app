import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { card, expect, test, waitSynced } from './fixtures'

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' })

async function seed(server: import('./fake-server').FakeServer) {
  const work = await server.addFolder('Work')
  await server.addNote('Quarterly plan', 'the roadmap for the quarter', { folderId: work })
  await server.addNote('Groceries', 'milk and eggs, plus a Roadmap sticker')
  await server.addNote('Ideas', 'something new')
  return work
}

const iconColor = (page: Page, title: string) =>
  card(page, title).locator('svg[style*="color"]').first().evaluate((el) => getComputedStyle(el).color)

for (const theme of ['light', 'dark'] as const) {
  test.describe(`search highlighting (${theme} theme)`, () => {
    test.use({ colorScheme: theme })

    test('matched words are marked in titles and previews, and the results pass an accessibility scan', async ({ device, server }) => {
      await seed(server)
      const { page } = await device()
      await searchBox(page).fill('roadmap')

      const marks = page.locator('mark.search-hit')
      await expect(marks.first()).toBeVisible()
      // Case-insensitive: the lower-case query also marks "Roadmap" typed with a capital.
      const texts = (await marks.allTextContents()).map((t) => t.toLowerCase())
      expect(texts.length).toBeGreaterThanOrEqual(2)
      expect(new Set(texts)).toEqual(new Set(['roadmap']))
      await expect(page.locator('[data-card]', { hasText: 'Ideas' })).toHaveCount(0)

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 100)}`)).toEqual([])
    })
  })

  test.describe(`folder colours (${theme} theme)`, () => {
    test.use({ colorScheme: theme })

    test('a colour picked for a folder shows on its icon, in this theme, and reaches another device', async ({ device, server }) => {
      await seed(server)
      const { page } = await device()
      await card(page, 'Work').click()
      await page.getByRole('button', { name: 'Color', exact: true }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('button', { name: 'No colour' })).toHaveAttribute('aria-pressed', 'true')
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 100)}`)).toEqual([])

      await dialog.getByRole('button', { name: 'Blue' }).click()
      await expect(dialog).toHaveCount(0)
      await page.getByRole('button', { name: 'Back to notes' }).click()

      const expected = theme === 'light' ? 'rgb(28, 111, 196)' : 'rgb(116, 192, 252)'
      await expect.poll(() => iconColor(page, 'Work')).toBe(expected)

      // Another device signs in and receives the colour with the folder.
      await waitSynced(page)
      const other = await device()
      await expect.poll(() => iconColor(other.page, 'Work')).toBe(expected)

      // "No colour" puts it back to plain.
      await card(page, 'Work').click()
      await page.getByRole('button', { name: 'Color', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'No colour' }).click()
      await page.getByRole('button', { name: 'Back to notes' }).click()
      await expect(card(page, 'Work').locator('svg[style*="color"]')).toHaveCount(0)
    })
  })
}
