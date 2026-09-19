// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import type { Editor } from '@tiptap/react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repo } from '../sync/runtime'
import NoteEditor from './NoteEditor'
import { DialogProvider } from './ui/Dialogs'

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
  // Layout APIs ProseMirror calls that jsdom does not implement.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
  Range.prototype.getBoundingClientRect = () => rect as DOMRect
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  document.elementFromPoint = () => null
})

let noteId = ''
let folderId = ''
beforeEach(async () => {
  setScreen(true)
  await Promise.all([db.notes.clear(), db.folders.clear(), db.tags.clear(), db.outbox.clear()])
  folderId = await repo.createFolder('Work')
  noteId = await repo.createNote()
  await repo.setNoteText(noteId, 'Draft', 'first words')
})
afterEach(() => cleanup())

const editorView = (props: { embedded?: boolean; onClose?: () => void } = {}) => (
  <DialogProvider>
    <NoteEditor id={noteId} onClose={props.onClose ?? (() => {})} embedded={props.embedded} />
  </DialogProvider>
)

/** The Tiptap editor behind the note body (typing into contenteditable is not simulated by jsdom). */
async function tiptap(): Promise<Editor> {
  const el = await screen.findByRole('textbox', { name: 'Note text' })
  return waitFor(() => {
    const editor = (el as HTMLElement & { editor?: Editor }).editor
    if (!editor) throw new Error('editor not ready')
    return editor
  })
}

const saved = () => db.notes.get(noteId)

describe('note editor', () => {
  it('shows the existing text and saves new text, keeping the plain text searchable', async () => {
    render(editorView())
    const editor = await tiptap()
    expect(editor.getText()).toBe('first words')

    editor.commands.focus('end')
    editor.commands.insertContent(' and more')
    await waitFor(async () => expect((await saved())?.contentText).toBe('first words and more'))
  })

  it('applies bold from the toolbar and stores it in the note', async () => {
    const user = userEvent.setup()
    render(editorView())
    const editor = await tiptap()
    editor.commands.selectAll()
    await user.click(screen.getByRole('button', { name: 'Bold' }))

    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true')
    await waitFor(async () => expect(JSON.stringify((await saved())?.content)).toContain('"type":"bold"'))
  })

  it('sets a font, size, colour and highlight from the toolbar menus', async () => {
    const user = userEvent.setup()
    render(editorView())
    const editor = await tiptap()
    editor.commands.selectAll()

    await user.click(screen.getByRole('button', { name: 'Font' }))
    await user.click(screen.getByRole('button', { name: 'Lora' }))
    await user.click(screen.getByRole('button', { name: 'Font size' }))
    await user.click(screen.getByRole('button', { name: '24' }))
    await user.click(screen.getByRole('button', { name: 'Text colour' }))
    await user.click(screen.getByRole('button', { name: 'Text colour: Blue' }))
    await user.click(screen.getByRole('button', { name: 'Highlight' }))
    await user.click(screen.getByRole('button', { name: 'Highlight: Yellow' }))

    await waitFor(async () => {
      const json = JSON.stringify((await saved())?.content)
      expect(json).toContain('Lora, serif')
      expect(json).toContain('24px')
      expect(json).toContain('#1c7ed6')
      expect(json).toContain('"type":"highlight"')
    })
  })

  it('turns the selected lines into a checklist and bullets', async () => {
    const user = userEvent.setup()
    render(editorView())
    const editor = await tiptap()
    editor.commands.selectAll()
    await user.click(screen.getByRole('button', { name: 'Checklist' }))
    await waitFor(async () => expect(JSON.stringify((await saved())?.content)).toContain('"type":"taskList"'))

    await user.click(screen.getByRole('button', { name: 'Bulleted list' }))
    await waitFor(async () => expect(JSON.stringify((await saved())?.content)).toContain('"type":"bulletList"'))
  })

  it('applies subscript and superscript', async () => {
    const user = userEvent.setup()
    render(editorView())
    const editor = await tiptap()
    editor.commands.selectAll()
    await user.click(screen.getByRole('button', { name: 'Superscript' }))
    await waitFor(async () => expect(JSON.stringify((await saved())?.content)).toContain('"type":"superscript"'))
  })

  it('asks with the themed dialog before moving the note to the bin', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    render(editorView())
    await tiptap()
    await user.click(screen.getByRole('button', { name: /^Delete$/ }))

    const dialog = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('dialog[open]')
      if (!el) throw new Error('no dialog')
      return el
    })
    expect(within(dialog).getByText('Move note to recycle bin?')).toBeTruthy()
    expect(nativeConfirm).not.toHaveBeenCalled()
    expect((await saved())?.deletedAt).toBeNull()

    await user.click(within(dialog).getByRole('button', { name: 'Move to bin', hidden: true }))
    await waitFor(async () => expect((await saved())?.deletedAt).not.toBeNull())
  })

  it('moves the note to a folder, pins it and tags it', async () => {
    const user = userEvent.setup()
    render(editorView())
    await user.selectOptions(await screen.findByRole('combobox', { name: /^Folder/ }), folderId)
    await waitFor(async () => expect((await saved())?.folderId).toBe(folderId))

    await user.click(screen.getByRole('button', { name: /^Pin$/ }))
    await waitFor(async () => expect((await saved())?.pinned).toBe(true))

    await user.type(screen.getByRole('combobox', { name: 'Add tag' }), '#ideas{Enter}')
    await waitFor(async () => expect((await saved())?.tagIds).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: 'Remove tag ideas' }))
    await waitFor(async () => expect((await saved())?.tagIds).toEqual([]))
  })

  it('shows a rename made elsewhere while the note is open', async () => {
    render(editorView())
    await tiptap()
    await repo.renameNote(noteId, 'Renamed')
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Note title' }) as HTMLInputElement).value).toBe('Renamed'))
  })

  it('pins the toolbar to the bottom of the screen on a phone', async () => {
    setScreen(false)
    render(editorView())
    await tiptap()
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' })
    expect(toolbar.closest('.fixed')).not.toBeNull()
  })

  it('in the side panel, Close closes it without touching browser history', async () => {
    const onClose = vi.fn()
    const back = vi.spyOn(history, 'back')
    const user = userEvent.setup()
    render(editorView({ embedded: true, onClose }))
    await tiptap()
    await user.click(screen.getByRole('button', { name: /Close/ }))
    expect(onClose).toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })
})

describe('leaving a note', () => {
  it('discards a brand-new note that was left empty', async () => {
    const empty = await repo.createNote()
    const { unmount } = render(
      <DialogProvider>
        <NoteEditor id={empty} onClose={() => {}} />
      </DialogProvider>,
    )
    await screen.findByRole('textbox', { name: 'Note text' })
    unmount()
    await waitFor(async () => expect(await db.notes.get(empty)).toBeUndefined())
  })

  it('keeps a note that has text', async () => {
    const { unmount } = render(editorView())
    await tiptap()
    unmount()
    await new Promise((r) => setTimeout(r, 50))
    expect(await saved()).toBeDefined()
  })
})
