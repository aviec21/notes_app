import { useCallback, useSyncExternalStore } from 'react'

/**
 * Small per-device preferences (card size, collapsed panels, ...) kept in localStorage.
 * Every component reading the same key sees a change at once, and so do other tabs.
 */
const listeners = new Set<() => void>()
const memory = new Map<string, string>() // used when storage is unavailable (private mode)

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

function write(key: string, value: string) {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // The choice still applies for this session.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.storageArea === localStorage) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** A remembered choice from a fixed set of values. */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key))
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : initial
  const set = useCallback((next: T) => write(key, next), [key])
  return [value, set]
}

/** A remembered number, kept inside [min, max]. */
export function useNumberPref(key: string, initial: number, min: number, max: number): [number, (value: number) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(key))
  const parsed = raw === null ? NaN : Number(raw)
  const value = Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : initial
  const set = useCallback((next: number) => write(key, String(Math.round(next))), [key])
  return [value, set]
}
