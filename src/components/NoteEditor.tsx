import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { DocJson, NoteRecord } from '../../shared/sync'
import { noteExtensions } from '../editor/extensions'
import Toolbar from '../editor/Toolbar'
import { useHotkeys } from '../hotkeys'
import { useIsDesktop, useLibraryData } from '../hooks'
import { compressImage, storeImage } from '../images'
import { copyText } from '../lib/clipboard'
import { noteToMarkdown } from '../lib/markdown'
import CopyMenu from './CopyMenu'
import { effectiveFolderId, liveFolders } from '../lib/library'
import { db, repo } from '../sync/runtime'
import SyncStatus from './SyncStatus'
import { useDialogs } from './ui/Dialogs'
import { BackIcon, CloseIcon, PinIcon, TrashIcon } from './ui/Icons'

const SAVE_DELAY_MS = 400

type Flush = () => Promise<void>

/** How many editors currently show each note (a note is only discarded once none do). */
const openEditors = new Map<string, number>()

/**
 * The title and the rich-text body. Edits are saved to this device ~0.4 s after you stop
 * typing. The formatting toolbar goes into `toolbarSlot` (desktop header) or, on a phone,
 * is pinned to the bottom of the screen, just above the keyboard.
 */
function Fields({
  note,
  flushRef,
  toolbarSlot,
  copySlot,
  isDesktop,
}: {
  note: NoteRecord
  flushRef: RefObject<Flush>
  toolbarSlot: HTMLElement | null
  copySlot: HTMLElement | null
  isDesktop: boolean
}) {
  const [title, setTitle] = useState(note.title)
  const [imageError, setImageError] = useState<string | null>(null)
  const latest = useRef({ title: note.title, content: note.content })
  const dirty = useRef(false) // typed, but not saved yet
  const timer = useRef<number | undefined>(undefined)

  const save = useCallback<Flush>(async () => {
    window.clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    await repo.setNoteContent(note.id, latest.current.title, latest.current.content)
  }, [note.id])

  const scheduleSave = useCallback(() => {
    dirty.current = true
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS)
  }, [save])
  // The editor keeps its first onUpdate callback, so it reaches the latest one through a ref.
  const scheduleRef = useRef(scheduleSave)
  useEffect(() => {
    scheduleRef.current = scheduleSave
  }, [scheduleSave])

  const fileInput = useRef<HTMLInputElement>(null)
  const addImages = useRef(async (_files: FileList | File[]) => {})

  const editor = useEditor({
    extensions: noteExtensions,
    content: note.content as JSONContent,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: 'note-content', 'aria-label': 'Note text', role: 'textbox', 'aria-multiline': 'true' },
      // Pictures pasted or dragged in are stored with the note, never linked from elsewhere.
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return false
        event.preventDefault()
        void addImages.current(files)
        return true
      },
      handleDrop: (_view, event) => {
        const dropped = event instanceof DragEvent ? event.dataTransfer?.files : undefined
        const files = [...(dropped ?? [])].filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return false
        event.preventDefault()
        void addImages.current(files)
        return true
      },
    },
    onUpdate: ({ editor: e }) => {
      latest.current.content = e.getJSON() as DocJson
      scheduleRef.current()
    },
  })

  addImages.current = async (files) => {
    for (const file of [...files].slice(0, 10)) {
      try {
        const { blob, mime } = await compressImage(file)
        const imageId = await storeImage(note.id, blob, mime)
        editor?.chain().focus().insertContent({ type: 'noteImage', attrs: { imageId, alt: file.name, width: 100 } }).run()
      } catch (err) {
        const tooBig = err instanceof Error && err.message === 'too-large'
        setImageError(
          tooBig
            ? 'That picture is too large (the limit is about 3 MB after shrinking).'
            : 'That picture could not be added.',
        )
      }
    }
  }

  useEffect(() => {
    flushRef.current = save
  }, [flushRef, save])

  // Save when the tab is hidden or closed, and when leaving the editor.
  useEffect(() => {
    const id = note.id
    openEditors.set(id, (openEditors.get(id) ?? 0) + 1)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void save()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', save)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', save)
      openEditors.set(id, (openEditors.get(id) ?? 1) - 1)
      // A note you opened and left blank is not worth keeping. The check runs after the
      // final save, and only if no editor re-opened the note in the meantime.
      void save().then(() => {
        if (!openEditors.get(id)) void repo.discardIfEmpty(id)
      })
    }
  }, [save, note.id])

  // Show changes that arrive from another device (or a rename), unless you are mid-edit.
  useEffect(() => {
    if (dirty.current || !editor) return
    if (note.title !== latest.current.title) {
      latest.current.title = note.title
      setTitle(note.title)
    }
    if (JSON.stringify(note.content) !== JSON.stringify(latest.current.content)) {
      latest.current.content = note.content
      editor.commands.setContent(note.content as JSONContent, { emitUpdate: false })
    }
  }, [note.title, note.content, editor])

  function editTitle(next: string) {
    latest.current.title = next
    setTitle(next)
    scheduleSave()
  }

  const toolbar = editor ? (
    <Toolbar editor={editor} placement={isDesktop ? 'top' : 'bottom'} onInsertImage={() => fileInput.current?.click()} />
  ) : null

  useHotkeys([
    {
      keys: 'mod+shift+c',
      inInput: true,
      run: () => {
        if (editor) void copyText(noteToMarkdown(latest.current.title, editor.getJSON()))
      },
    },
  ])

  return (
    <>
      <input
        value={title}
        onChange={(e) => editTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editor?.commands.focus('start')
          }
        }}
        placeholder="Title"
        aria-label="Note title"
        maxLength={1000}
        className="w-full bg-transparent text-2xl font-semibold outline-none"
      />
      {copySlot && createPortal(<CopyMenu editor={editor} title={title} />, copySlot)}
      <EditorContent editor={editor} className="min-h-[50vh]" />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Add pictures"
        onChange={(e) => {
          setImageError(null)
          if (e.target.files) void addImages.current(e.target.files)
          e.target.value = '' // so the same file can be chosen again
        }}
      />
      {imageError && (
        <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {imageError}{' '}
          <button type="button" onClick={() => setImageError(null)} className="underline">
            Dismiss
          </button>
        </p>
      )}
      {isDesktop
        ? toolbarSlot && createPortal(toolbar, toolbarSlot)
        : toolbar && (
            <div
              className="fixed inset-x-0 bottom-0 z-20"
              style={{
                background: 'var(--bg)',
                borderTop: '1px solid var(--border)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              {toolbar}
            </div>
          )}
    </>
  )
}

