import type { MouseEvent } from 'react'
import type { TagRecord } from '../../shared/sync'
import { snippetAround, type Item } from '../lib/library'
import { FolderIcon, PinIcon } from './ui/Icons'

function formatWhen(ms: number): string {
  const date = new Date(ms)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Props {
  item: Item
  mode: 'list' | 'grid'
  selected: boolean
  /** Whether the checkbox is shown (always on desktop; only while selecting on mobile). */
  showCheckbox: boolean
  /** Tapping the body picks the item instead of opening it (mobile selection mode, bin). */
  bodyToggles: boolean
  query: string
  tags: TagRecord[]
  onOpen: () => void
  onToggle: () => void
}

/** One note or folder, as a row (list mode) or a card (grid mode). */
export default function ItemCard({ item, mode, selected, showCheckbox, bodyToggles, query, tags, onOpen, onToggle }: Props) {
  const isNote = item.kind === 'note'
  const title = isNote ? item.note.title.trim() || 'Untitled' : item.folder.name
  const pinned = isNote ? item.note.pinned : item.folder.pinned
  const chips = isNote ? tags.filter((t) => item.note.tagIds.includes(t.id)) : []

  const detail = isNote
    ? query.trim()
      ? snippetAround(item.note.contentText, query)
      : item.note.contentText.trim().slice(0, 200) || 'No text'
    : plural(item.noteCount, 'note')
  const when = isNote ? item.note.updatedAt : item.folder.updatedAt
  const meta = item.daysLeft !== undefined ? `${plural(item.daysLeft, 'day')} left` : formatWhen(when)

  function onBodyClick(event: MouseEvent) {
    // Ctrl/Cmd/Shift-click always picks (desktop convention), otherwise open or pick.
    if (event.ctrlKey || event.metaKey || event.shiftKey || bodyToggles) onToggle()
    else onOpen()
  }

  const grid = mode === 'grid'
  return (
    <div
      className={`relative rounded-xl ${grid ? 'h-full' : ''}`}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 1px var(--accent)' : undefined,
      }}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${title}`}
          className="absolute top-3.5 left-3 z-10 h-4 w-4 cursor-pointer"
          style={{ accentColor: 'var(--accent)' }}
        />
      )}
      <button
        type="button"
        onClick={onBodyClick}
        onDoubleClick={(e) => e.preventDefault()}
        className={`block h-full w-full rounded-xl py-3 pr-3 text-left select-none ${showCheckbox ? 'pl-10' : 'pl-3'}`}
      >
        <span className="flex items-center gap-2">
          {!isNote && <FolderIcon />}
          <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
          {pinned && (
            <span aria-label="Pinned" style={{ color: 'var(--accent)' }}>
              <PinIcon />
            </span>
          )}
          {!grid && (
            <span className="shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
              {meta}
            </span>
          )}
        </span>
        <span
          className={`mt-1 block text-sm break-words ${grid ? 'line-clamp-5' : 'line-clamp-1'}`}
          style={{ color: 'var(--muted)' }}
        >
          {detail}
        </span>
        {(chips.length > 0 || grid) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
              >
                #{tag.name}
              </span>
            ))}
            {chips.length > 3 && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                +{chips.length - 3}
              </span>
            )}
            {grid && (
              <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
                {meta}
              </span>
            )}
          </span>
        )}
      </button>
    </div>
  )
}
