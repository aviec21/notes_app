// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData, View } from '../lib/library'
import { db, repo } from '../sync/runtime'
import Library from './Library'
import { DialogProvider } from './ui/Dialogs'

// jsdom does not implement <dialog>'s modal methods; this stands in for a real browser.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

// The dialog that is currently showing (closed ones stay in the page, empty).
async function openDialog(): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>('dialog[open]')
    if (!el) throw new Error('no dialog is open')
    return el
  })
}

async function load(): Promise<LibraryData> {
  return { notes: await db.notes.toArray(), folders: await db.folders.toArray(), tags: await db.tags.toArray() }
}

async function seed() {
  const folder = await repo.createFolder('Work')
  const inFolder = await repo.createNote(folder)
  await repo.setNoteText(inFolder, 'Quarterly plan', 'roadmap')
  const loose = await repo.createNote()
  await repo.setNoteText(loose, 'Groceries', 'milk and eggs')
  const other = await repo.createNote()
  await repo.setNoteText(other, 'Ideas', 'something')
  return { folder, inFolder, loose, other }
}

function Harness({
  data,
  view = { kind: 'root' },
  isDesktop = true,
  onOpenNote = () => {},
  onNavigate = () => {},
  onMode = () => {},
}: {
  data: LibraryData
  view?: View
  isDesktop?: boolean
  onOpenNote?: (id: string) => void
  onNavigate?: (v: View) => void
  onMode?: (m: 'list' | 'grid') => void
}) {
  return (
    <DialogProvider>
      <Library
        data={data}
        view={view}
        query=""
        mode="list"
        onMode={onMode}
        isDesktop={isDesktop}
        onNavigate={onNavigate}
        onClearQuery={() => {}}
        onOpenNote={onOpenNote}
      />
    </DialogProvider>
  )
}

beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.folders.clear(), db.tags.clear(), db.outbox.clear()])
})
afterEach(() => cleanup())

describe('Library on desktop', () => {
  it('shows folders and only the notes that are not in a folder, each with a checkbox', async () => {
    await seed()
    render(<Harness data={await load()} />)

    expect(screen.getByText('Work')).toBeTruthy()
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('Ideas')).toBeTruthy()
    expect(screen.queryByText('Quarterly plan')).toBeNull() // lives inside the folder
    // folder + 2 loose notes, plus the select-all box in the toolbar
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })

  it('reveals actions when items are checked and moves them to the bin via the themed dialog', async () => {
    const ids = await seed()
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    render(<Harness data={await load()} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    expect(screen.getByText('2 selected')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^Delete$/ }))
    const dialog = await openDialog()
    expect(within(dialog).getByText('Move to recycle bin?')).toBeTruthy()
    expect(nativeConfirm).not.toHaveBeenCalled() // never the browser's own box

    await user.click(within(dialog).getByRole('button', { name: 'Move to bin', hidden: true }))
    await waitFor(async () => {
      expect((await db.notes.get(ids.loose))?.deletedAt).not.toBeNull()
      expect((await db.notes.get(ids.other))?.deletedAt).not.toBeNull()
    })
    expect((await db.notes.get(ids.inFolder))?.deletedAt).toBeNull()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const ids = await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('button', { name: /^Delete$/ }))
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel', hidden: true }))
    expect((await db.notes.get(ids.loose))?.deletedAt).toBeNull()
  })

  it('opens a note on click but selects it on Ctrl+click', async () => {
    const ids = await seed()
    const onOpenNote = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} onOpenNote={onOpenNote} />)

    await user.click(screen.getByRole('button', { name: /Groceries/ }))
    expect(onOpenNote).toHaveBeenCalledWith(ids.loose)

    await user.keyboard('{Control>}')
    await user.click(screen.getByRole('button', { name: /Ideas/ }))
    await user.keyboard('{/Control}')
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('opens a folder when it is clicked', async () => {
    const ids = await seed()
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} onNavigate={onNavigate} />)
    await user.click(screen.getByRole('button', { name: /Work/ }))
    expect(onNavigate).toHaveBeenCalledWith({ kind: 'folder', id: ids.folder })
  })

  it('switches between list and grid', async () => {
    await seed()
    const onMode = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} onMode={onMode} />)
    await user.click(screen.getByRole('button', { name: 'Grid view' }))
    expect(onMode).toHaveBeenCalledWith('grid')
  })

  it('supports keyboard shortcuts: Ctrl+A selects all, Esc clears, G toggles the layout', async () => {
    await seed()
    const onMode = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} onMode={onMode} />)

    await user.keyboard('{Control>}a{/Control}')
    expect(screen.getByText('3 selected')).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('3 selected')).toBeNull()
    await user.keyboard('g')
    expect(onMode).toHaveBeenCalledWith('grid')
  })

  it('creates a note with the N shortcut', async () => {
    await seed()
    const onOpenNote = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} onOpenNote={onOpenNote} />)
    await user.keyboard('n')
    await waitFor(() => expect(onOpenNote).toHaveBeenCalledTimes(1))
    expect(await db.notes.count()).toBe(4)
  })

  it('renames a single selected note', async () => {
    const ids = await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const dialog = await openDialog()
    const input = within(dialog).getByRole('textbox', { hidden: true })
    expect((input as HTMLInputElement).value).toBe('Groceries')
    await user.clear(input)
    await user.type(input, 'Shopping{Enter}')
    await waitFor(async () => expect((await db.notes.get(ids.loose))?.title).toBe('Shopping'))
  })

  it('renames a selected folder with F2', async () => {
    const ids = await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Work' }))
    await user.keyboard('{F2}')
    const dialog = await openDialog()
    expect(within(dialog).getByText('Rename folder')).toBeTruthy()
    const input = within(dialog).getByRole('textbox', { hidden: true })
    await user.clear(input)
    await user.type(input, 'Office{Enter}')
    await waitFor(async () => expect((await db.folders.get(ids.folder))?.name).toBe('Office'))
  })

  it('offers Rename only when exactly one item is selected', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull()
  })

  it('copies the selected notes as Markdown', async () => {
    await seed()
    const user = userEvent.setup() // installs its own clipboard, so ours goes in afterwards
    const copied: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    })
    render(<Harness data={await load()} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(copied).toHaveLength(1))
    expect(copied[0]).toContain('# Groceries')
    expect(copied[0]).toContain('milk and eggs')
    expect(copied[0]).toContain('\n\n---\n\n') // the notes are separated
    expect(copied[0]).toContain('# Ideas')
    expect(await screen.findByText('Copied 2 notes as Markdown.')).toBeTruthy()
  })

  it('pins the selection with the P shortcut', async () => {
    const ids = await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.keyboard('p')
    await waitFor(async () => expect((await db.notes.get(ids.loose))?.pinned).toBe(true))
  })
})

