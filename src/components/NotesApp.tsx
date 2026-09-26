import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useIsDesktop, useLibraryData, usePersistentChoice } from '../hooks'
import { useHotkeys } from '../hotkeys'
import type { View } from '../lib/library'
import { LIST_MIN, RAIL_WIDTH, useListWidth, useSidebarWidth } from '../sidebarWidth'
import { startSync } from '../sync/runtime'
import { EditorFailed, ErrorBoundary } from './ErrorBoundary'
import HowToUse from './HowToUse'
import Library, { type ViewMode } from './Library'
import MobileNav from './MobileNav'
// The rich-text editor is large; it loads the first time a note is opened (and is then
// cached for offline use like the rest of the app).
const NoteEditor = lazy(() => import('./NoteEditor'))

const editorLoading = (
  <p className="py-16 text-center" style={{ color: 'var(--muted)' }}>
    Opening note…
  </p>
)
import SettingsDialog from './SettingsDialog'
import ShortcutsHelp from './ShortcutsHelp'
import Sidebar from './Sidebar'

interface Props {
  defaultPin: boolean
  /** Whether a recovery code exists (defaults to true so nothing nags when unknown). */
  hasRecovery?: boolean
  onSignOut: () => void
  onPinChanged: () => void
  onUnauthorized: () => void
}

