import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { NoteRecord } from '../../shared/sync'
import { useHotkeys } from '../hotkeys'
import { useLibraryData } from '../hooks'
import { effectiveFolderId, liveFolders } from '../lib/library'
import { db, repo } from '../sync/runtime'
import SyncStatus from './SyncStatus'
import { useDialogs } from './ui/Dialogs'
import { BackIcon, CloseIcon, PinIcon, TrashIcon } from './ui/Icons'

const SAVE_DELAY_MS = 400

type Flush = () => Promise<void>

/** The text fields. Edits are saved to this device ~0.4 s after you stop typing. */
function Fields({ note, flushRef }: { note: NoteRecord; flushRef: RefObject<Flush> }) {
  const [title, setTitle] = useState(note.title)
  const [text, setText] = useState(note.contentText)
  const latest = useRef({ title: note.title, text: note.contentText })
  const dirty = useRef(false) // typed, but not saved yet
  const timer = useRef<number | undefined>(undefined)
  const area = useRef<HTMLTextAreaElement>(null)

  const save = useCallback<Flush>(async () => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    await repo.setNoteText(note.id, latest.current.title, latest.current.text)
  }, [note.id])

  useEffect(() => {
    flushRef.current = save
  }, [flushRef, save])

  // Save when the tab is hidden or closed, and when leaving the editor.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
      void save()
    }
  }, [save])

  // Show changes that arrive from another device, unless you are mid-edit.
  useEffect(() => {
    if (dirty.current) return
    if (note.title !== latest.current.title || note.contentText !== latest.current.text) {
      latest.current = { title: note.title, text: note.contentText }
      setTitle(note.title)
      setText(note.contentText)
    }
  }, [note.title, note.contentText])

  // Grow the text box with its content, so the whole page scrolls as one.
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  function edit(nextTitle: string, nextText: string) {
    latest.current = { title: nextTitle, text: nextText }
    dirty.current = true
    setTitle(nextTitle)
    setText(nextText)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS)
  }

  return (
    <>
      <input
        value={title}
        onChange={(e) => edit(e.target.value, text)}
        placeholder="Title"
        aria-label="Note title"
        maxLength={1000}
        className="w-full bg-transparent text-2xl font-semibold outline-none"
      />
      <textarea
        ref={area}
        value={text}
        onChange={(e) => edit(title, e.target.value)}
        placeholder="Start writing…"
        aria-label="Note text"
        className="min-h-[50vh] w-full resize-none bg-transparent text-base leading-relaxed outline-none"
      />
    </>
  )
}

/** Folder, pin and tags for the open note. */
function NoteMeta({ note }: { note: NoteRecord }) {
  const data = useLibraryData()
  const [draft, setDraft] = useState('')
  const listId = useId()
  if (!data) return null

  const folders = liveFolders(data).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const folderId = effectiveFolderId(note, new Set(folders.map((f) => f.id))) ?? ''
  const noteTags = data.tags.filter((t) => note.tagIds.includes(t.id))
  const unused = data.tags.filter((t) => !note.tagIds.includes(t.id))

  async function addTag(raw: string) {
    const name = raw.trim().replace(/^#/, '')
    if (!name) return
    const id = await repo.createTag(name)
    if (!note.tagIds.includes(id)) await repo.setNoteTags(note.id, [...note.tagIds, id])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span style={{ color: 'var(--muted)' }}>Folder</span>
        <select
          value={folderId}
          onChange={(e) => void repo.moveNotes([note.id], e.target.value || null)}
          className="rounded-lg px-2 py-1.5"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void repo.setPinned([{ entity: 'note', id: note.id }], !note.pinned)}
        aria-pressed={note.pinned}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
        style={note.pinned ? { background: 'var(--accent)', color: 'var(--bg)' } : { border: '1px solid var(--border)' }}
      >
        <PinIcon /> {note.pinned ? 'Pinned' : 'Pin'}
      </button>

      {noteTags.map((tag) => (
        <span key={tag.id} className="flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5" style={{ border: '1px solid var(--border)' }}>
          #{tag.name}
          <button
            type="button"
            onClick={() => void repo.setNoteTags(note.id, note.tagIds.filter((t) => t !== tag.id))}
            aria-label={`Remove tag ${tag.name}`}
            className="rounded-full p-0.5"
          >
            <CloseIcon />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={listId}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            void addTag(draft)
          }
        }}
        placeholder="+ Add tag"
        aria-label="Add tag"
        maxLength={60}
        className="w-28 rounded-lg bg-transparent px-2 py-1.5 outline-none focus:ring-2"
        style={{ border: '1px dashed var(--border)' }}
      />
      <datalist id={listId}>
        {unused.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
    </div>
  )
}

export default function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const dialogs = useDialogs()
  // undefined while loading, null if the note no longer exists.
  const note = useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id])
  const flushRef = useRef<Flush>(async () => {})

  // The device's Back button (and the browser's) returns to the list instead of leaving the app.
  useEffect(() => {
    if ((history.state as { noteId?: string } | null)?.noteId !== id) {
      history.pushState({ noteId: id }, '')
    }
    const onPop = () => {
      const saved = flushRef.current()
      onClose()
      // A note you opened and left blank is not worth keeping.
      void saved.then(() => repo.discardIfEmpty(id))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [id, onClose])

  useEffect(() => {
    if (note === null) onClose()
  }, [note, onClose])

  async function trash() {
    const ok = await dialogs.confirm({
      title: 'Move note to recycle bin?',
      message: `You can restore it from the recycle bin for 30 days.`,
      confirmLabel: 'Move to bin',
      danger: true,
    })
    if (!ok) return
    await flushRef.current()
    await repo.trashNotes([id])
    history.back()
  }

  useHotkeys([
    { keys: 'escape', run: () => history.back(), inInput: true },
    { keys: 'mod+s', run: () => void flushRef.current(), inInput: true },
  ])

  const buttonClass = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm'
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-24">
      <header
        className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 px-4 py-3 md:-mx-6 md:px-6"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <button type="button" onClick={() => history.back()} className={buttonClass} style={{ border: '1px solid var(--border)' }}>
          <BackIcon /> Back
        </button>
        <SyncStatus />
        <button type="button" onClick={() => void trash()} className={buttonClass} style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}>
          <TrashIcon /> Delete
        </button>
      </header>
      {note && <NoteMeta note={note} />}
      {note && <Fields key={id} note={note} flushRef={flushRef} />}
    </div>
  )
}
