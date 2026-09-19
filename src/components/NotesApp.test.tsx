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

  it('shows folders in the main list so they can be opened', async () => {
    const user = userEvent.setup()
    render(app())
    await user.click(await screen.findByRole('button', { name: /Work/ }))
    expect(await screen.findByText('Quarterly plan')).toBeTruthy()
  })
})
