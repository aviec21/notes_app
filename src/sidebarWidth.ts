import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useNumberPref } from './prefs'

export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 280
/** Width of the sidebar when it is collapsed to a strip of icons. */
export const RAIL_WIDTH = 56

export const LIST_MIN = 280
export const LIST_MAX = 900
const LIST_DEFAULT = 420

const STEP = 16

interface Options {
  /** localStorage key the width is remembered under. */
  key: string
  min: number
  max: number
  initial: number
  label: string
  /** Distance from the window's left edge to where the panel starts; the pointer's x minus this is the width. */
  origin?: () => number
}

/**
 * Width state and drag / keyboard handlers for a divider you can pull to resize the panel
 * on its left. The width is remembered on this device; double-click (or Home) resets it.
 */
function useDividerWidth({ key, min, max, initial, label, origin = () => 0 }: Options) {
  const [stored, setStored] = useNumberPref(key, initial, min, max)
  const [live, setLive] = useState<number | null>(null) // while dragging, before it is saved
  const dragging = useRef(false)
  const latest = useRef(stored)
  const width = live ?? stored

  const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)))
  const move = (next: number) => {
    latest.current = clamp(next)
    setLive(latest.current)
  }
  const save = () => {
    setStored(latest.current)
    setLive(null)
  }

  const separatorProps = {
    role: 'separator' as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': label,
    'aria-valuenow': width,
    'aria-valuemin': min,
    'aria-valuemax': max,
    tabIndex: 0,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      dragging.current = true
      latest.current = width
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragging.current) move(e.clientX - origin())
    },
    onPointerUp: () => {
      if (!dragging.current) return
      dragging.current = false
      save()
    },
    onPointerCancel: () => {
      dragging.current = false
      setLive(null)
    },
    onDoubleClick: () => {
      latest.current = initial
      save()
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      latest.current = width
      if (e.key === 'ArrowLeft') move(width - STEP)
      else if (e.key === 'ArrowRight') move(width + STEP)
      else if (e.key === 'Home') latest.current = initial
      else return
      e.preventDefault()
      save()
    },
  }

  return { width, separatorProps }
}

/** The sidebar's width. It starts at the window's left edge, so the pointer's x is the width. */
export function useSidebarWidth() {
  return useDividerWidth({
    key: 'notes.sidebarWidth',
    min: SIDEBAR_MIN,
    max: SIDEBAR_MAX,
    initial: SIDEBAR_DEFAULT,
    label: 'Resize sidebar',
  })
}

/** The notes list's width in editor mode (the open note takes the rest). */
export function useListWidth(origin: () => number) {
  return useDividerWidth({
    key: 'notes.listWidth',
    min: LIST_MIN,
    max: LIST_MAX,
    initial: LIST_DEFAULT,
    label: 'Resize note list',
    origin,
  })
}
