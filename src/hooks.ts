import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, engine } from './sync/runtime'

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function useSyncSnapshot() {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot)
}

/** How many local changes have not reached the server yet. */
export function usePendingCount(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0)
}

/** Notes that are not in the bin, most recently edited first. `undefined` while loading. */
export function useNotes() {
  return useLiveQuery(() =>
    db.notes
      .orderBy('updatedAt')
      .reverse()
      .filter((note) => note.deletedAt === null)
      .toArray(),
  )
}
