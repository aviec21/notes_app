import { useCallback, useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const KEY = 'notes.theme'
const ORDER: Theme[] = ['system', 'light', 'dark']

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    // Storage unavailable: fall back to following the OS.
  }
  return 'system'
}

function apply(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

function darkNow(): boolean {
  const forced = document.documentElement.getAttribute('data-theme')
  if (forced === 'dark') return true
  if (forced === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Whether dark colours are showing right now (for canvas drawing, which CSS cannot reach). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(darkNow)
  useEffect(() => {
    const update = () => setDark(darkNow())
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change', update)
    // The theme choice is an attribute on <html>, so watch it as well as the OS setting.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      media?.removeEventListener('change', update)
      observer.disconnect()
    }
  }, [])
  return dark
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(stored)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    apply(next)
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Ignore: the choice still applies for this session.
    }
  }, [])

  const cycle = useCallback(() => {
    setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])
  }, [theme, setTheme])

  return { theme, setTheme, cycle }
}
