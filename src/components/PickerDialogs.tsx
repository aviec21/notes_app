import { useState, type FormEvent } from 'react'
import type { FolderRecord, NoteRecord, TagRecord } from '../../shared/sync'
import { FOLDER_COLORS, folderColorVar } from '../lib/folderColors'
import { buttonStyles, Modal } from './ui/Modal'
import { FolderIcon } from './ui/Icons'

const row = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm'
const rowStyle = { border: '1px solid var(--border)' }

/** Choose a folder to move notes into. */
export function MoveDialog({
  open,
  folders,
  count,
  onPick,
  onNewFolder,
  onClose,
}: {
  open: boolean
  folders: FolderRecord[]
  count: number
  onPick: (folderId: string | null) => void
  onNewFolder: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Move ${count} ${count === 1 ? 'note' : 'notes'} to…`}>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => onPick(null)} className={row} style={rowStyle}>
          <FolderIcon /> No folder (Notes)
        </button>
        {folders.map((folder) => (
          <button key={folder.id} type="button" onClick={() => onPick(folder.id)} className={row} style={rowStyle}>
            <FolderIcon color={folderColorVar(folder.color)} /> <span className="truncate">{folder.name}</span>
          </button>
        ))}
        <button type="button" onClick={onNewFolder} className={`${row} font-medium`} style={{ ...rowStyle, borderStyle: 'dashed' }}>
          + New folder…
        </button>
      </div>
    </Modal>
  )
}

/** Choose a folder's colour (or none). Picking one applies it straight away. */
export function FolderColorDialog({
  open,
  folder,
  onPick,
  onClose,
}: {
  open: boolean
  folder: FolderRecord | undefined
  onPick: (color: string | null) => void
  onClose: () => void
}) {
  const swatch = (color: string | null, label: string) => {
    const selected = (folder?.color ?? null) === color
    return (
      <button
        key={label}
        type="button"
        onClick={() => onPick(color)}
        aria-label={label}
        aria-pressed={selected}
        title={label}
        className="flex h-11 w-11 items-center justify-center rounded-full"
        style={{
          border: '1px solid var(--border)',
          background: color ? `var(--folder-${color})` : 'transparent',
          boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : undefined,
        }}
      >
        {color === null ? (
          <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
            ∅
          </span>
        ) : null}
      </button>
    )
  }
  return (
    <Modal open={open && !!folder} onClose={onClose} title={`Colour for “${folder?.name ?? ''}”`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3" role="group" aria-label="Folder colour">
          {swatch(null, 'No colour')}
          {FOLDER_COLORS.map((c) => swatch(c.id, c.label))}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.plain}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Add or remove tags on the selected notes. A box is ticked if every selected note has the
 * tag, and dashed (mixed) if only some do.
 */
export function TagsDialog({
  open,
  tags,
  notes,
  onToggle,
  onCreate,
  onClose,
}: {
  open: boolean
  tags: TagRecord[]
  notes: NoteRecord[]
  onToggle: (tagId: string, on: boolean) => void
  onCreate: (name: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  function add(event?: FormEvent) {
    event?.preventDefault()
    if (!draft.trim()) return
    onCreate(draft.trim().replace(/^#/, ''))
    setDraft('')
  }

  return (
    <Modal open={open} onClose={onClose} title={`Tag ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}>
      <div className="flex flex-col gap-3">
        {sorted.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No tags yet. Create your first one below.
          </p>
        )}
        {sorted.map((tag) => {
          const have = notes.filter((n) => n.tagIds.includes(tag.id)).length
          const all = have === notes.length
          return (
            <label key={tag.id} className={`${row} cursor-pointer`} style={rowStyle}>
              <input
                type="checkbox"
                checked={all}
                ref={(el) => {
                  if (el) el.indeterminate = have > 0 && !all
                }}
                onChange={() => onToggle(tag.id, !all)}
                className="h-4 w-4"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="truncate">#{tag.name}</span>
            </label>
          )
        })}
        <form onSubmit={add} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => add()} // typing a tag and tapping away still adds it
            placeholder="New tag"
            aria-label="New tag name"
            maxLength={60}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          />
          <button type="submit" disabled={!draft.trim()} className={buttonStyles.base} style={buttonStyles.primary}>
            Add
          </button>
        </form>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.plain}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
