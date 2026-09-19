// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, repo } from '../sync/runtime'
import NoteEditor from './NoteEditor'
import { DialogProvider } from './ui/Dialogs'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

let noteId = ''
let folderId = ''
beforeEach(async () => {
  await Promise.all([db.notes.clear(), db.folders.clear(), db.tags.clear(), db.outbox.clear()])
  folderId = await repo.createFolder('Work')
  noteId = await repo.createNote()
  await repo.setNoteText(noteId, 'Draft', 'first words')
})
afterEach(() => cleanup())

const editor = () => (
  <DialogProvider>
    <NoteEditor id={noteId} onClose={() => {}} />
  </DialogProvider>
)

describe('note editor', () => {
  it('saves typed text to the device', async () => {
    const user = userEvent.setup()
    render(editor())
    const body = await screen.findByRole('textbox', { name: 'Note text' })
    await user.type(body, ' and more')
    await waitFor(async () => expect((await db.notes.get(noteId))?.contentText).toBe('first words and more'))
  })

  it('asks with the themed dialog before moving the note to the bin', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: /Delete/ }))

    const dialog = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('dialog[open]')
      if (!el) throw new Error('no dialog')
      return el
    })
    expect(within(dialog).getByText('Move note to recycle bin?')).toBeTruthy()
    expect(nativeConfirm).not.toHaveBeenCalled()
    expect((await db.notes.get(noteId))?.deletedAt).toBeNull() // not yet

    await user.click(within(dialog).getByRole('button', { name: 'Move to bin', hidden: true }))
    await waitFor(async () => expect((await db.notes.get(noteId))?.deletedAt).not.toBeNull())
  })

  it('moves the note to a folder', async () => {
    const user = userEvent.setup()
    render(editor())
    const select = await screen.findByRole('combobox', { name: /^Folder/ })
    await user.selectOptions(select, folderId)
    await waitFor(async () => expect((await db.notes.get(noteId))?.folderId).toBe(folderId))
  })

  it('pins the note', async () => {
    const user = userEvent.setup()
    render(editor())
    await user.click(await screen.findByRole('button', { name: /^Pin$/ }))
    await waitFor(async () => expect((await db.notes.get(noteId))?.pinned).toBe(true))
  })

  it('adds and removes a tag', async () => {
    const user = userEvent.setup()
    render(editor())
    await user.type(await screen.findByRole('combobox', { name: 'Add tag' }), '#ideas{Enter}')
    await waitFor(async () => expect((await db.notes.get(noteId))?.tagIds).toHaveLength(1))
    expect(await screen.findByText('#ideas')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Remove tag ideas' }))
    await waitFor(async () => expect((await db.notes.get(noteId))?.tagIds).toEqual([]))
    expect(await db.tags.count()).toBe(1) // the tag itself remains available
  })
})
