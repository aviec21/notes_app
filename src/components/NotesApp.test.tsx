// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repo } from '../sync/runtime'
import NotesApp from './NotesApp'
import { DialogProvider } from './ui/Dialogs'

// Network sync is not under test here; keep it from calling out.
vi.mock('../sync/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sync/runtime')>()),
  startSync: () => () => {},
}))

function setScreen(desktop: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
  Range.prototype.getBoundingClientRect = () => rect as DOMRect
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  document.elementFromPoint = () => null
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

beforeEach(async () => {
  localStorage.clear()
  await Promise.all([db.notes.clear(), db.folders.clear(), db.tags.clear(), db.outbox.clear()])
  const work = await repo.createFolder('Work')
  const plan = await repo.createNote(work)
  await repo.setNoteText(plan, 'Quarterly plan', 'roadmap for Q3')
  const shopping = await repo.createNote()
  await repo.setNoteText(shopping, 'Groceries', 'milk and eggs')
  const tag = await repo.createTag('urgent')
  await repo.setNoteTags(shopping, [tag])
})
afterEach(() => cleanup())

const app = (defaultPin = false) => (
  <DialogProvider>
    <NotesApp defaultPin={defaultPin} onSignOut={() => {}} onPinChanged={() => {}} onUnauthorized={() => {}} />
  </DialogProvider>
)

describe('desktop layout', () => {
  beforeEach(() => setScreen(true))

  it('starts in list view', async () => {
    render(app())
    await screen.findByRole('button', { name: /^Groceries/ })
    expect(document.querySelector('[data-card="list"]')).not.toBeNull()
    expect(document.querySelector('[data-card="grid"]')).toBeNull()
  })

  it('shows a sidebar with search, folders, tags and the recycle bin', async () => {
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    expect(within(sidebar).getByRole('searchbox', { name: 'Search notes' })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /^Work/ })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /^urgent/ })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /Recycle bin/ })).toBeTruthy()
  })

  it('by default lists only notes that are not in any folder', async () => {
    render(app())
    expect(await screen.findByText('Groceries')).toBeTruthy()
    expect(screen.queryByText('Quarterly plan')).toBeNull()
  })

  it("shows a folder's notes when it is picked in the sidebar", async () => {
    const user = userEvent.setup()
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    await user.click(within(sidebar).getByRole('button', { name: /^Work/ }))
    expect(await screen.findByText('Quarterly plan')).toBeTruthy()
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  it('filters by tag from the sidebar', async () => {
    const user = userEvent.setup()
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    await user.click(within(sidebar).getByRole('button', { name: /^urgent/ }))
    expect(await screen.findByText('Groceries')).toBeTruthy()
    expect(screen.queryByText('Quarterly plan')).toBeNull()
  })

  it('searches every folder with partial, case-insensitive matching', async () => {
    const user = userEvent.setup()
    render(app())
    const box = await screen.findByRole('searchbox', { name: 'Search notes' })
    await user.type(box, 'ROADM')
    expect(await screen.findByText('Quarterly plan')).toBeTruthy() // found inside the Work folder
    expect(screen.queryByText('Groceries')).toBeNull()
    expect(screen.getByText(/Results for/)).toBeTruthy()
  })

  it('focuses search with the / key', async () => {
    const user = userEvent.setup()
    render(app())
    const box = await screen.findByRole('searchbox', { name: 'Search notes' })
    await user.keyboard('/')
    expect(document.activeElement).toBe(box)
  })

  it('opens the shortcuts help with ?', async () => {
    const user = userEvent.setup()
    render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    await user.keyboard('?')
    await waitFor(() => expect(document.querySelector('dialog[open]')?.textContent).toContain('Keyboard shortcuts'))
  })

  it('lets the sidebar be resized with the keyboard and remembers the width', async () => {
    const user = userEvent.setup()
    render(app())
    const handle = await screen.findByRole('separator', { name: 'Resize sidebar' })
    const before = Number(handle.getAttribute('aria-valuenow'))
    handle.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 32)
    expect(localStorage.getItem('notes.sidebarWidth')).toBe(String(before + 32))
  })

  it('keeps the width inside its limits', async () => {
    const user = userEvent.setup()
    render(app())
    const handle = await screen.findByRole('separator', { name: 'Resize sidebar' })
    handle.focus()
    for (let i = 0; i < 40; i++) await user.keyboard('{ArrowLeft}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(200)
  })

  it('offers Settings, Keyboard shortcuts and How to use in the sidebar', async () => {
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    expect(within(sidebar).getByRole('button', { name: /Settings/ })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /Keyboard shortcuts/ })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /How to use/ })).toBeTruthy()
  })

  it('searches the How to use guide', async () => {
    const user = userEvent.setup()
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    await user.click(within(sidebar).getByRole('button', { name: /How to use/ }))
    const dialog = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('dialog[open]')
      if (!el) throw new Error('no dialog')
      return el
    })
    await user.type(within(dialog).getByRole('searchbox', { hidden: true }), 'RESTOR')
    expect(within(dialog).getByText('Restore from the recycle bin')).toBeTruthy()
    expect(within(dialog).queryByText('Light and dark theme')).toBeNull()
  })

  it('filters the keyboard shortcuts by search', async () => {
    const user = userEvent.setup()
    render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    await user.keyboard('?')
    const dialog = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('dialog[open]')
      if (!el) throw new Error('no dialog')
      return el
    })
    await user.type(within(dialog).getByRole('searchbox', { hidden: true }), 'rename')
    expect(within(dialog).getByText('F2')).toBeTruthy()
    expect(within(dialog).queryByText('Bold')).toBeNull()
  })

  it('in editor mode, opens a note in a side panel next to the list', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    const panel = await screen.findByRole('region', { name: 'Open note' })
    expect(await within(panel).findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    // The list is still there, with the open note marked.
    expect(screen.getByRole('button', { name: /^Groceries/, current: true })).toBeTruthy()

    await user.click(within(panel).getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
  })

  it('opens notes full width when editor mode is off, and remembers the choice', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: 'Editor mode' }))
    expect(localStorage.getItem('notes.editorMode')).toBe('off')
    await user.click(screen.getByRole('button', { name: /^Groceries/ }))
    expect(await screen.findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Groceries/ })).toBeNull() // list replaced
  })

  it('keeps a tag added inside a note, and filters by it when the tag is clicked', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    const panel = await screen.findByRole('region', { name: 'Open note' })

    await user.type(await within(panel).findByRole('combobox', { name: 'Add tag' }), 'finance{Enter}')
    expect(await within(panel).findByText('#finance')).toBeTruthy()

    // It survives closing the note.
    await user.click(within(panel).getByRole('button', { name: /Close/ }))
    const sidebar = screen.getByRole('navigation', { name: 'Library' })
    const tag = await within(sidebar).findByRole('button', { name: /^finance/ })

    await user.click(tag)
    const list = screen.getByRole('main')
    expect(await within(list).findByText('Groceries')).toBeTruthy()
    expect(within(list).queryByText('Quarterly plan')).toBeNull() // only tagged notes

    const note = (await db.notes.toArray()).find((n) => n.title === 'Groceries')
    expect(note?.tagIds).toHaveLength(2) // the seeded "urgent" plus the new one

  })

  it('warns about the default PIN with a way to change it', async () => {
    render(app(true))
    expect(await screen.findByText(/still using the default PIN/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeTruthy()
  })
})

