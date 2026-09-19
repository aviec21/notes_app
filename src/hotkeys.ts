import { useEffect, useRef } from 'react'

export interface Hotkey {
  /** e.g. 'n', 'shift+n', 'mod+a' (mod = Ctrl, or Cmd on Mac), 'escape', '?'. */
  keys: string | string[]
  run: (event: KeyboardEvent) => void
  /** Also fire while typing in a text field (for combos like Ctrl+S). Default: no. */
  inInput?: boolean
  /** Extra condition; when it returns false the key is left alone (keeps its normal action). */
  when?: (event: KeyboardEvent) => boolean
}

function matches(spec: string, e: KeyboardEvent): boolean {
  const parts = spec.toLowerCase().split('+')
  const key = parts.pop()!
  if (parts.includes('mod') !== (e.ctrlKey || e.metaKey)) return false
  if (parts.includes('alt') !== e.altKey) return false
  if (e.key.toLowerCase() !== key) return false
  // Shift only distinguishes letters (n vs N); symbols like "?" already imply it.
  return /^[a-z]$/.test(key) ? parts.includes('shift') === e.shiftKey : true
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit'].includes(target.type)
  return false
}

/**
 * Keyboard shortcuts for the desktop. Single-key shortcuts are ignored while you type in a
 * field, and all shortcuts pause while a dialog is open.
 */
export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  const latest = useRef(hotkeys)
  useEffect(() => {
    latest.current = hotkeys
  })

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return
      if (document.querySelector('dialog[open]')) return
      const typing = isTyping(e.target)
      for (const hotkey of latest.current) {
        if (typing && !hotkey.inInput) continue
        if (hotkey.when && !hotkey.when(e)) continue
        const specs = Array.isArray(hotkey.keys) ? hotkey.keys : [hotkey.keys]
        if (specs.some((spec) => matches(spec, e))) {
          e.preventDefault()
          hotkey.run(e)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** Shown in the shortcuts help dialog. */
export const SHORTCUTS: { group: string; keys: string; description: string }[] = [
  { group: 'Anywhere', keys: '/  or  Ctrl+K', description: 'Search' },
  { group: 'Anywhere', keys: '?', description: 'Show this list' },
  { group: 'Notes list', keys: 'N', description: 'New note' },
  { group: 'Notes list', keys: 'Shift+N', description: 'New folder' },
  { group: 'Notes list', keys: 'G', description: 'Switch list / grid view' },
  { group: 'Notes list', keys: 'Ctrl+A', description: 'Select all' },
  { group: 'Notes list', keys: 'Enter', description: 'Open the selected note or folder' },
  { group: 'Notes list', keys: 'P', description: 'Pin / unpin selected' },
  { group: 'Notes list', keys: 'M', description: 'Move selected notes to a folder' },
  { group: 'Notes list', keys: 'T', description: 'Tag selected notes' },
  { group: 'Notes list', keys: 'Delete', description: 'Move selected to the bin' },
  { group: 'Notes list', keys: 'Esc', description: 'Clear selection, then search, then go back' },
  { group: 'Recycle bin', keys: 'R', description: 'Restore selected' },
  { group: 'Recycle bin', keys: 'Delete', description: 'Delete selected forever' },
  { group: 'Editing a note', keys: 'Ctrl+S', description: 'Save now' },
  { group: 'Editing a note', keys: 'Esc', description: 'Save and go back' },
  { group: 'Ctrl+click', keys: 'Ctrl+click', description: 'Add or remove an item from the selection' },
]
