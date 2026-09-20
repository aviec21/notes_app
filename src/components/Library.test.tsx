// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryData, View } from '../lib/library'
import { db, repo } from '../sync/runtime'
import Library from './Library'
import { downloadBlob } from '../lib/export'
import { DialogProvider } from './ui/Dialogs'

// Saving a file needs a real browser; the test only checks what would be saved.
vi.mock('../lib/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/export')>()),
  downloadBlob: vi.fn(),
}))

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
  mode = 'list',
  onOpenNote = () => {},
  onNavigate = () => {},
  onMode = () => {},
}: {
  data: LibraryData
  view?: View
  isDesktop?: boolean
  mode?: 'list' | 'grid'
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
        mode={mode}
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

  it('keeps Rename in place but greyed out unless exactly one item is selected', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    const rename = () => screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement
    expect(rename().disabled).toBe(false)

    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    expect(rename().disabled).toBe(true) // still there, so nothing moves
    expect(rename().title).toContain('exactly one')
  })

  it('shows the same buttons in the same order for one item, several items, or a folder', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    const actions = () =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-toolbar] button')]
        .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())
        .filter((name) => name && !name.startsWith('Select ') && name !== 'Select all')

    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    const one = actions()
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    const two = actions()
    await user.click(screen.getByRole('checkbox', { name: 'Select Work' })) // now includes a folder
    const withFolder = actions()

    expect(one).toEqual(['Export selected as one Markdown file (X)', 'Copy', 'Rename', 'Move', 'Tag', 'Pin', 'Delete', 'Clear selection'])
    expect(two).toEqual(one)
    expect(withFolder).toEqual(one)
  })

  it('greys out Copy, Move and Tag when only a folder is selected', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Work' }))
    for (const name of ['Copy', 'Move', 'Tag']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the top bar a single fixed-height row, selected or not, so the list never jumps', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    const bar = () => document.querySelector<HTMLElement>('[data-toolbar]')!
    const cls = () => bar().className

    expect(cls()).toContain('h-14')
    expect(cls()).toContain('flex-nowrap')
    expect(cls()).not.toContain('flex-wrap ')
    await user.click(screen.getByRole('button', { name: 'Select' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    expect(bar().className).toBe(cls()) // same bar, same height
    expect(bar().className).toContain('h-14')
    // Every button in the bar refuses to wrap onto a second line.
    for (const button of bar().querySelectorAll('button')) {
      if (button.closest('[role="group"]')) continue // the list/grid switch is one unit
      expect(button.className).toContain('shrink-0')
    }
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

describe('exporting the selection', () => {
  const saved = () => vi.mocked(downloadBlob).mock.calls.at(-1)!

  it('downloads one Markdown file with the chosen notes and folders, with headings', async () => {
    await seed()
    vi.mocked(downloadBlob).mockClear()
    const user = userEvent.setup()
    render(<Harness data={await load()} />)

    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull() // nothing selected yet
    await user.click(screen.getByRole('checkbox', { name: 'Select Work' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('button', { name: /^Export/ }))

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    const [blob, filename] = saved() as [Blob, string]
    expect(filename).toMatch(/^notes-export-\d{4}-\d{2}-\d{2}\.md$/)
    expect(blob.type).toContain('text/markdown')
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob)
    })
    expect(text).toContain('# Notes export')
    expect(text).toContain('## Work') // the folder
    expect(text).toContain('### Quarterly plan') // its note, one level below
    expect(text).toContain('## Groceries') // the loose note, beside the folder
    expect(text).not.toContain('Ideas') // not selected
    expect(await screen.findByText(/Downloaded notes-export-/)).toBeTruthy()
  })

  it('exports with the X shortcut, and also from the recycle bin', async () => {
    const ids = await seed()
    await repo.trashNotes([ids.loose])
    vi.mocked(downloadBlob).mockClear()
    const user = userEvent.setup()
    render(<Harness data={await load()} view={{ kind: 'bin' }} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.keyboard('x')
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(saved()[1]).toBe('Groceries.md')
  })
})

describe('search results', () => {
  it('mark the matched words in the title and the preview', async () => {
    await seed()
    const user = userEvent.setup()
    const data = await load()
    render(
      <DialogProvider>
        <Library
          data={data}
          view={{ kind: 'root' }}
          query="EGG"
          mode="list"
          onMode={() => {}}
          isDesktop
          onNavigate={() => {}}
          onClearQuery={() => {}}
          onOpenNote={() => {}}
        />
      </DialogProvider>,
    )
    void user
    const card = screen.getByRole('button', { name: /Groceries/ })
    const marks = [...card.querySelectorAll('mark')].map((m) => m.textContent)
    expect(marks).toEqual(['eggs'.slice(0, 3)]) // "milk and eggs": the matched letters, in the note's own capitals
  })

  it('keep the preview close to the match, so it stays visible on a narrow row', async () => {
    const id = await repo.createNote()
    await repo.setNoteText(id, 'Long', `${'filler '.repeat(60)}needle ${'more '.repeat(60)}`)
    const data = await load()
    render(
      <DialogProvider>
        <Library
          data={data}
          view={{ kind: 'root' }}
          query="needle"
          mode="list"
          onMode={() => {}}
          isDesktop
          onNavigate={() => {}}
          onClearQuery={() => {}}
          onOpenNote={() => {}}
        />
      </DialogProvider>,
    )
    const preview = document.querySelector('[data-card="list"] span.truncate.text-sm') as HTMLElement
    const text = preview.textContent ?? ''
    expect(text).toContain('needle')
    expect(text.indexOf('needle')).toBeLessThanOrEqual(30) // near the start, not buried in the middle
    expect(text.length).toBeLessThanOrEqual(60)
  })
})

describe('folder colours', () => {
  it('shows a folder with its chosen colour, and offers a picker on its page', async () => {
    const ids = await seed()
    await repo.setFolderColor(ids.folder, 'blue')
    const user = userEvent.setup()
    const data = await load()
    render(<Harness data={data} view={{ kind: 'folder', id: ids.folder }} />)

    await user.click(screen.getByRole('button', { name: /Color/ }))
    const dialog = await openDialog()
    expect(within(dialog).getByRole('button', { name: 'Blue', hidden: true }).getAttribute('aria-pressed')).toBe('true')
    await user.click(within(dialog).getByRole('button', { name: 'Green', hidden: true }))
    await waitFor(async () => expect((await db.folders.get(ids.folder))?.color).toBe('green'))
  })

  it('can clear a folder’s colour', async () => {
    const ids = await seed()
    await repo.setFolderColor(ids.folder, 'red')
    const user = userEvent.setup()
    render(<Harness data={await load()} view={{ kind: 'folder', id: ids.folder }} />)
    await user.click(screen.getByRole('button', { name: /Color/ }))
    await user.click(within(await openDialog()).getByRole('button', { name: 'No colour', hidden: true }))
    await waitFor(async () => expect((await db.folders.get(ids.folder))?.color).toBeNull())
  })

  it('draws the folder icon in that colour on the home list', async () => {
    const ids = await seed()
    await repo.setFolderColor(ids.folder, 'violet')
    render(<Harness data={await load()} />)
    const card = screen.getByRole('button', { name: /Work/ })
    const icon = card.querySelector('svg') as SVGElement
    expect(icon.style.color).toBe('var(--folder-violet)')
  })

  it('refuses a colour that does not exist', async () => {
    const ids = await seed()
    await expect(repo.setFolderColor(ids.folder, 'not-a-colour')).rejects.toThrow('Unknown folder colour')
    expect((await db.folders.get(ids.folder))?.color).toBeNull()
  })
})

describe('card sizes', () => {
  const cards = () => [...document.querySelectorAll<HTMLElement>('[data-card]')]

  it('gives every list row the same height, however much a note contains', async () => {
    const short = await repo.createNote()
    await repo.setNoteText(short, 'Short', 'hi')
    const long = await repo.createNote()
    await repo.setNoteText(long, 'A very long note', 'word '.repeat(2000))
    render(<Harness data={await load()} mode="list" />)

    expect(cards().length).toBeGreaterThanOrEqual(2)
    for (const card of cards()) {
      expect(card.dataset.card).toBe('list')
      expect(card.className).toContain('h-[4.5rem]')
    }
  })

  it('gives every grid card the same height, and shows at most two lines of the note', async () => {
    const short = await repo.createNote()
    await repo.setNoteText(short, 'Short', 'hi')
    const long = await repo.createNote()
    await repo.setNoteText(long, 'A very long note', 'word '.repeat(2000))
    render(<Harness data={await load()} mode="grid" />)

    for (const card of cards()) {
      expect(card.dataset.card).toBe('grid')
      expect(card.className).toContain('h-36')
    }
    const preview = [...document.querySelectorAll<HTMLElement>('[data-card] span.line-clamp-2')]
    expect(preview.length).toBeGreaterThanOrEqual(2)
    // The text handed to the card is also capped, so a huge note never bloats the page.
    for (const el of preview) expect((el.textContent ?? '').length).toBeLessThanOrEqual(160)
  })

  it('keeps folders the same size as notes', async () => {
    await seed()
    render(<Harness data={await load()} mode="grid" />)
    const heights = new Set(cards().map((c) => c.className.match(/h-36/)?.[0]))
    expect([...heights]).toEqual(['h-36'])
  })
})

describe('selection bar: phone "More" menu', () => {
  const barButtons = () =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-toolbar] button')].map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim())

  async function selectOnPhone(user: ReturnType<typeof userEvent.setup>, ...titles: string[]) {
    await user.click(screen.getByRole('button', { name: 'Select' }))
    for (const title of titles) await user.click(screen.getByRole('checkbox', { name: `Select ${title}` }))
  }

  const openMore = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    return openDialog()
  }

  const menuNames = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole('menuitem', { hidden: true })
      .map((item) => item.firstChild?.textContent)

  it('shows only Move, Delete and More on the bar, with the rest tucked into the menu', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')

    expect(barButtons()).toEqual(['Clear selection', 'Move', 'Delete', 'More actions'].map((n) => (n === 'More actions' ? 'More actions' : n)))
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull() // not on the bar itself
  })

  it('keeps the bar identical whether one or several items are chosen', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')
    const one = barButtons()
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    expect(barButtons()).toEqual(one)
    await user.click(screen.getByRole('checkbox', { name: 'Select Work' }))
    expect(barButtons()).toEqual(one)
  })

  it('lists the other actions in the menu, in the same order every time', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')

    const dialog = await openMore(user)
    const expected = ['Export as Markdown', 'Copy as Markdown', 'Rename', 'Tag', 'Pin', 'Select all']
    expect(menuNames(dialog)).toEqual(expected)
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))
    expect(menuNames(await openMore(user))).toEqual(expected) // still the same list with two chosen
  })

  it('greys out Rename in the menu unless exactly one item is chosen', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries', 'Ideas')
    const dialog = await openMore(user)
    const rename = within(dialog).getByRole('menuitem', { name: /Rename/, hidden: true }) as HTMLButtonElement
    expect(rename.disabled).toBe(true)
    expect(rename.textContent).toContain('exactly one')
  })

  it('renames the chosen note from the menu', async () => {
    const ids = await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')
    const menu = await openMore(user)
    await user.click(within(menu).getByRole('menuitem', { name: /Rename/, hidden: true }))

    const prompt = await waitFor(() => {
      const el = [...document.querySelectorAll<HTMLElement>('dialog[open]')].find((d) => d.textContent?.includes('Rename note'))
      if (!el) throw new Error('no rename dialog')
      return el
    })
    const input = within(prompt).getByRole('textbox', { hidden: true })
    await user.clear(input)
    await user.type(input, 'Shopping{Enter}')
    await waitFor(async () => expect((await db.notes.get(ids.loose))?.title).toBe('Shopping'))
  })

  it('exports, pins and selects all from the menu', async () => {
    const ids = await seed()
    vi.mocked(downloadBlob).mockClear()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')

    await user.click(within(await openMore(user)).getByRole('menuitem', { name: /Export/, hidden: true }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))

    await user.click(within(await openMore(user)).getByRole('menuitem', { name: /^Pin/, hidden: true }))
    await waitFor(async () => expect((await db.notes.get(ids.loose))?.pinned).toBe(true))

    await user.click(within(await openMore(user)).getByRole('menuitem', { name: 'Select all', hidden: true }))
    expect(await screen.findByText('3 selected')).toBeTruthy()
  })

  it('still asks before deleting, with the icon-only Delete button', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} />)
    await selectOnPhone(user, 'Groceries')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(await openDialog()).getByText('Move to recycle bin?')).toBeTruthy()
  })

  it('in the recycle bin: Restore, Delete forever and More', async () => {
    const ids = await seed()
    await repo.trashNotes([ids.loose])
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop={false} view={{ kind: 'bin' }} />)
    await selectOnPhone(user, 'Groceries')
    expect(barButtons()).toEqual(['Clear selection', 'Restore', 'Delete forever', 'More actions'])

    const menu = await openMore(user)
    // Nothing to rename or tag in the bin. The one note there is selected, so it offers to deselect.
    expect(menuNames(menu)).toEqual(['Export as Markdown', 'Copy as Markdown', 'Deselect all'])
  })
})

describe('selection bar on a computer', () => {
  it('shows every action on the bar itself, with Rename greyed out for several items', async () => {
    await seed()
    const user = userEvent.setup()
    render(<Harness data={await load()} isDesktop />)
    await user.click(screen.getByRole('checkbox', { name: 'Select Groceries' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Ideas' }))

    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull() // no menu needed here
    for (const name of ['Rename', 'Move', 'Tag', 'Pin', 'Delete', 'Copy']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
    expect((screen.getByRole('button', { name: 'Rename' }) as HTMLButtonElement).disabled).toBe(true)
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
