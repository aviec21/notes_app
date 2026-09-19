import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { LibraryData } from './lib/library'
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

/** Every note, folder and tag on this device (including binned ones). `undefined` while loading. */
export function useLibraryData(): LibraryData | undefined {
  const notes = useLiveQuery(() => db.notes.toArray())
  const folders = useLiveQuery(() => db.folders.toArray())
  const tags = useLiveQuery(() => db.tags.toArray())
  return useMemo(() => (notes && folders && tags ? { notes, folders, tags } : undefined), [notes, folders, tags])
}

const DESKTOP_QUERY = '(min-width: 768px)'

/** True on wide screens, where the sidebar, checkboxes and shortcuts apply. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(DESKTOP_QUERY)
      media.addEventListener('change', notify)
      return () => media.removeEventListener('change', notify)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
  )
}

/** A choice that is remembered on this device (like list vs grid). */
export function usePersistentChoice<T extends string>(
  key: string,
  initial: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null
      if (stored && allowed.includes(stored)) return stored
    } catch {
      // Storage unavailable: use the default.
    }
    return initial
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // The choice still applies for this session.
      }
    },
    [key],
  )
  return [value, set]
}
