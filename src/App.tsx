import { useAuth } from './auth'
import LoginScreen from './components/LoginScreen'
import NotesApp from './components/NotesApp'
import { DialogProvider } from './components/ui/Dialogs'

export default function App() {
  const { state, signOut, refresh } = useAuth()

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ color: 'var(--muted)' }}>
        Loading…
      </main>
    )
  }
  if (state.status === 'signedOut') return <LoginScreen onSignedIn={refresh} />
  return (
    <DialogProvider>
      <NotesApp
        defaultPin={state.defaultPin}
        onSignOut={signOut}
        onPinChanged={refresh}
        onUnauthorized={refresh}
      />
    </DialogProvider>
  )
}