describe('phone layout', () => {
  beforeEach(() => setScreen(false))

  it('has no sidebar or resize handle, but has search and quick switches', async () => {
    render(app())
    expect(await screen.findByRole('searchbox', { name: 'Search notes' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Library' })).toBeNull()
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByRole('button', { name: 'Recycle bin' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '#urgent' })).toBeTruthy()
  })

  it('starts in list view, even if grid was chosen before', async () => {
    localStorage.setItem('notes.viewMode', 'grid') // an old choice from before list became the default
    render(app())
    await screen.findByRole('button', { name: /^Groceries/ })
    const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')]
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.dataset.card === 'list')).toBe(true)
  })

  it('still remembers a grid choice made afterwards', async () => {
    const user = userEvent.setup()
    const first = render(app())
    await user.click(await screen.findByRole('button', { name: 'Grid view' }))
    expect(document.querySelector('[data-card="grid"]')).not.toBeNull()
    first.unmount()

    render(app())
    await screen.findByRole('button', { name: /^Groceries/ })
    expect(document.querySelector('[data-card="grid"]')).not.toBeNull()
  })

  it('has a menu with Settings, How to use and Keyboard shortcuts', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('menu', { name: 'Menu' })
    expect(within(menu).getByRole('menuitem', { name: /Settings/ })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeTruthy()
    await user.click(within(menu).getByRole('menuitem', { name: /How to use/ }))
    await waitFor(() => expect(document.querySelector('dialog[open]')?.textContent).toContain('How to use'))
  })

  it('never uses editor mode: notes open full screen', async () => {
    localStorage.setItem('notes.editorMode', 'on')
    const user = userEvent.setup()
    render(app())
    expect(screen.queryByRole('button', { name: 'Editor mode' })).toBeNull()
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    expect(await screen.findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
  })

  it('shows folders in the main list so they can be opened', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Work/ }))
    expect(await screen.findByText('Quarterly plan')).toBeTruthy()
  })
})