/** Folder, pin and tags for the open note. */
function NoteMeta({ note, onOpenTag }: { note: NoteRecord; onOpenTag?: (tagId: string) => void }) {
  const data = useLibraryData()
  const [draft, setDraft] = useState('')
  const adding = useRef<Promise<void>>(Promise.resolve())
  const listId = useId()
  if (!data) return null

  const folders = liveFolders(data).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const folderId = effectiveFolderId(note, new Set(folders.map((f) => f.id))) ?? ''
  const noteTags = data.tags.filter((t) => note.tagIds.includes(t.id))
  const unused = data.tags.filter((t) => !note.tagIds.includes(t.id))

  /**
   * Adds a tag. Leaving the field and pressing Add can both fire for one word, so the
   * calls are queued and each one re-reads the note's tags; the second then finds nothing
   * left to do instead of creating a duplicate.
   */
  async function addTag(raw: string) {
    const name = raw.trim().replace(/^#/, '')
    if (!name) return
    setDraft('')
    adding.current = adding.current.then(async () => {
      const id = await repo.createTag(name)
      const current = await db.notes.get(note.id)
      if (current && !current.tagIds.includes(id)) await repo.setNoteTags(note.id, [...current.tagIds, id])
    })
    await adding.current
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
        <span key={tag.id} className="flex items-center gap-1 rounded-full py-0.5 pr-1 pl-1" style={{ border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => onOpenTag?.(tag.id)}
            disabled={!onOpenTag}
            title={onOpenTag ? `Show all notes tagged #${tag.name}` : undefined}
            className="rounded-full px-1.5 disabled:cursor-default"
          >
            #{tag.name}
          </button>
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
      {/* A form so the phone keyboard's "Go" adds the tag; leaving the field adds it too,
          so a typed tag is never silently lost. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void addTag(draft)
        }}
        className="flex items-center gap-1"
      >
        <input
          value={draft}
          list={listId}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === ',') {
              e.preventDefault()
              void addTag(draft)
            }
          }}
          onBlur={() => void addTag(draft)}
          placeholder="+ Add tag"
          aria-label="Add tag"
          maxLength={60}
          enterKeyHint="done"
          className="w-28 rounded-lg bg-transparent px-2 py-1.5 outline-none focus:ring-2"
          style={{ border: '1px dashed var(--border)' }}
        />
        {draft.trim() && (
          <button type="submit" aria-label={`Add tag ${draft.trim()}`} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            Add
          </button>
        )}
      </form>
      <datalist id={listId}>
        {unused.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
    </div>
  )
}

/**
 * Edits one note. Full screen, it takes part in history so the device's Back button
 * returns to the list. `embedded` (desktop editor mode) shows it as a side panel instead.
 */
export default function NoteEditor({
  id,
  onClose,
  embedded = false,
  onOpenTag,
}: {
  id: string
  onClose: () => void
  embedded?: boolean
  /** Opens the tag's page (clicking a tag chip on the note). */
  onOpenTag?: (tagId: string) => void
}) {
  const dialogs = useDialogs()
  // undefined while loading, null if the note no longer exists.
  const note = useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id])
  const flushRef = useRef<Flush>(async () => {})
  const pane = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktop()
  const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null)
  const [copySlot, setCopySlot] = useState<HTMLDivElement | null>(null)

  // Full screen: the device's Back button (and the browser's) returns to the list.
  useEffect(() => {
    if (embedded) return
    if ((history.state as { noteId?: string } | null)?.noteId !== id) {
      history.pushState({ noteId: id }, '')
    }
    const onPop = () => onClose()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [id, onClose, embedded])

  const close = () => (embedded ? onClose() : history.back())

  useEffect(() => {
    // Gone (deleted for good elsewhere), or moved to the bin while open in the side panel.
    if (note === null || (embedded && note?.deletedAt != null)) onClose()
  }, [note, onClose, embedded])

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
    close()
  }

  // In the side panel these keys belong to the note only while you are working inside it.
  const inPane = (e: KeyboardEvent) => !embedded || !!pane.current?.contains(e.target as Node)
  useHotkeys([
    { keys: 'escape', run: close, inInput: true, when: inPane },
    { keys: 'mod+s', run: () => void flushRef.current(), inInput: true, when: inPane },
  ])

  const buttonClass = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm'
  return (
    <div ref={pane} className={`flex flex-col gap-3 pb-28 ${embedded ? '' : 'mx-auto max-w-3xl'}`}>
      <header
        className="sticky top-0 z-10 -mx-4 flex flex-col px-4 md:-mx-6 md:px-6"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between gap-3 py-3">
          <button type="button" onClick={close} className={buttonClass} style={{ border: '1px solid var(--border)' }}>
            {embedded ? (
              <>
                <CloseIcon /> Close
              </>
            ) : (
              <>
                <BackIcon /> Back
              </>
            )}
          </button>
          <SyncStatus />
          <div ref={setCopySlot} />
          <button type="button" onClick={() => void trash()} className={buttonClass} style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}>
            <TrashIcon /> Delete
          </button>
        </div>
        {isDesktop && <div ref={setToolbarSlot} className="-mx-1 pb-1" />}
      </header>
      {note?.id === id && <NoteMeta note={note} onOpenTag={onOpenTag} />}
      {note?.id === id && (
        <Fields key={id} note={note} flushRef={flushRef} toolbarSlot={toolbarSlot} copySlot={copySlot} isDesktop={isDesktop} />
      )}
    </div>
  )
}
