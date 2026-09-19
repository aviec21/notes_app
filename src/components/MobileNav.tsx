import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import type { LibraryData, View } from '../lib/library'
import SearchBox from './SearchBox'
import SyncStatus from './SyncStatus'
import { HelpIcon, KeyboardIcon, MenuIcon, SettingsIcon } from './ui/Icons'

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

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm">
      {icon} {label}
    </button>
  )
}

/** Phone layout header: menu, search, and quick switches to tags and the recycle bin. */
export default function MobileNav({
  data,
  view,
  query,
  searchRef,
  onNavigate,
  onQuery,
  onOpenSettings,
  onOpenShortcuts,
  onOpenGuide,
}: {
  data: LibraryData
  view: View
  query: string
  searchRef: Ref<HTMLInputElement>
  onNavigate: (view: View) => void
  onQuery: (query: string) => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  onOpenGuide: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const tags = useMemo(
    () => [...data.tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [data.tags],
  )
  const searching = query.trim().length > 0
  const at = (kind: View['kind'], id?: string) =>
    !searching && view.kind === kind && (id === undefined || ('id' in view && view.id === id))

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  const choose = (run: () => void) => () => {
    setMenuOpen(false)
    run()
  }

  return (
    <header className="flex flex-col gap-3 pt-3 pb-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xl font-semibold">Notes</span>
          <SyncStatus />
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-lg p-2.5"
            style={{ border: '1px solid var(--border)' }}
          >
            <MenuIcon />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Menu"
              className="absolute top-full right-0 z-30 mt-2 w-60 rounded-xl p-1.5 shadow-xl"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
            >
              <MenuItem icon={<SettingsIcon />} label="Settings" onClick={choose(onOpenSettings)} />
              <MenuItem icon={<HelpIcon />} label="How to use" onClick={choose(onOpenGuide)} />
              <MenuItem icon={<KeyboardIcon />} label="Keyboard shortcuts" onClick={choose(onOpenShortcuts)} />
            </div>
          )}
        </div>
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
