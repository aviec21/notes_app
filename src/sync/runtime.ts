import { NotesDB } from '../db/db'
import { uploadPendingImages } from '../images'
import { Repo } from '../db/repo'
import { SyncEngine } from './engine'
import { httpTransport } from './transport'

// The app's single on-device database, repository and sync engine.
export const db = new NotesDB()
export const repo = new Repo(db)
export const engine = new SyncEngine(db, repo, httpTransport, {
  beforePush: () => uploadPendingImages(),
})

const AFTER_EDIT_MS = 1500
const EVERY_MS = 60_000

/**
 * Keeps the device and server in step for as long as you are signed in: syncs on open,
 * shortly after each edit, whenever the connection returns or the app comes back to the
 * foreground, and once a minute otherwise. Returns a function that stops it.
 */
export function startSync(onUnauthorized: () => void): () => void {
  engine.setUnauthorizedHandler(onUnauthorized)
  const run = () => void engine.syncNow()

  let editTimer: ReturnType<typeof setTimeout> | undefined
  const stopWatchingEdits = repo.onLocalChange(() => {
    clearTimeout(editTimer)
    editTimer = setTimeout(run, AFTER_EDIT_MS)
  })
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', onVisible)
  const interval = setInterval(run, EVERY_MS)
  run()

  return () => {
    clearTimeout(editTimer)
    clearInterval(interval)
    stopWatchingEdits()
    window.removeEventListener('online', run)
    document.removeEventListener('visibilitychange', onVisible)
    engine.setUnauthorizedHandler(undefined)
  }
}
