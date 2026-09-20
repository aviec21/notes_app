import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test, writeNote } from './fixtures'

async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.map(
    (v) => `${label}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 110).replace(/\s+/g, ' ')}`,
  )
}

async function seed(server: import('./fake-server').FakeServer) {
  const work = await server.addFolder('Work')
  await server.addNote('Quarterly plan', 'roadmap for the quarter', { folderId: work })
  await server.addNote('Groceries', 'milk and eggs')
  await server.addNote('Ideas', 'something new', { pinned: true })
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${theme} theme)`, () => {
    test.use({ colorScheme: theme })

    test('sign-in screen', async ({ browser, server }) => {
      const context = await browser.newContext({ colorScheme: theme, serviceWorkers: 'block' })
      await server.attach(context)
      const page = await context.newPage()
      await page.goto('/')
      await expect(page.getByLabel('PIN', { exact: true })).toBeVisible()
      expect(await scan(page, 'login')).toEqual([])
      await context.close()
    })

    test('notes list, the sidebar or menu, and the recycle bin', async ({ device, server }, testInfo) => {
      await seed(server)
      const { page } = await device()
      await expect(page.locator('[data-card]').first()).toBeVisible()
      const found = [...(await scan(page, 'list'))]

      await page.getByRole('button', { name: 'Grid view' }).click()
      found.push(...(await scan(page, 'grid')))

      if (testInfo.project.name === 'android') await page.getByRole('button', { name: 'Select', exact: true }).click()
      await page.getByRole('checkbox', { name: 'Select Groceries' }).check()
      found.push(...(await scan(page, 'selection bar')))
      expect(found).toEqual([])
    })

    test('the editor with its formatting bar and every menu', async ({ device }) => {
      const { page } = await device()
      await writeNote(page, 'Accessible note', 'some text to format')
      const bar = page.getByRole('toolbar', { name: 'Formatting' })
      const found = [...(await scan(page, 'editor'))]

      for (const name of ['Text style', 'Font', 'Font size', 'Text colour', 'Highlight', 'Insert']) {
        await bar.getByRole('button', { name, exact: true }).click()
        found.push(...(await scan(page, `menu ${name}`)))
        await page.keyboard.press('Escape')
      }
      expect(found).toEqual([])
    })

    test('the dialogs: settings, how to use, shortcuts, confirm', async ({ device, server }, testInfo) => {
      await seed(server)
      const { page } = await device()
      const phone = testInfo.project.name === 'android'
      const found: string[] = []

      const openMenuItem = async (name: RegExp) => {
        if (phone) {
          await page.getByRole('button', { name: 'Menu' }).click()
          await page.getByRole('menuitem', { name }).click()
        } else {
          await page.getByRole('navigation', { name: 'Library' }).getByRole('button', { name }).click()
        }
        await expect(page.getByRole('dialog')).toBeVisible()
      }
      for (const [label, name] of [['settings', /Settings/], ['how to use', /How to use/], ['shortcuts', /Keyboard shortcuts/]] as const) {
        await openMenuItem(name)
        found.push(...(await scan(page, label)))
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
      }

      if (phone) await page.getByRole('button', { name: 'Select', exact: true }).click()
      await page.getByRole('checkbox', { name: 'Select Groceries' }).check()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      found.push(...(await scan(page, 'confirm dialog')))
      expect(found).toEqual([])
    })
  })
}
