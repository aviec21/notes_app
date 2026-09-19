import { useCallback, useState } from 'react'

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
