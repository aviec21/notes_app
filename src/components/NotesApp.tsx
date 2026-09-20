import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useIsDesktop, useLibraryData, usePersistentChoice } from '../hooks'
import { useHotkeys } from '../hotkeys'
import type { View } from '../lib/library'
import { useSidebarWidth } from '../sidebarWidth'
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
  // List is the default on every device. The choice is remembered per device; the key is
  // versioned so an earlier, forgotten choice of grid does not override the new default.
  const [mode, setMode] = usePersistentChoice<ViewMode>('notes.viewMode.v2', 'list', ['list', 'grid'])
  const [editorModeChoice, setEditorModeChoice] = usePersistentChoice<'on' | 'off'>('notes.editorMode', 'on', ['on', 'off'])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const { width, separatorProps } = useSidebarWidth()
  const searchRef = useRef<HTMLInputElement>(null)

  // Editor mode (desktop only): the open note sits in a panel beside the list.
  const editorMode = isDesktop && editorModeChoice === 'on'
  const split = editorMode && openId !== null

  const closeEditor = useCallback(() => setOpenId(null), [])
  useEffect(() => startSync(onUnauthorized), [onUnauthorized])

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
              onOpenGuide={() => setGuideOpen(true)}
            />
          </aside>
          <div
            {...separatorProps}
            className="sticky top-0 h-screen w-1 shrink-0 cursor-col-resize transition-colors hover:[background:var(--accent)] focus:[background:var(--accent)] focus:outline-none"
          />
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
              <NoteEditor key={openId} id={openId} onClose={closeEditor} onOpenTag={openTag} />
            </Suspense>
          </ErrorBoundary>
        </main>
      ) : (
        <>
          <main
            className={split ? 'h-screen shrink-0 overflow-y-auto px-6' : 'min-w-0 flex-1 px-4 md:px-6'}
            style={split ? { width: 'clamp(300px, 38%, 520px)' } : undefined}
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
            />
          </main>
          {split && (
            <section
              aria-label="Open note"
              className="h-screen min-w-0 flex-1 overflow-y-auto px-6"
              style={{ borderLeft: '1px solid var(--border)' }}
            >
              <ErrorBoundary fallback={() => <EditorFailed onBack={closeEditor} />}>
                <Suspense fallback={editorLoading}>
                  <NoteEditor key={openId} id={openId} onClose={closeEditor} embedded onOpenTag={openTag} />
                </Suspense>
              </ErrorBoundary>
            </section>
          )}
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        defaultPin={defaultPin}
        onSignOut={onSignOut}
        onPinChanged={onPinChanged}
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <HowToUse open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
