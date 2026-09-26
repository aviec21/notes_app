/**
 * How wide the text column is when a note fills the window (computer only). In the side
 * panel (editor mode) the panel's own width, set by dragging the divider, applies instead.
 */
export const NOTE_WIDTHS = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'medium', label: 'Medium' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full width' },
] as const

export type NoteWidth = (typeof NOTE_WIDTHS)[number]['id']

export const NOTE_WIDTH_IDS = NOTE_WIDTHS.map((w) => w.id)

export const NOTE_WIDTH_KEY = 'notes.noteWidth'

// Written out in full so Tailwind can find them.
export const NOTE_WIDTH_CLASS: Record<NoteWidth, string> = {
  narrow: 'max-w-xl',
  medium: 'max-w-3xl',
  wide: 'max-w-6xl',
  full: 'max-w-none',
}
