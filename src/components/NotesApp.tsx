import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsDesktop, useLibraryData, usePersistentChoice } from '../hooks'
import { useHotkeys } from '../hotkeys'
import type { View } from '../lib/library'
import { useSidebarWidth } from '../sidebarWidth'
import { startSync } from '../sync/runtime'
import Library, { type ViewMode } from './Library'
import MobileNav from './MobileNav'
import NoteEditor from './NoteEditor'
import SettingsDialog from './SettingsDialog'
import ShortcutsHelp from './ShortcutsHelp'
import Sidebar from './Sidebar'

interface Props {
  defaultPin: boolean
  onSignOut: () => void
  onPinChanged: () => void
  onUnauthorized: () => void
}

export default function NotesApp({ defaultPin, onSignOut, onPinChanged, onUnauthorized }: Props) {
  const data = useLibraryData()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<View>({ kind: 'root' })
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [mode, setMode] = usePersistentChoice<ViewMode>('notes.viewMode', 'list', ['list', 'grid'])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { width, separatorProps } = useSidebarWidth()
  const searchRef = useRef<HTMLInputElement>(null)

  const closeEditor = useCallback(() => setOpenId(null), [])
  useEffect(() => startSync(onUnauthorized), [onUnauthorized])

  // Leaving the editor goes through history so its Back-button handling saves first.
  const leaveEditor = () => {
    if (openId) history.back()
  }
  const navigate = (next: View) => {
    setQuery('')
    setView(next)
    leaveEditor()
  }
  const changeQuery = (next: string) => {
    setQuery(next)
    if (next) leaveEditor()
  }

  useHotkeys(
    [
      { keys: ['/', 'mod+k'], run: () => searchRef.current?.focus(), inInput: false },
      { keys: 'mod+k', run: () => searchRef.current?.focus(), inInput: true },
      { keys: '?', run: () => setHelpOpen(true) },
    ],
    isDesktop,
  )

  const banner = defaultPin ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ border: '1px solid var(--accent)' }}>
      <span>
        <strong>You are still using the default PIN.</strong> Anyone who finds this address could open your notes.
      </span>
      <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg px-3 py-1.5 font-medium" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
        Change PIN
      </button>
    </div>
  ) : undefined

  return (
    <div className="flex min-h-screen">
      {isDesktop && data && (
        <>
          <aside className="sticky top-0 h-screen shrink-0" style={{ width, borderRight: '1px solid var(--border)' }}>
            <Sidebar
              data={data}
              view={view}
              query={query}
              searchRef={searchRef}
              onNavigate={navigate}
              onQuery={changeQuery}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenShortcuts={() => setHelpOpen(true)}
            />
          </aside>
          <div
            {...separatorProps}
            className="sticky top-0 h-screen w-1 shrink-0 cursor-col-resize transition-colors hover:[background:var(--accent)] focus:[background:var(--accent)] focus:outline-none"
          />
        </>
      )}

      <main className="min-w-0 flex-1 px-4 md:px-6">
        {!isDesktop && !openId && data && (
          <MobileNav
            data={data}
            view={view}
            query={query}
            searchRef={searchRef}
            onNavigate={navigate}
            onQuery={changeQuery}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
        {data === undefined ? (
          <p className="py-16 text-center" style={{ color: 'var(--muted)' }}>
            Loading…
          </p>
        ) : openId ? (
          <NoteEditor id={openId} onClose={closeEditor} />
        ) : (
          <Library
            data={data}
            view={view}
            query={query}
            mode={mode}
            onMode={setMode}
            isDesktop={isDesktop}
            banner={banner}
            onNavigate={navigate}
            onClearQuery={() => setQuery('')}
            onOpenNote={setOpenId}
          />
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        defaultPin={defaultPin}
        onSignOut={onSignOut}
        onPinChanged={onPinChanged}
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
