import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuEntry {
  label: string
  onSelect: () => void
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  /** A short explanation shown under the label (e.g. why it is greyed out). */
  hint?: string
  /** Turns the entry into a choice: ticked when true, unticked when false. */
  checked?: boolean
  /** Draws a divider above this entry. */
  separatorBefore?: boolean
}

const GAP = 6
const MARGIN = 8

/**
 * A small menu opened from a button. It sits beside `anchor` (flipping upwards or to the
 * side when there is no room), moves with the arrow keys, and closes on Escape, a click
 * elsewhere, scrolling or resizing. Focus returns to what had it before.
 */
export function PopoverMenu({
  anchor,
  entries,
  label,
  onClose,
}: {
  anchor: DOMRect
  entries: MenuEntry[]
  label: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const isChoice = entries.some((e) => e.checked !== undefined)

  useLayoutEffect(() => {
    const menu = ref.current
    if (!menu) return
    const { width, height } = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const below = anchor.bottom + GAP
    const top = below + height + MARGIN <= vh ? below : Math.max(MARGIN, anchor.top - GAP - height)
    // Right edges line up, so the menu opens towards the middle of the screen.
    const left = Math.min(Math.max(MARGIN, anchor.right - width), Math.max(MARGIN, vw - width - MARGIN))
    setPlace({ top, left })
  }, [anchor])

  // Focus the first entry once the menu is in place, and give focus back when it goes away.
  const [before] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  useEffect(() => {
    if (place) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
  }, [place])
  useEffect(
    () => () => {
      if (before && document.contains(before)) before.focus({ preventScroll: true })
    },
    [before],
  )

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (e.key === 'ArrowDown') next = (at + 1) % items.length
    else if (e.key === 'ArrowUp') next = (at - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next !== null) {
      e.preventDefault()
      items[next]?.focus()
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault() // so the page's own Escape shortcuts stay out of it
      e.stopPropagation()
      onClose()
    }
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="fixed z-50 flex min-w-48 max-w-72 flex-col rounded-xl p-1.5 shadow-xl"
      style={{
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        visibility: place ? 'visible' : 'hidden', // measured first, then shown in the right spot
        background: 'var(--bg)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
      }}
    >
      {entries.map((entry) => (
        <div key={entry.label} className="contents">
          {entry.separatorBefore && <div role="separator" className="my-1 h-px" style={{ background: 'var(--border)' }} />}
          <button
            type="button"
            role={isChoice ? 'menuitemradio' : 'menuitem'}
            aria-checked={isChoice ? !!entry.checked : undefined}
            disabled={entry.disabled}
            onClick={() => {
              onClose()
              entry.onSelect()
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 disabled:opacity-40"
            style={{
              color: entry.danger ? 'var(--danger)' : undefined,
              background: entry.checked ? 'var(--surface)' : undefined,
            }}
          >
            {entry.icon}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{entry.label}</span>
              {entry.hint && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {entry.hint}
                </span>
              )}
            </span>
            {entry.checked && (
              <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                ✓
              </span>
            )}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