describe('Library on a phone', () => {
  it('hides checkboxes until Select is tapped', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('starts selecting on touch-and-hold, without also opening the item', async () => {
    const ids = await seed()
    const onOpenNote = vi.fn()
    render(<Harness data={await load()} isDesktop={false} onOpenNote={onOpenNote} />)

    const card = screen.getByRole('button', { name: /Groceries/ })
    fireEvent.pointerDown(card, { pointerType: 'touch', clientX: 10, clientY: 10 })
    await new Promise((r) => setTimeout(r, 650))
    fireEvent.pointerUp(card)
    fireEvent.click(card) // the tap that ends the hold

    expect(onOpenNote).not.toHaveBeenCalled()
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: 'Select Groceries' }) as HTMLInputElement).checked).toBe(true)

    // Further taps now pick items instead of opening them.
    fireEvent.click(screen.getByRole('button', { name: /Ideas/ }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    expect(onOpenNote).not.toHaveBeenCalledWith(ids.other)
  })

  it('does not treat a scroll (finger moving) as a hold', async () => {
    await seed()
    render(<Harness data={await load()} isDesktop={false} />)
    const card = screen.getByRole('button', { name: /Groceries/ })
    fireEvent.pointerDown(card, { pointerType: 'touch', clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card, { pointerType: 'touch', clientX: 10, clientY: 60 })
    await new Promise((r) => setTimeout(r, 650))
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('renames a tag from its page', async () => {
    await seed()
    const tagId = await repo.createTag('work')
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} view={{ kind: 'tag', id: tagId }} />)
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    const dialog = await openDialog()
    const input = within(dialog).getByRole('textbox', { hidden: true })
    await user.clear(input)
    await user.type(input, 'office{Enter}')
    await waitFor(async () => expect((await db.tags.get(tagId))?.name).toBe('office'))
  })

  it('ignores keyboard shortcuts', async () => {
    await seed()
    const onOpenNote = vi.fn()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} onOpenNote={onOpenNote} />)
    await user.keyboard('n')
    expect(onOpenNote).not.toHaveBeenCalled()
  })
})

describe('recycle bin view', () => {
  it('restores a binned note and shows how long it has left', async () => {
    const ids = await seed()
    await repo.trashNotes([ids.loose])
    const user = userEvent.setup()
    render(<Harness data={await load()} view={{ kind: 'bin' }} />)

    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('30 days left')).toBeTruthy()
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(async () => expect((await db.notes.get(ids.loose))?.deletedAt).toBeNull())
  })

  it('deletes forever only after the themed confirmation', async () => {
    const ids = await seed()
    await repo.trashNotes([ids.loose])
    const user = userEvent.setup()
    render(<Harness data={await load()} view={{ kind: 'bin' }} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('button', { name: /Delete forever/ }))
    const dialog = await openDialog()
    expect(within(dialog).getByText(/cannot be undone/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete forever', hidden: true }))
    await waitFor(async () => expect(await db.notes.get(ids.loose)).toBeUndefined())
  })
})
