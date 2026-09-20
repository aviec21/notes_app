import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BIN_RETENTION_DAYS } from '../../shared/sync'
import type { ItemRef } from '../db/repo'
import { useHotkeys } from '../hotkeys'
import { copyText } from '../lib/clipboard'
import { downloadBlob, exportSelection } from '../lib/export'
import { liveFolders, parseKey, sectionsFor, type LibraryData, type View } from '../lib/library'
import { noteToMarkdown } from '../lib/markdown'
import { repo } from '../sync/runtime'
import ItemCard from './ItemCard'
import { MoveDialog, TagsDialog } from './PickerDialogs'
import { useDialogs } from './ui/Dialogs'
import { BackIcon, CloseIcon, GridIcon, ListIcon, MoreIcon, PinIcon, PlusIcon, SplitIcon, TrashIcon } from './ui/Icons'
import { Modal } from './ui/Modal'

export type ViewMode = 'list' | 'grid'

interface Props {
  data: LibraryData
  view: View
  query: string
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  isDesktop: boolean
  /** Shown above the list (e.g. the default-PIN warning). */
  banner?: ReactNode
  onNavigate: (view: View) => void
  onClearQuery: () => void
  onOpenNote: (id: string) => void
  /** Desktop editor mode: notes open in a panel on the right. Omitted on phones. */
  editorMode?: boolean
  onEditorMode?: (on: boolean) => void
  /** The note open in that panel, highlighted in the list. */
  activeNoteId?: string | null
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ToolButton({
  onClick,
  disabled,
  danger,
  children,
  label,
  hint,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
  /** Accessible name, for buttons that show only an icon. */
  label?: string
  /** Tooltip, e.g. to explain why a button is greyed out. */
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={hint ?? label}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap disabled:opacity-40"
      style={{ border: '1px solid var(--border)', color: danger ? 'var(--danger)' : undefined }}
    >
      {children}
    </button>
  )
}

/** The main pane: a toolbar plus the notes and folders of the current view. */
export default function Library({
  data,
  view,
  query,
  mode,
  onMode,
  isDesktop,
  banner,
  onNavigate,
  onClearQuery,
  onOpenNote,
  editorMode,
  onEditorMode,
  activeNoteId,
}: Props) {
  const dialogs = useDialogs()
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  const searching = query.trim().length > 0
  const inBin = view.kind === 'bin' && !searching
  const folder = view.kind === 'folder' ? data.folders.find((f) => f.id === view.id && f.deletedAt === null) : undefined
  const tag = view.kind === 'tag' ? data.tags.find((t) => t.id === view.id) : undefined

  const sections = useMemo(() => sectionsFor(view, query, data), [view, query, data])
  const visibleKeys = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.key))), [sections])
  // Only items that are still on screen count as selected (a search may hide some).
  const selectedKeys = useMemo(() => [...selection].filter((k) => visibleKeys.has(k)), [selection, visibleKeys])
  const selectedRefs: ItemRef[] = selectedKeys.map((key) => {
    const { kind, id } = parseKey(key)
    return { entity: kind, id }
  })
  const selectedNoteIds = selectedRefs.filter((r) => r.entity === 'note').map((r) => r.id)
  const selectedNotes = data.notes.filter((n) => selectedNoteIds.includes(n.id))
  const selecting = selectedKeys.length > 0
  const allSelected = visibleKeys.size > 0 && selectedKeys.length === visibleKeys.size
  const showCheckbox = isDesktop || selectMode || selecting
  const bodyToggles = inBin || (!isDesktop && (selectMode || selecting))

  const isPinned = (ref: ItemRef) =>
    ref.entity === 'note'
      ? !!data.notes.find((n) => n.id === ref.id)?.pinned
      : !!data.folders.find((f) => f.id === ref.id)?.pinned
  const everythingPinned = selecting && selectedRefs.every(isPinned)

  const clearSelection = () => {
    setSelection(new Set())
    setSelectMode(false)
  }
  // Touch-and-hold on a phone: enter selection with that item picked, like tapping Select.
  const startSelectingWith = (key: string) => {
    setSelectMode(true)
    setSelection((prev) => new Set(prev).add(key))
  }
  const toggle = (key: string) =>
    setSelection((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const selectAll = () => setSelection(allSelected ? new Set() : new Set(visibleKeys))

  function open(key: string) {
    const { kind, id } = parseKey(key)
    if (kind === 'note') onOpenNote(id)
    else onNavigate({ kind: 'folder', id })
  }

  // --- actions ------------------------------------------------------------------------

  async function newNote() {
    if (view.kind === 'bin') return
    const id = await repo.createNote(view.kind === 'folder' ? view.id : null)
    if (view.kind === 'tag') await repo.setNoteTags(id, [view.id])
    onOpenNote(id)
  }

  async function newFolder() {
    const name = await dialogs.prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create' })
    if (name) await repo.createFolder(name)
  }

  async function trashSelected() {
    if (!selecting) return
    const folders = selectedRefs.filter((r) => r.entity === 'folder').length
    const what = selectedRefs.length === 1 ? (folders ? 'this folder' : 'this note') : `these ${selectedRefs.length} items`
    const ok = await dialogs.confirm({
      title: 'Move to recycle bin?',
      message: `Move ${what} to the recycle bin? ${folders ? 'Folders take their notes with them. ' : ''}You can restore ${selectedRefs.length === 1 ? 'it' : 'them'} for ${BIN_RETENTION_DAYS} days.`,
      confirmLabel: 'Move to bin',
      danger: true,
    })
    if (!ok) return
    await repo.trash(selectedRefs)
    clearSelection()
  }

  async function restoreSelected() {
    if (!selecting) return
    await repo.restore(selectedRefs)
    clearSelection()
  }

  async function deleteSelectedForever() {
    if (!selecting) return
    const ok = await dialogs.confirm({
      title: 'Delete forever?',
      message: `${plural(selectedRefs.length, 'item')} will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete forever',
      danger: true,
    })
    if (!ok) return
    await repo.deleteForever(selectedRefs)
    clearSelection()
  }

  async function emptyBin() {
    const ok = await dialogs.confirm({
      title: 'Empty the recycle bin?',
      message: 'Everything in the recycle bin will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Empty bin',
      danger: true,
    })
    if (ok) await repo.emptyBin()
  }

  const togglePinSelected = async () => {
    if (!selecting) return
    await repo.setPinned(selectedRefs, !everythingPinned)
  }

  async function moveSelected(folderId: string | null) {
    setMoveOpen(false)
    await repo.moveNotes(selectedNoteIds, folderId)
    clearSelection()
  }

  async function newFolderAndMove() {
    const name = await dialogs.prompt({ title: 'New folder', label: 'Folder name', confirmLabel: 'Create and move' })
    if (name) await moveSelected(await repo.createFolder(name))
  }

  async function renameItem(ref: ItemRef) {
    if (ref.entity === 'folder') {
      const current = data.folders.find((f) => f.id === ref.id)
      if (!current) return
      const name = await dialogs.prompt({ title: 'Rename folder', label: 'Folder name', initial: current.name, confirmLabel: 'Rename' })
      if (name) await repo.renameFolder(ref.id, name)
    } else {
      const current = data.notes.find((n) => n.id === ref.id)
      if (!current) return
      const title = await dialogs.prompt({ title: 'Rename note', label: 'Title', initial: current.title, confirmLabel: 'Rename' })
      if (title) await repo.renameNote(ref.id, title)
    }
  }

  /** Downloads the selected notes and folders as one Markdown file. */
  async function exportSelected() {
    if (!selecting) return
    try {
      const result = await exportSelection(selectedRefs)
      downloadBlob(new Blob([result.text], { type: 'text/markdown;charset=utf-8' }), result.filename)
      setToast(
        `Downloaded ${result.filename} — ${plural(result.notes, 'note')}${result.folders ? ` from ${plural(result.folders, 'folder')}` : ''}.` +
          (result.missingImages ? ` ${plural(result.missingImages, 'picture')} could not be included (not on this device).` : ''),
      )
    } catch (err) {
      console.error('Export failed:', err)
      setToast('The export could not be created. Please try again.')
    }
  }

  /** Copies the selected notes as Markdown, one after another. */
  async function copySelected() {
    const chosen = data.notes.filter((n) => selectedNoteIds.includes(n.id))
    if (chosen.length === 0) return
    const text = chosen.map((n) => noteToMarkdown(n.title, n.content)).join('\n\n---\n\n')
    const result = await copyText(text)
    setToast(
      result === 'failed'
        ? 'Could not copy. Open the note and copy from there.'
        : `Copied ${chosen.length} ${chosen.length === 1 ? 'note' : 'notes'} as Markdown.`,
    )
  }

  async function renameSelected() {
    if (selectedRefs.length !== 1) return
    await renameItem(selectedRefs[0])
    clearSelection()
  }

  const renameFolder = () => (folder ? renameItem({ entity: 'folder', id: folder.id }) : Promise.resolve())

  async function renameTag() {
    if (!tag) return
    const name = await dialogs.prompt({ title: 'Rename tag', label: 'Tag name', initial: tag.name, confirmLabel: 'Rename' })
    if (name) await repo.renameTag(tag.id, name.replace(/^#/, ''))
  }

  async function deleteTag() {
    if (!tag) return
    const ok = await dialogs.confirm({
      title: 'Delete tag?',
      message: `The tag #${tag.name} will be removed from all notes. The notes themselves are not deleted.`,
      confirmLabel: 'Delete tag',
      danger: true,
    })
    if (!ok) return
    await repo.deleteTag(tag.id)
    onNavigate({ kind: 'root' })
  }

  async function trashFolder() {
    if (!folder) return
    const ok = await dialogs.confirm({
      title: 'Move folder to recycle bin?',
      message: `“${folder.name}” and the notes inside it will move to the recycle bin. You can restore them for ${BIN_RETENTION_DAYS} days.`,
      confirmLabel: 'Move to bin',
      danger: true,
    })
    if (!ok) return
    await repo.trashFolders([folder.id])
    onNavigate({ kind: 'root' })
  }

  // --- keyboard (desktop) -------------------------------------------------------------

  const focusIsNeutral = (e: KeyboardEvent) =>
    e.target === document.body || (e.target instanceof HTMLInputElement && e.target.type === 'checkbox')

  useHotkeys(
    [
      { keys: 'n', run: () => void newNote() },
      { keys: 'shift+n', run: () => void newFolder(), when: () => view.kind !== 'bin' },
      { keys: 'g', run: () => onMode(mode === 'grid' ? 'list' : 'grid') },
      { keys: 'mod+a', run: selectAll },
      {
        keys: 'escape',
        run: () => {
          if (selecting || selectMode) clearSelection()
          else if (searching) onClearQuery()
          else if (view.kind !== 'root') onNavigate({ kind: 'root' })
        },
      },
      {
        keys: ['delete', 'backspace'],
        run: () => void (inBin ? deleteSelectedForever() : trashSelected()),
        when: () => selecting,
      },
      { keys: 'p', run: () => void togglePinSelected(), when: () => selecting && !inBin },
      { keys: 'm', run: () => setMoveOpen(true), when: () => selectedNoteIds.length > 0 && !inBin },
      { keys: 't', run: () => setTagsOpen(true), when: () => selectedNoteIds.length > 0 && !inBin },
      { keys: 'r', run: () => void restoreSelected(), when: () => selecting && inBin },
      { keys: 'f2', run: () => void renameSelected(), when: () => selectedKeys.length === 1 && !inBin },
      { keys: 'c', run: () => void copySelected(), when: () => selectedNoteIds.length > 0 },
      { keys: 'x', run: () => void exportSelected(), when: () => selecting },
      { keys: 'e', run: () => onEditorMode?.(!editorMode), when: () => !!onEditorMode },
      {
        keys: 'enter',
        run: () => open(selectedKeys[0]),
        when: (e) => selectedKeys.length === 1 && !inBin && focusIsNeutral(e),
      },
    ],
    isDesktop,
  )

  // --- rendering ----------------------------------------------------------------------

  if (view.kind === 'folder' && !folder && !searching) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <p style={{ color: 'var(--muted)' }}>This folder no longer exists.</p>
        <ToolButton onClick={() => onNavigate({ kind: 'root' })}>
          <BackIcon /> Back to notes
        </ToolButton>
      </div>
    )
  }

  const title = searching
    ? `Results for “${query.trim()}”`
    : view.kind === 'bin'
      ? 'Recycle bin'
      : view.kind === 'tag'
        ? `#${tag?.name ?? 'tag'}`
        : view.kind === 'folder'
          ? (folder?.name ?? 'Folder')
          : 'Notes'

  const emptyMessage = searching
    ? `Nothing matches “${query.trim()}”.`
    : view.kind === 'bin'
      ? `The recycle bin is empty. Deleted items stay here for ${BIN_RETENTION_DAYS} days.`
      : view.kind === 'tag'
        ? 'No notes have this tag yet.'
        : view.kind === 'folder'
          ? 'This folder is empty.'
          : 'No notes yet. Create your first note.'

  const container =
    mode === 'grid' ? 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]' : 'flex flex-col gap-2'
  // Grid columns share the row equally, so every card has the same width as well as height.

  return (
    <div className="flex flex-col gap-4 pb-28">
      {banner}

      {/*
        A fixed-height, single-row bar: it never wraps, so choosing or clearing a selection
        cannot make it taller or shorter and push the list up or down. If the buttons do not
        fit (a narrow phone), the bar scrolls sideways instead.
      */}
      <div
        data-toolbar
        className="sticky top-0 z-10 -mx-4 flex h-14 flex-nowrap items-center gap-2 overflow-hidden px-4 md:-mx-6 md:px-6"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        {selecting && !isDesktop ? (
          /* Phone: the two everyday actions, plus "More" for the rest. The buttons are the same
             for any selection (unavailable ones grey out inside the menu), so nothing moves. */
          <>
            <ToolButton onClick={clearSelection} label="Clear selection">
              <CloseIcon />
            </ToolButton>
            <span className="min-w-0 flex-1 truncate text-sm">{selectedKeys.length} selected</span>
            {inBin ? (
              <>
                <ToolButton onClick={() => void restoreSelected()}>Restore</ToolButton>
                <ToolButton onClick={() => void deleteSelectedForever()} danger label="Delete forever">
                  <TrashIcon />
                </ToolButton>
              </>
            ) : (
              <>
                <ToolButton onClick={() => setMoveOpen(true)} disabled={selectedNoteIds.length === 0}>
                  Move
                </ToolButton>
                <ToolButton onClick={() => void trashSelected()} danger label="Delete">
                  <TrashIcon />
                </ToolButton>
              </>
            )}
            <ToolButton onClick={() => setMoreOpen(true)} label="More actions">
              <MoreIcon /> More
            </ToolButton>
          </>
        ) : selecting ? (
          <>
            <label className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={selectAll}
                aria-label="Select all"
                className="h-4 w-4"
                style={{ accentColor: 'var(--accent)' }}
              />
              {selectedKeys.length} selected
            </label>
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>:first-child]:ml-auto">
              <ToolButton onClick={() => void exportSelected()} label="Export selected as one Markdown file (X)">
                Export
              </ToolButton>
              <ToolButton
                onClick={() => void copySelected()}
                disabled={selectedNoteIds.length === 0}
                hint={selectedNoteIds.length === 0 ? 'Select at least one note to copy' : 'Copy selected notes as Markdown (C)'}
              >
                Copy
              </ToolButton>
              {inBin ? (
                <>
                  <ToolButton onClick={() => void restoreSelected()}>Restore</ToolButton>
                  <ToolButton onClick={() => void deleteSelectedForever()} danger>
                    <TrashIcon /> Delete forever
                  </ToolButton>
                </>
              ) : (
                <>
                  <ToolButton
                    onClick={() => void renameSelected()}
                    disabled={selectedKeys.length !== 1}
                    hint={selectedKeys.length === 1 ? 'Rename (F2)' : 'Select exactly one note or folder to rename it'}
                  >
                    Rename
                  </ToolButton>
                  <ToolButton onClick={() => setMoveOpen(true)} disabled={selectedNoteIds.length === 0}>
                    Move
                  </ToolButton>
                  <ToolButton onClick={() => setTagsOpen(true)} disabled={selectedNoteIds.length === 0}>
                    Tag
                  </ToolButton>
                  <ToolButton onClick={() => void togglePinSelected()}>
                    <PinIcon /> {everythingPinned ? 'Unpin' : 'Pin'}
                  </ToolButton>
                  <ToolButton onClick={() => void trashSelected()} danger>
                    <TrashIcon /> Delete
                  </ToolButton>
                </>
              )}
              <ToolButton onClick={clearSelection} label="Clear selection">
                <CloseIcon />
              </ToolButton>
            </div>
          </>
        ) : (
          <>
            {isDesktop && visibleKeys.size > 0 && (
              <input
                type="checkbox"
                checked={false}
                onChange={selectAll}
                aria-label="Select all"
                className="h-4 w-4"
                style={{ accentColor: 'var(--accent)' }}
              />
            )}
            {view.kind === 'folder' && !searching && (
              <ToolButton onClick={() => onNavigate({ kind: 'root' })} label="Back to notes">
                <BackIcon />
              </ToolButton>
            )}
            <h1 className="min-w-16 flex-1 truncate text-xl font-semibold">{title}</h1>
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {view.kind === 'folder' && !searching && (
                <>
                  <ToolButton onClick={() => void renameFolder()}>Rename</ToolButton>
                  <ToolButton
                    onClick={() => folder && void repo.setPinned([{ entity: 'folder', id: folder.id }], !folder.pinned)}
                  >
                    <PinIcon /> {folder?.pinned ? 'Unpin' : 'Pin'}
                  </ToolButton>
                  <ToolButton onClick={() => void trashFolder()} danger>
                    <TrashIcon /> Delete
                  </ToolButton>
                </>
              )}
              {view.kind === 'tag' && tag && !searching && (
                <>
                  <ToolButton onClick={() => void renameTag()}>Rename</ToolButton>
                  <ToolButton onClick={() => void deleteTag()} danger>
                    <TrashIcon /> Delete tag
                  </ToolButton>
                </>
              )}
              {inBin && sections.length > 0 && (
                <ToolButton onClick={() => void emptyBin()} danger>
                  <TrashIcon /> Empty bin
                </ToolButton>
              )}
              {!isDesktop && visibleKeys.size > 0 && <ToolButton onClick={() => setSelectMode((v) => !v)}>{selectMode ? 'Done' : 'Select'}</ToolButton>}
              <div className="flex shrink-0 overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }} role="group" aria-label="Layout">
                {(['list', 'grid'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onMode(m)}
                    aria-pressed={mode === m}
                    aria-label={m === 'list' ? 'List view' : 'Grid view'}
                    title={m === 'list' ? 'List view (G)' : 'Grid view (G)'}
                    className="px-3 py-2"
                    style={mode === m ? { background: 'var(--accent)', color: 'var(--bg)' } : undefined}
                  >
                    {m === 'list' ? <ListIcon /> : <GridIcon />}
                  </button>
                ))}
              </div>
              {onEditorMode && (
                <button
                  type="button"
                  onClick={() => onEditorMode(!editorMode)}
                  aria-pressed={!!editorMode}
                  aria-label="Editor mode"
                  title="Editor mode: open notes in a panel on the right (E)"
                  className="shrink-0 rounded-lg px-3 py-2"
                  style={editorMode ? { background: 'var(--accent)', color: 'var(--bg)' } : { border: '1px solid var(--border)' }}
                >
                  <SplitIcon />
                </button>
              )}
              {view.kind !== 'bin' && !searching && isDesktop && (
                <>
                  {view.kind === 'root' && (
                    <ToolButton onClick={() => void newFolder()}>
                      <PlusIcon /> Folder
                    </ToolButton>
                  )}
                  <ToolButton onClick={() => void newNote()}>
                    <PlusIcon /> Note
                  </ToolButton>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {toast && (
        <p role="status" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {toast}
        </p>
      )}

      {view.kind === 'bin' && !searching && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Items are deleted permanently {BIN_RETENTION_DAYS} days after they are moved here.
        </p>
      )}

      {sections.length === 0 ? (
        <p className="py-16 text-center" style={{ color: 'var(--muted)' }}>
          {emptyMessage}
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.id} aria-label={section.title ?? 'Notes'} className="flex flex-col gap-2">
            {section.title && (
              <h2 className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
                {section.title}
              </h2>
            )}
            <div className={container}>
              {section.items.map((item) => (
                <ItemCard
                  key={item.key}
                  item={item}
                  mode={mode}
                  selected={selection.has(item.key)}
                  showCheckbox={showCheckbox}
                  bodyToggles={bodyToggles}
                  query={query}
                  tags={data.tags}
                  active={item.kind === 'note' && item.note.id === activeNoteId}
                  onOpen={() => open(item.key)}
                  onToggle={() => toggle(item.key)}
                  onLongPress={isDesktop ? undefined : () => startSelectingWith(item.key)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {!isDesktop && view.kind !== 'bin' && !searching && !selecting && (
        <button
          type="button"
          onClick={() => void newNote()}
          aria-label="New note"
          className="fixed right-4 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
          style={{ background: 'var(--accent)', color: 'var(--bg)', bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <PlusIcon />
        </button>
      )}

      <Modal open={moreOpen && selecting} onClose={() => setMoreOpen(false)} title={`${selectedKeys.length} selected`}>
        <div className="flex flex-col gap-1.5" role="menu" aria-label="More actions">
          {(
            [
              { label: 'Export as Markdown', hint: 'One .md file', run: exportSelected, ok: true },
              {
                label: 'Copy as Markdown',
                hint: selectedNoteIds.length ? 'Copies the selected notes' : 'Select at least one note',
                run: copySelected,
                ok: selectedNoteIds.length > 0,
              },
              ...(inBin
                ? []
                : [
                    {
                      label: 'Rename',
                      hint: selectedKeys.length === 1 ? undefined : 'Select exactly one note or folder',
                      run: renameSelected,
                      ok: selectedKeys.length === 1,
                    },
                    {
                      label: 'Tag',
                      hint: selectedNoteIds.length ? undefined : 'Select at least one note',
                      run: async () => setTagsOpen(true),
                      ok: selectedNoteIds.length > 0,
                    },
                    { label: everythingPinned ? 'Unpin' : 'Pin', hint: undefined, run: togglePinSelected, ok: true },
                  ]),
              { label: allSelected ? 'Deselect all' : 'Select all', hint: undefined, run: async () => selectAll(), ok: true },
            ] as { label: string; hint?: string; run: () => Promise<void>; ok: boolean }[]
          ).map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={!action.ok}
              onClick={() => {
                setMoreOpen(false)
                void action.run()
              }}
              className="flex flex-col rounded-lg px-3 py-3 text-left text-sm disabled:opacity-40"
              style={{ border: '1px solid var(--border)' }}
            >
              {action.label}
              {action.hint && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {action.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </Modal>

      <MoveDialog
        open={moveOpen}
        folders={liveFolders(data).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))}
        count={selectedNoteIds.length}
        onPick={(id) => void moveSelected(id)}
        onNewFolder={() => void newFolderAndMove()}
        onClose={() => setMoveOpen(false)}
      />
      <TagsDialog
        open={tagsOpen}
        tags={data.tags}
        notes={selectedNotes}
        onToggle={(tagId, on) => void repo.tagNotes(selectedNoteIds, tagId, on)}
        onCreate={(name) =>
          void repo.createTag(name).then((tagId) => repo.tagNotes(selectedNoteIds, tagId, true))
        }
        onClose={() => setTagsOpen(false)}
      />
    </div>
  )
}
