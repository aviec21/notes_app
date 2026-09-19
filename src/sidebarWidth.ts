import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

const KEY = 'notes.sidebarWidth'
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 480
const DEFAULT = 280
const STEP = 16

function readStored(): number {
  try {
    const value = Number(localStorage.getItem(KEY))
    if (Number.isFinite(value) && value >= SIDEBAR_MIN && value <= SIDEBAR_MAX) return value
  } catch {
    // Storage unavailable: use the default width.
  }
  return DEFAULT
}

const clamp = (value: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value)))

/** Width state and drag/keyboard handlers for the resizable sidebar's divider. */
export function useSidebarWidth() {
  const [width, setWidthState] = useState(readStored)
  const dragging = useRef(false)
  const latest = useRef(width)

  const setWidth = (next: number) => {
    latest.current = clamp(next)
    setWidthState(latest.current)
  }
  const persist = () => {
    try {
      localStorage.setItem(KEY, String(latest.current))
    } catch {
      // The width still applies for this session.
    }
  }

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': 'Resize sidebar',
    'aria-valuenow': width,
    'aria-valuemin': SIDEBAR_MIN,
    'aria-valuemax': SIDEBAR_MAX,
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
    },
    // The sidebar starts at the window's left edge, so the pointer's x is the new width.
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragging.current) setWidth(e.clientX)
    },
    onPointerUp: () => {
      dragging.current = false
      persist()
    },
    onDoubleClick: () => {
      setWidth(DEFAULT)
      persist()
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowLeft') setWidth(latest.current - STEP)
      else if (e.key === 'ArrowRight') setWidth(latest.current + STEP)
      else if (e.key === 'Home') setWidth(DEFAULT)
      else return
      e.preventDefault()
      persist()
    },
  }

  return { width, separatorProps }
}
