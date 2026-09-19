import { useMemo, type Ref } from 'react'
import type { LibraryData, View } from '../lib/library'
import SearchBox from './SearchBox'
import SyncStatus from './SyncStatus'
import { SettingsIcon } from './ui/Icons'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="shrink-0 rounded-full px-3 py-1.5 text-sm"
      style={
        active
          ? { background: 'var(--accent)', color: 'var(--bg)', border: '1px solid var(--accent)' }
          : { border: '1px solid var(--border)' }
      }
    >
      {children}
    </button>
  )
}

/** Phone layout header: search, and quick switches to tags and the recycle bin. */
export default function MobileNav({
  data,
  view,
  query,
  searchRef,
  onNavigate,
  onQuery,
  onOpenSettings,
}: {
  data: LibraryData
  view: View
  query: string
  searchRef: Ref<HTMLInputElement>
  onNavigate: (view: View) => void
  onQuery: (query: string) => void
  onOpenSettings: () => void
}) {
  const tags = useMemo(
    () => [...data.tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [data.tags],
  )
  const searching = query.trim().length > 0
  const at = (kind: View['kind'], id?: string) =>
    !searching && view.kind === kind && (id === undefined || ('id' in view && view.id === id))

  return (
    <header className="flex flex-col gap-3 pt-3 pb-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xl font-semibold">Notes</span>
          <SyncStatus />
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="rounded-lg p-2.5"
          style={{ border: '1px solid var(--border)' }}
        >
          <SettingsIcon />
        </button>
      </div>
      <SearchBox value={query} onChange={onQuery} inputRef={searchRef} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Browse">
        <Chip active={at('root') || at('folder')} onClick={() => onNavigate({ kind: 'root' })}>
          Notes
        </Chip>
        {tags.map((tag) => (
          <Chip key={tag.id} active={at('tag', tag.id)} onClick={() => onNavigate({ kind: 'tag', id: tag.id })}>
            {`#${tag.name}`}
          </Chip>
        ))}
        <Chip active={at('bin')} onClick={() => onNavigate({ kind: 'bin' })}>
          Recycle bin
        </Chip>
      </div>
    </header>
  )
}
