import type { Page } from '@playwright/test'
import { expect, test, writeNote } from './fixtures'

const body = (page: Page) => page.getByRole('textbox', { name: 'Note text' })

/** Fills the open note with some text, then a long checklist. */
async function fillWithChecklist(page: Page, items = 60) {
  await page.evaluate((count) => {
    const editor = (document.querySelector('.note-content') as HTMLElement & { editor: import('@tiptap/react').Editor }).editor
    const paragraphs = Array.from({ length: 12 }, (_, i) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Intro line ${i + 1}` }],
    }))
    const list = {
      type: 'taskList',
      content: Array.from({ length: count }, (_, i) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Task ${i + 1}` }] }],
      })),
    }
    editor.commands.setContent({ type: 'doc', content: [...paragraphs, list] })
  }, items)
}

/** How far the note has been scrolled (its side panel, or the page itself on a phone). */
const scrolled = (page: Page) =>
  page.evaluate(() => {
    for (let node = document.querySelector('.note-content')?.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node)
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node.scrollTop
    }
    return document.scrollingElement?.scrollTop ?? 0
  })

const selectionStart = (page: Page) =>
  page.evaluate(() => (document.querySelector('.note-content') as HTMLElement & { editor: import('@tiptap/react').Editor }).editor.state.selection.from)

test.describe('ticking checklist boxes', () => {
  test('does not throw the view (or the cursor) to the end of the list', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Tasks', 'x')
    await fillWithChecklist(page)
    await expect(body(page).getByRole('checkbox')).toHaveCount(60)

    // Put a box in the middle of the list on screen, then tick it.
    const box = body(page).getByRole('checkbox').nth(25)
    await box.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    const before = { scroll: await scrolled(page), top: (await box.boundingBox())!.y }
    expect(before.scroll).toBeGreaterThan(200) // it really is scrolled down, in the middle of the list

    await box.check()
    await page.waitForTimeout(1500) // autosave and the sync that follows

    await expect(body(page).locator('li[data-checked="true"]')).toHaveCount(1)
    const after = { scroll: await scrolled(page), top: (await box.boundingBox())!.y }
    expect(Math.abs(after.scroll - before.scroll)).toBeLessThan(10)
    expect(Math.abs(after.top - before.top)).toBeLessThan(10)
  })

  test('even when the cursor was last left at the end of the list and the editor is not focused', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Tasks', 'x')
    await fillWithChecklist(page)
    // Where you would have typed the last item: cursor at the very end. Then tap away from the text.
    await page.evaluate(() => {
      const editor = (document.querySelector('.note-content') as HTMLElement & { editor: import('@tiptap/react').Editor }).editor
      editor.commands.focus('end')
    })
    await page.waitForTimeout(300) // focus() finishes on the next frame; only then tap away
    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
    const endOfDoc = await selectionStart(page)

    const box = body(page).getByRole('checkbox').nth(12)
    await page.evaluate(() => document.scrollingElement?.scrollTo(0, 0))
    await box.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    const before = { scroll: await scrolled(page), top: (await box.boundingBox())!.y }

    await box.check()
    await page.waitForTimeout(1500)

    await expect(body(page).locator('li[data-checked="true"]')).toHaveCount(1)
    const after = { scroll: await scrolled(page), top: (await box.boundingBox())!.y }
    // The list stayed where it was, and ticking a box did not take the cursor anywhere new.
    expect(Math.abs(after.scroll - before.scroll)).toBeLessThan(10)
    expect(Math.abs(after.top - before.top)).toBeLessThan(10)
    expect(await selectionStart(page)).toBe(endOfDoc)
    // ...nor did it start editing (which would raise the keyboard on a phone).
    expect(await page.evaluate(() => document.activeElement?.closest('.note-content') !== null)).toBe(false)
  })

  test('ticking several boxes in a row keeps the view where it is', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Tasks', 'x')
    await fillWithChecklist(page)
    const boxes = body(page).getByRole('checkbox')
    await boxes.nth(20).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const start = await scrolled(page)

    for (const n of [20, 21, 22, 23]) {
      await boxes.nth(n).check()
      await page.waitForTimeout(700)
    }
    await expect(body(page).locator('li[data-checked="true"]')).toHaveCount(4)
    expect(Math.abs((await scrolled(page)) - start)).toBeLessThan(10)
  })

  test('does not move the cursor either', async ({ device }) => {
    const { page } = await device()
    await writeNote(page, 'Tasks', 'x')
    await fillWithChecklist(page)
    // Put the cursor at the very start, then tick a box far down the list.
    await page.evaluate(() =>
      (document.querySelector('.note-content') as HTMLElement & { editor: import('@tiptap/react').Editor }).editor.commands.focus('start'),
    )
    const cursor = await selectionStart(page)
    await body(page).getByRole('checkbox').nth(40).check()
    await page.waitForTimeout(1200)
    expect(await selectionStart(page)).toBe(cursor)
  })
})
