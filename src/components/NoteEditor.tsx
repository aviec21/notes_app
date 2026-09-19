import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { NoteRecord } from '../../shared/sync'
import SyncStatus from './SyncStatus'
import { db, repo } from '../sync/runtime'

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
        className="min-h-[60vh] w-full resize-none bg-transparent text-base leading-relaxed outline-none"
      />
    </>
  )
}

export default function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
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
    if (!window.confirm('Move this note to the recycle bin?')) return
    await flushRef.current()
    await repo.trashNote(id)
    history.back()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-3 px-4 pb-24">
      <header
        className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <button type="button" onClick={() => history.back()} className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)' }}>
          ← Back
        </button>
        <SyncStatus />
        <button type="button" onClick={() => void trash()} className="rounded-lg px-3 py-2 text-sm" style={{ border: '1px solid var(--border)' }}>
          Delete
        </button>
      </header>
      {note && <Fields key={id} note={note} flushRef={flushRef} />}
    </main>
  )
}
