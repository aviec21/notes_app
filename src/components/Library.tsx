import { useMemo, useState, type ReactNode } from 'react'
import { BIN_RETENTION_DAYS } from '../../shared/sync'
import type { ItemRef } from '../db/repo'
import { useHotkeys } from '../hotkeys'
import { liveFolders, parseKey, sectionsFor, type LibraryData, type View } from '../lib/library'
import { repo } from '../sync/runtime'
import ItemCard from './ItemCard'
import { MoveDialog, TagsDialog } from './PickerDialogs'
import { useDialogs } from './ui/Dialogs'
import { BackIcon, CloseIcon, GridIcon, ListIcon, PinIcon, PlusIcon, TrashIcon } from './ui/Icons'

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
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ToolButton({
  onClick,
  disabled,
  danger,
  children,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm disabled:opacity-40"
      style={{ border: '1px solid var(--border)', color: danger ? 'var(--danger)' : undefined }}
    >
      {children}
    </button>
  )
}

/** The main pane: a toolbar plus the notes and folders of the current view. */
export default function Library({ data, view, query, mode, onMode, isDesktop, banner, onNavigate, onClearQuery, onOpenNote }: Props) {
  const dialogs = useDialogs()
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)

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

  async function renameFolder() {
    if (!folder) return
    const name = await dialogs.prompt({ title: 'Rename folder', label: 'Folder name', initial: folder.name })
    if (name) await repo.renameFolder(folder.id, name)
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

  return (
    <div className="flex flex-col gap-4 pb-28">
      {banner}

      <div
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 px-4 py-3 md:-mx-6 md:px-6"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
      >
        {selecting ? (
          <>
            <label className="flex items-center gap-2 text-sm">
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
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              {inBin ? (
                <>
                  <ToolButton onClick={() => void restoreSelected()}>Restore</ToolButton>
                  <ToolButton onClick={() => void deleteSelectedForever()} danger>
                    <TrashIcon /> Delete forever
                  </ToolButton>
                </>
              ) : (
                <>
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
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">
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
              {inBin && sections.length > 0 && (
                <ToolButton onClick={() => void emptyBin()} danger>
                  <TrashIcon /> Empty bin
                </ToolButton>
              )}
              {!isDesktop && visibleKeys.size > 0 && <ToolButton onClick={() => setSelectMode((v) => !v)}>{selectMode ? 'Done' : 'Select'}</ToolButton>}
              <div className="flex overflow-hidden rounded-lg" style={{ border: '1px solid var(--border)' }} role="group" aria-label="Layout">
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
                  onOpen={() => open(item.key)}
                  onToggle={() => toggle(item.key)}
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
