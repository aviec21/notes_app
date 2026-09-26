import type { Locator, Page } from '@playwright/test'
import { card, expect, test, waitSynced, writeNote } from './fixtures'

const isPhone = (page: Page) => page.evaluate(() => matchMedia('(max-width: 767px)').matches)
const marks = (page: Page) => page.locator('.note-content .search-hit')
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search notes' })

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('element has no box')
  return b
}

type EditorHandle = HTMLElement & { editor: import('@tiptap/react').Editor }

test.describe('search words stay marked in the opened note', () => {
  test('the note opens with the word marked and a find bar ready to step through them', async ({ device, server }) => {
    await server.addNote('Recipes', 'apple pie, then apple tart. Nothing else here.')
    await server.addNote('Other', 'no fruit in this one')
    const { page } = await device()
    await search(page).fill('apple')
    await card(page, 'Recipes').click()

    await expect(marks(page)).toHaveCount(2)
    await expect(marks(page).first()).toHaveText('apple')
    await expect(page.getByRole('searchbox', { name: 'Find in this note' })).toHaveValue('apple')
    await expect(page.getByText('1 of 2')).toBeVisible()
    // On a phone the keyboard must not pop up just because a note was opened from a search.
    expect(await page.evaluate(() => document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type === 'search' && (document.activeElement as HTMLInputElement).ariaLabel === 'Find in this note')).toBe(false)

    await page.getByRole('button', { name: 'Next match' }).click()
    await expect(page.getByText('2 of 2')).toBeVisible()
    await expect(page.locator('.search-hit-current')).toHaveCount(1)
    await expect(page.locator('.search-hit-current')).toBeInViewport()
  })

  test('the marks are gone when the bar is closed, and are never saved into the note', async ({ device, server }) => {
    await server.addNote('Recipes', 'apple pie, then apple tart.')
    const { page } = await device()
    await search(page).fill('apple')
    await card(page, 'Recipes').click()
    await expect(marks(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Close find' }).click()
    await expect(marks(page)).toHaveCount(0)
    expect(await page.evaluate(() => (document.querySelector('.note-content') as EditorHandle).editor.getHTML())).not.toContain('search-hit')
  })

  test('Find in note works without a list search, from the button', async ({ device, server }) => {
    await server.addNote('Recipes', 'apple pie, then apple tart.')
    const { page } = await device()
    await card(page, 'Recipes').click()
    await expect(marks(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Find in note' }).click()
    const find = page.getByRole('searchbox', { name: 'Find in this note' })
    await expect(find).toBeFocused()
    await find.fill('tart')
    await expect(marks(page)).toHaveCount(1)
    await expect(page.getByText('1 of 1')).toBeVisible()
  })
})

test.describe('the sync dot', () => {
  test('is green when synced, yellow while changes wait, and red for a sync problem', async ({ device, server }) => {
    const a = await device()
    const dot = (tone: string) => a.page.locator(`[data-sync-dot="${tone}"]`).first()
    await writeNote(a.page, 'Dots', 'hello')
    await waitSynced(a.page)
    await expect(dot('synced')).toBeVisible()

    // A change made with no connection waits (yellow).
    await a.context.setOffline(true)
    await a.page.keyboard.type(' more')
    await expect(dot('working')).toBeVisible({ timeout: 10_000 })
    await a.context.setOffline(false)

    // The server failing shows red, then it recovers.
    server.failNext = 50
    await a.page.keyboard.type(' again')
    await a.page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(dot('problem')).toBeVisible({ timeout: 15_000 })
    server.failNext = 0 // the server is back
    await waitSynced(a.page)
    await expect(dot('synced')).toBeVisible()
  })
})

test.describe('card size', () => {
  test('big rows are taller than small ones, and the choice survives a reload', async ({ device, server }) => {
    await server.addNote('One', 'first note text')
    await server.addNote('Two', 'second note text')
    const { page } = await device()
    const height = async () => Math.round((await box(page.locator('[data-card]').first())).height)
    const choose = async (name: string) => {
      await page.getByRole('button', { name: 'Card size' }).click()
      await page.getByRole('menuitemradio', { name }).click()
    }
    const average = await height()
    await choose('Small')
    const small = await height()
    await choose('Big')
    const big = await height()
    expect(small).toBeLessThan(average)
    expect(big).toBeGreaterThan(average)

    await page.reload()
    await expect(page.locator('[data-card]').first()).toHaveAttribute('data-size', 'big')
    expect(await height()).toBe(big)
  })
})

test.describe('the ⋯ menu on a card', () => {
  test('opens beside the card, stays on screen, and renames the note', async ({ device, server }) => {
    await server.addNote('Groceries', 'milk')
    const { page } = await device()
    await page.getByRole('button', { name: 'Options for Groceries' }).click()
    const menu = page.getByRole('menu', { name: 'Item options' })
    await expect(menu).toBeVisible()
    const m = await box(menu)
    const viewport = page.viewportSize()!
    expect(m.x).toBeGreaterThanOrEqual(0)
    expect(m.x + m.width).toBeLessThanOrEqual(viewport.width)
    expect(m.y + m.height).toBeLessThanOrEqual(viewport.height)

    await menu.getByRole('menuitem', { name: 'Rename' }).click()
    const prompt = page.getByRole('dialog')
    await prompt.getByRole('textbox').fill('Shopping')
    await prompt.getByRole('button', { name: 'Rename' }).click()
    await expect(card(page, 'Shopping')).toBeVisible()
  })
})

test.describe('on a computer', () => {
  test.beforeEach(async ({ device }) => {
    // (A device is created per test below; this only documents that these tests need a wide screen.)
    void device
  })

  test('the list is at most half the width, and grid view still uses all of it', async ({ device, server }) => {
    await server.addNote('One', 'text')
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    const library = page.locator('[data-library]')
    const main = page.getByRole('main')
    await expect(card(page, 'One')).toBeVisible()
    expect((await box(library)).width).toBeLessThan((await box(main)).width * 0.6)

    await page.getByRole('button', { name: 'Grid view' }).click()
    expect((await box(library)).width).toBeGreaterThan((await box(main)).width * 0.9)
  })

  test('the sidebar collapses to a strip of icons and back', async ({ device }) => {
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    const aside = page.locator('aside')
    const wide = (await box(aside)).width
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    expect((await box(aside)).width).toBeLessThan(80)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible() // remembered
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    expect((await box(aside)).width).toBeCloseTo(wide, 0)
  })

  test('Folders and Tags fold away, and stay folded after a reload', async ({ device, server }) => {
    await server.addFolder('Work')
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    const nav = page.getByRole('navigation', { name: 'Library' })
    await expect(nav.getByRole('button', { name: /^Work/ })).toBeVisible()
    await nav.getByRole('button', { name: /^Folders/ }).click()
    await expect(nav.getByRole('button', { name: /^Work/ })).toBeHidden()
    await page.reload()
    await expect(nav.getByRole('button', { name: /^Folders/ })).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('button', { name: /^Work/ })).toBeHidden()
  })

  test('the divider between the list and the open note can be dragged, and is remembered', async ({ device, server }) => {
    await server.addNote('Groceries', 'milk')
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    await card(page, 'Groceries').click()
    const handle = page.getByRole('separator', { name: 'Resize note list' })
    await expect(handle).toBeVisible()
    const main = page.getByRole('main')
    const before = (await box(main)).width

    const h = await box(handle)
    await page.mouse.move(h.x + h.width / 2, h.y + 200)
    await page.mouse.down()
    await page.mouse.move(h.x + h.width / 2 + 120, h.y + 200, { steps: 6 })
    await page.mouse.up()
    expect((await box(main)).width).toBeGreaterThan(before + 90)

    const dragged = Math.round((await box(main)).width)
    await page.reload()
    await card(page, 'Groceries').click()
    await expect(page.getByRole('separator', { name: 'Resize note list' })).toBeVisible()
    expect(Math.round((await box(page.getByRole('main'))).width)).toBe(dragged)
  })

  test('clicking the empty part of the list closes the open note, saving it first', async ({ device, server }) => {
    await server.addNote('Groceries', 'milk')
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    await card(page, 'Groceries').click()
    const text = page.getByRole('textbox', { name: 'Note text' })
    await text.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' and eggs')

    const main = await box(page.getByRole('main'))
    await page.mouse.click(main.x + main.width / 2, main.y + main.height - 60) // blank space below the cards
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveCount(0)
    await expect(card(page, 'Groceries')).toContainText('milk and eggs')
  })

  test('clicking a card while a note is open opens that one instead', async ({ device, server }) => {
    await server.addNote('Groceries', 'milk')
    await server.addNote('Ideas', 'something')
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    await card(page, 'Groceries').click()
    await card(page, 'Ideas').click()
    await expect(page.getByRole('textbox', { name: 'Note title' })).toHaveValue('Ideas')
  })

  test('dragging a selection down to the bottom edge scrolls the note so more text is selected', async ({ device }) => {
    const { page } = await device()
    test.skip(await isPhone(page), 'computer only')
    await writeNote(page, 'Long', 'x')
    await page.evaluate(() => {
      const editor = (document.querySelector('.note-content') as EditorHandle).editor
      editor.commands.setContent({
        type: 'doc',
        content: Array.from({ length: 150 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph number ${i + 1}` }] })),
      })
    })
    const first = page.getByText('Paragraph number 3', { exact: true })
    await first.scrollIntoViewIfNeeded()
    const start = await box(first)
    const scrollTop = () =>
      page.evaluate(() => {
        for (let n = document.querySelector('.note-content')?.parentElement; n; n = n.parentElement) {
          const { overflowY } = getComputedStyle(n)
          if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n.scrollTop
        }
        return document.scrollingElement?.scrollTop ?? 0
      })
    const startScroll = await scrollTop()
    const viewport = page.viewportSize()!

    await page.mouse.move(start.x + 5, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, viewport.height / 2, { steps: 4 })
    await page.mouse.move(start.x + 60, viewport.height - 16, { steps: 4 }) // near the bottom edge, still inside the window
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(start.x + 60 + (i % 2), viewport.height - 16)
      await page.waitForTimeout(100)
    }
    await page.mouse.up()

    expect(await scrollTop()).toBeGreaterThan(startScroll + 200)
    const selected = await page.evaluate(() => (document.querySelector('.note-content') as EditorHandle).editor.state.doc.textBetween(
      (document.querySelector('.note-content') as EditorHandle).editor.state.selection.from,
      (document.querySelector('.note-content') as EditorHandle).editor.state.selection.to,
      '\n',
    ))
    expect(selected.split('\n').length).toBeGreaterThan(12) // many more lines than fit on screen at the start
  })
})

test.describe('on a phone', () => {
  test('the caret stays clear of the toolbar while typing lines at the bottom of a short screen', async ({ device }) => {
    const { page } = await device()
    test.skip(!(await isPhone(page)), 'phone only')
    await writeNote(page, 'Typing', 'first')
    // Shrink the screen the way an on-screen keyboard does (the page resizes to what is left).
    await page.setViewportSize({ width: 412, height: 380 })
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Enter')
      await page.keyboard.type(`line ${i}`)
    }
    await page.waitForTimeout(300)
    const geometry = await page.evaluate(() => {
      const range = window.getSelection()!.getRangeAt(0).cloneRange()
      const caret = [...range.getClientRects()].at(-1) ?? (range.startContainer.parentElement as HTMLElement).getBoundingClientRect()
      const bar = document.querySelector('[data-editor-bottom-bar]')!.getBoundingClientRect()
      const header = document.querySelector('[data-editor-header]')!.getBoundingClientRect()
      return { caretTop: caret.top, caretBottom: caret.bottom, barTop: bar.top, headerBottom: header.bottom }
    })
    expect(geometry.caretBottom).toBeLessThanOrEqual(geometry.barTop + 1)
    expect(geometry.caretTop).toBeGreaterThanOrEqual(geometry.headerBottom - 1)
  })
})

test.describe('opening the app', () => {
  test('a device that is already signed in shows its notes without waiting for the server', async ({ device, server }) => {
    await server.addNote('Groceries', 'milk')
    const { page, context } = await device()
    await expect(card(page, 'Groceries')).toBeVisible()
    // From now on the server's answer about the session takes 4 seconds.
    await context.route('**/api/auth/me', async (route) => {
      await new Promise((r) => setTimeout(r, 4000))
      await route.continue()
    })
    const started = Date.now()
    await page.reload()
    await expect(card(page, 'Groceries')).toBeVisible({ timeout: 3000 })
    expect(Date.now() - started).toBeLessThan(3500)
  })
})