describe('collapsible sidebar and lists', () => {
  beforeEach(() => setScreen(true))

  const nav = () => screen.getByRole('navigation', { name: 'Library' })
  const aside = () => document.querySelector('aside') as HTMLElement

  it('collapses to a strip of icons and expands again, remembering the choice', async () => {
    const user = userEvent.setup()
    const first = render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    const wide = aside().style.width
    await user.click(within(nav()).getByRole('button', { name: 'Collapse sidebar' }))

    expect(localStorage.getItem('notes.sidebar')).toBe('collapsed')
    expect(aside().style.width).toBe('56px')
    expect(screen.queryByRole('searchbox', { name: 'Search notes' })).toBeNull()
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).toBeNull()
    for (const name of ['Expand sidebar', 'Search notes', 'Notes', 'Folders', 'Tags', 'Recycle bin', 'Settings']) {
      expect(within(nav()).getByRole('button', { name })).toBeTruthy()
    }

    // Still collapsed after a reload.
    first.unmount()
    render(app())
    await screen.findByRole('button', { name: 'Expand sidebar' })

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(aside().style.width).toBe(wide)
    expect(screen.getByRole('searchbox', { name: 'Search notes' })).toBeTruthy()
  })

  it('still navigates from the collapsed strip', async () => {
    const user = userEvent.setup()
    localStorage.setItem('notes.sidebar', 'collapsed')
    render(app())
    await user.click(await screen.findByRole('button', { name: 'Recycle bin' }))
    expect(await screen.findByText('Recycle bin', { selector: 'h1' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    expect(await screen.findByText('Groceries')).toBeTruthy()
  })

  it('the search icon on the strip opens the sidebar with the cursor in the search box', async () => {
    const user = userEvent.setup()
    localStorage.setItem('notes.sidebar', 'collapsed')
    render(app())
    await user.click(await screen.findByRole('button', { name: 'Search notes' }))
    const box = await screen.findByRole('searchbox', { name: 'Search notes' })
    await waitFor(() => expect(document.activeElement).toBe(box))
  })

  it('the / key opens a collapsed sidebar and focuses search', async () => {
    const user = userEvent.setup()
    localStorage.setItem('notes.sidebar', 'collapsed')
    render(app())
    await screen.findByRole('button', { name: 'Expand sidebar' })
    await user.keyboard('/')
    const box = await screen.findByRole('searchbox', { name: 'Search notes' })
    await waitFor(() => expect(document.activeElement).toBe(box))
  })

  it('the [ key collapses and expands it', async () => {
    const user = userEvent.setup()
    render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    await user.keyboard('[[') // user-event writes a literal [ as [[
    expect(await screen.findByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
    await user.keyboard('[[') // user-event writes a literal [ as [[
    expect(await screen.findByRole('button', { name: 'Collapse sidebar' })).toBeTruthy()
  })

  it('folds the Folders list away with its arrow, and shows how many are hidden', async () => {
    const user = userEvent.setup()
    const first = render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    const heading = within(nav()).getByRole('button', { name: /^Folders/ })
    expect(heading.getAttribute('aria-expanded')).toBe('true')
    expect(within(nav()).getByRole('button', { name: /^Work/ })).toBeTruthy()

    await user.click(heading)
    expect(heading.getAttribute('aria-expanded')).toBe('false')
    expect(within(nav()).queryByRole('button', { name: /^Work/ })).toBeNull()
    expect(heading.textContent).toContain('(1)')
    expect(localStorage.getItem('notes.sidebar.folders')).toBe('closed')

    // The Tags list is separate, and the choice is remembered.
    expect(within(nav()).getByRole('button', { name: /^urgent/ })).toBeTruthy()
    first.unmount()
    render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    expect(within(nav()).queryByRole('button', { name: /^Work/ })).toBeNull()

    await user.click(within(nav()).getByRole('button', { name: /^Folders/ }))
    expect(await within(nav()).findByRole('button', { name: /^Work/ })).toBeTruthy()
  })

  it('folds the Tags list away with its arrow', async () => {
    const user = userEvent.setup()
    render(app())
    await screen.findByRole('navigation', { name: 'Library' })
    await user.click(within(nav()).getByRole('button', { name: /^Tags/ }))
    expect(within(nav()).queryByRole('button', { name: /^urgent/ })).toBeNull()
    expect(within(nav()).getByRole('button', { name: /^Tags/ }).getAttribute('aria-expanded')).toBe('false')
    // Folders were not affected.
    expect(within(nav()).getByRole('button', { name: /^Work/ })).toBeTruthy()
  })

  it('shows a tag’s colour on its icon in the sidebar', async () => {
    const tag = (await db.tags.toArray())[0]
    await repo.setTagColor(tag.id, 'violet')
    render(app())
    const item = await within(await screen.findByRole('navigation', { name: 'Library' })).findByRole('button', { name: /^urgent/ })
    expect((item.querySelector('svg') as SVGElement).style.color).toBe('var(--folder-violet)')
  })
})

describe('list width and the divider beside an open note', () => {
  beforeEach(() => setScreen(true))

  it('keeps the list to half the width in list view', async () => {
    render(app())
    await screen.findByRole('button', { name: /^Groceries/ })
    expect(document.querySelector('[data-library]')?.className).toContain('max-w-[max(50%,32rem)]')
  })

  it('lets grid view use the whole width', async () => {
    localStorage.setItem('notes.viewMode.v2', 'grid')
    render(app())
    await screen.findByRole('button', { name: /^Groceries/ })
    expect(document.querySelector('[data-library]')?.className).not.toContain('max-w-')
  })

  it('has a draggable divider between the list and the note in editor mode, remembered', async () => {
    const user = userEvent.setup()
    const first = render(app())
    expect(screen.queryByRole('separator', { name: 'Resize note list' })).toBeNull() // no note open yet
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    const handle = await screen.findByRole('separator', { name: 'Resize note list' })
    const before = Number(handle.getAttribute('aria-valuenow'))
    handle.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 48)
    expect(localStorage.getItem('notes.listWidth')).toBe(String(before + 48))
    expect(screen.getByRole('main').style.width).toBe(`${before + 48}px`)

    // The list is no longer capped to half the width once the note is open beside it.
    expect(document.querySelector('[data-library]')?.className).not.toContain('max-w-')

    // Remembered for the next note.
    first.unmount()
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    expect((await screen.findByRole('separator', { name: 'Resize note list' })).getAttribute('aria-valuenow')).toBe(String(before + 48))
  })

  it('keeps the list between its smallest and largest width, and Home resets it', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    const handle = await screen.findByRole('separator', { name: 'Resize note list' })
    handle.focus()
    for (let i = 0; i < 40; i++) await user.keyboard('{ArrowLeft}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(280)
    for (let i = 0; i < 60; i++) await user.keyboard('{ArrowRight}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(900)
    await user.keyboard('{Home}')
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(420)
  })

  describe('clicking the empty part of the list while a note is open beside it', () => {
    async function openGroceries(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
      return screen.findByRole('region', { name: 'Open note' })
    }

    it('closes the note', async () => {
      const user = userEvent.setup()
      render(app())
      await openGroceries(user)
      await user.click(screen.getByRole('main')) // the blank space around and below the cards
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull())
    })

    it('saves what was typed first', async () => {
      const user = userEvent.setup()
      render(app())
      const panel = await openGroceries(user)
      const el = (await within(panel).findByRole('textbox', { name: 'Note text' })) as HTMLElement & {
        editor?: { commands: { insertContent: (text: string) => boolean } }
      }
      await waitFor(() => expect(el.editor).toBeDefined())
      el.editor!.commands.insertContent(' and butter')
      await user.click(screen.getByRole('main'))
      await waitFor(async () => {
        const note = (await db.notes.toArray()).find((n) => n.title === 'Groceries')
        expect(note?.contentText).toContain('butter')
      })
    })

    it('does not close it when a card is clicked (that opens the other note instead)', async () => {
      const user = userEvent.setup()
      render(app())
      await openGroceries(user)
      await user.click(screen.getByRole('button', { name: /^Groceries/ }))
      expect(screen.getByRole('region', { name: 'Open note' })).toBeTruthy()
    })

    it('does not close it for a click on the toolbar or a button in the list', async () => {
      const user = userEvent.setup()
      render(app())
      await openGroceries(user)
      await user.click(screen.getByRole('button', { name: 'Card size' }))
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Grid view' }))
      expect(screen.getByRole('region', { name: 'Open note' })).toBeTruthy()
    })

    it('does not close it for a click inside the note', async () => {
      const user = userEvent.setup()
      render(app())
      const panel = await openGroceries(user)
      await user.click(within(panel).getByRole('textbox', { name: 'Note title' }))
      expect(screen.getByRole('region', { name: 'Open note' })).toBeTruthy()
    })

    it('does nothing when no note is open', async () => {
      const user = userEvent.setup()
      render(app())
      await screen.findByRole('button', { name: /^Groceries/ })
      await user.click(screen.getByRole('main'))
      expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
      expect(screen.getByRole('button', { name: /^Groceries/ })).toBeTruthy()
    })
  })

  it('offers a note width in Settings for full-screen notes', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /Settings/ }))
    const dialog = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('dialog[open]')
      if (!el) throw new Error('no dialog')
      return el
    })
    const group = within(dialog).getByRole('group', { name: 'Note width', hidden: true })
    expect(within(group).getByRole('button', { name: 'Medium', hidden: true }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(group).getByRole('button', { name: 'Wide', hidden: true }))
    expect(localStorage.getItem('notes.noteWidth')).toBe('wide')
  })

  it('a full-screen note uses the chosen width', async () => {
    const user = userEvent.setup()
    localStorage.setItem('notes.noteWidth', 'narrow')
    localStorage.setItem('notes.editorMode', 'off')
    render(app())
    await user.click(await screen.findByRole('button', { name: /^Groceries/ }))
    await screen.findByRole('textbox', { name: 'Note title' })
    expect(screen.getByRole('main').firstElementChild?.className).toContain('max-w-xl')
  })
})