export default function NotesApp({ defaultPin, hasRecovery = true, onSignOut, onPinChanged, onUnauthorized }: Props) {
  const data = useLibraryData()
  const isDesktop = useIsDesktop()
  const [view, setView] = useState<View>({ kind: 'root' })
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  // List is the default on every device. The choice is remembered per device; the key is
  // versioned so an earlier, forgotten choice of grid does not override the new default.
  const [mode, setMode] = usePersistentChoice<ViewMode>('notes.viewMode.v2', 'list', ['list', 'grid'])
  const [editorModeChoice, setEditorModeChoice] = usePersistentChoice<'on' | 'off'>('notes.editorMode', 'on', ['on', 'off'])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const { width, separatorProps } = useSidebarWidth()
  const [sidebarChoice, setSidebarChoice] = usePersistentChoice<'open' | 'collapsed'>('notes.sidebar', 'open', ['open', 'collapsed'])
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const { width: listWidth, separatorProps: listSeparatorProps } = useListWidth(
    () => listRef.current?.getBoundingClientRect().left ?? 0,
  )

  const sidebarCollapsed = sidebarChoice === 'collapsed'
  const sidebarWidth = sidebarCollapsed ? RAIL_WIDTH : width
  // Opening the sidebar from its search icon should leave the cursor in the search box.
  const focusSearchAfterExpand = useRef(false)
  useEffect(() => {
    if (!sidebarCollapsed && focusSearchAfterExpand.current) {
      focusSearchAfterExpand.current = false
      searchRef.current?.focus()
    }
  }, [sidebarCollapsed])
  const expandSidebar = (focusSearch = false) => {
    focusSearchAfterExpand.current = focusSearch
    setSidebarChoice('open')
  }
  const focusSearch = () => (sidebarCollapsed ? expandSidebar(true) : searchRef.current?.focus())

  // Editor mode (desktop only): the open note sits in a panel beside the list.
  const editorMode = isDesktop && editorModeChoice === 'on'
  const split = editorMode && openId !== null

  const closeEditor = useCallback(() => setOpenId(null), [])
  useEffect(() => startSync(onUnauthorized), [onUnauthorized])

  // Fetch the (large) editor in the background once the notes list is up, so the first note
  // opens at once instead of waiting for the download.
  useEffect(() => {
    if (!import.meta.env.PROD) return
    // A failed background fetch is not an error: opening a note tries again, and reports it.
    const load = () => void import('./NoteEditor').catch(() => {})
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(load, { timeout: 4000 })
      return () => window.cancelIdleCallback(id)
    }
    const timer = setTimeout(load, 1500)
    return () => clearTimeout(timer)
  }, [])

  // A full-screen editor is left through history, so Back behaves like the device's Back
  // button. The side panel simply stays open while you browse.
  const leaveEditor = () => {
    if (openId && !split) history.back()
  }
  const navigate = (next: View) => {
    setQuery('')
    setView(next)
    leaveEditor()
  }
  // Clicking a tag on a note shows every note carrying it.
  const openTag = (id: string) => navigate({ kind: 'tag', id })
  const changeQuery = (next: string) => {
    setQuery(next)
    if (next) leaveEditor()
  }

  useHotkeys(
    [
      { keys: ['/', 'mod+k'], run: focusSearch, inInput: false },
      { keys: 'mod+k', run: focusSearch, inInput: true },
      { keys: '?', run: () => setHelpOpen(true) },
      { keys: '[', run: () => setSidebarChoice(sidebarCollapsed ? 'open' : 'collapsed') },
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
  ) : !hasRecovery ? (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-3 text-sm" style={{ border: '1px solid var(--accent)' }}>
      <span>
        <strong>You have no recovery code yet.</strong> If you forget your PIN you would not be able to get back in. It takes a minute to create one.
      </span>
      <button type="button" onClick={() => setSettingsOpen(true)} className="rounded-lg px-3 py-1.5 font-medium" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
        Create recovery code
      </button>
    </div>
  ) : undefined

  return (
    <div className="flex min-h-screen">
      {isDesktop && data && (
        <>
          <aside className="sticky top-0 h-screen shrink-0" style={{ width: sidebarWidth, borderRight: '1px solid var(--border)' }}>
            <Sidebar
              data={data}
              view={view}
              query={query}
              searchRef={searchRef}
              collapsed={sidebarCollapsed}
              onExpand={expandSidebar}
              onCollapse={() => setSidebarChoice('collapsed')}
              onNavigate={navigate}
              onQuery={changeQuery}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenShortcuts={() => setHelpOpen(true)}
              onOpenGuide={() => setGuideOpen(true)}
            />
          </aside>
          {sidebarCollapsed ? (
            <div className="w-1 shrink-0" aria-hidden="true" />
          ) : (
            <div
              {...separatorProps}
              className="sticky top-0 h-screen w-1 shrink-0 cursor-col-resize transition-colors hover:[background:var(--accent)] focus:[background:var(--accent)] focus:outline-none"
            />
          )}
        </>
      )}

      {data === undefined ? (
        <main className="min-w-0 flex-1 px-4 py-16 text-center md:px-6" style={{ color: 'var(--muted)' }}>
          Loading…
        </main>
      ) : openId && !split ? (
        <main className="min-w-0 flex-1 px-4 md:px-6">
          <ErrorBoundary fallback={() => <EditorFailed onBack={closeEditor} />}>
            <Suspense fallback={editorLoading}>
              <NoteEditor key={openId} id={openId} onClose={closeEditor} onOpenTag={openTag} searchQuery={query} />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        <>
          <main
            ref={listRef}
            // Editor mode: a click on the empty part of the list (not a card, button or the
            // toolbar) puts the open note away. Leaving the editor saves it, as Close does.
            onClick={
              split
                ? (e) => {
                    const target = e.target as Element
                    if (!target.closest('button, a, input, select, textarea, label, [data-card], [data-toolbar], [role="menu"]')) {
                      closeEditor()
                    }
                  }
                : undefined
            }
            className={split ? 'h-screen shrink-0 overflow-y-auto px-6' : 'min-w-0 flex-1 px-4 md:px-6'}
            // In editor mode the list has the width you dragged it to (never so wide that the
            // note has less than ~340px left).
            style={
              split
                ? { width: listWidth, minWidth: LIST_MIN, maxWidth: `calc(100vw - ${sidebarWidth + 4}px - 340px)` }
                : undefined
            }
          >
            {!isDesktop && (
              <MobileNav
                data={data}
                view={view}
                query={query}
                searchRef={searchRef}
                onNavigate={navigate}
                onQuery={changeQuery}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenShortcuts={() => setHelpOpen(true)}
                onOpenGuide={() => setGuideOpen(true)}
              />
            )}
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
              editorMode={isDesktop ? editorMode : undefined}
              onEditorMode={isDesktop ? (on) => setEditorModeChoice(on ? 'on' : 'off') : undefined}
              activeNoteId={split ? openId : null}
              narrow={isDesktop && mode === 'list' && !split}
            />
          </main>
          {split && (
            <>
              <div
                {...listSeparatorProps}
                className="sticky top-0 h-screen w-1 shrink-0 cursor-col-resize transition-colors hover:[background:var(--accent)] focus:[background:var(--accent)] focus:outline-none"
                style={{ touchAction: 'none' }}
              />
              <section
                aria-label="Open note"
                className="h-screen min-w-0 flex-1 overflow-y-auto px-6"
                style={{ borderLeft: '1px solid var(--border)' }}
              >
                <ErrorBoundary fallback={() => <EditorFailed onBack={closeEditor} />}>
                  <Suspense fallback={editorLoading}>
                    <NoteEditor key={openId} id={openId} onClose={closeEditor} embedded onOpenTag={openTag} searchQuery={query} />
                  </Suspense>
                </ErrorBoundary>
              </section>
            </>
          )}
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        defaultPin={defaultPin}
        hasRecovery={hasRecovery}
        onSignOut={onSignOut}
        onPinChanged={onPinChanged}
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HowToUse open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
