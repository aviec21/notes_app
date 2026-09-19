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

  it('shows a sidebar with search, folders, tags and the recycle bin', async () => {
    render(app())
    const sidebar = await screen.findByRole('navigation', { name: 'Library' })
    expect(within(sidebar).getByRole('searchbox', { name: 'Search notes' })).toBeTruthy()
    expect(within(sidebar).getByRole('button', { name: /Work/ })).toBeTruthy()
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
    await user.click(within(sidebar).getByRole('button', { name: /Work/ }))
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
    await user.click(await screen.findByRole('button', { name: /Groceries/ }))
    const panel = await screen.findByRole('region', { name: 'Open note' })
    expect(await within(panel).findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    // The list is still there, with the open note marked.
    expect(screen.getByRole('button', { name: /Groceries/, current: true })).toBeTruthy()

    await user.click(within(panel).getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
  })

  it('opens notes full width when editor mode is off, and remembers the choice', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: 'Editor mode' }))
    expect(localStorage.getItem('notes.editorMode')).toBe('off')
    await user.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(await screen.findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Groceries/ })).toBeNull() // list replaced
  })

  it('keeps a tag added inside a note, and filters by it when the tag is clicked', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /Groceries/ }))
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
    await user.click(await screen.findByRole('button', { name: /Groceries/ }))
    expect(await screen.findByRole('textbox', { name: 'Note title' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull()
  })

  it('shows folders in the main list so they can be opened', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /Work/ }))
    expect(await screen.findByText('Quarterly plan')).toBeTruthy()
  })
})
