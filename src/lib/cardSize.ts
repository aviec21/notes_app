/**
 * How big the note and folder cards are. "Average" is the original look; small fits more on
 * screen, big shows more of each note. Every card in a layout still has the same size.
 * (Class names are written out in full so Tailwind can find them.)
 */
export const CARD_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'average', label: 'Average' },
  { id: 'big', label: 'Big' },
] as const

export type CardSize = (typeof CARD_SIZES)[number]['id']

export const CARD_SIZE_IDS = CARD_SIZES.map((s) => s.id)

export const CARD_SIZE_KEY = 'notes.cardSize'

interface Look {
  /** Card height. */
  height: string
  /** Lines of the note's text to preview (0 = none). */
  lines: 0 | 1 | 2 | 4
  /** Reserved preview height, so short notes leave the same room as long ones. */
  previewBox: string
}

export const LIST_LOOK: Record<CardSize, Look> = {
  small: { height: 'h-12', lines: 0, previewBox: '' },
  average: { height: 'h-[4.5rem]', lines: 1, previewBox: '' },
  big: { height: 'h-28', lines: 2, previewBox: 'min-h-10' },
}

export const GRID_LOOK: Record<CardSize, Look> = {
  small: { height: 'h-28', lines: 1, previewBox: 'min-h-5' },
  average: { height: 'h-36', lines: 2, previewBox: 'min-h-10' },
  big: { height: 'h-52', lines: 4, previewBox: 'min-h-20' },
}

export const LINE_CLAMP: Record<Look['lines'], string> = { 0: '', 1: 'line-clamp-1', 2: 'line-clamp-2', 4: 'line-clamp-4' }

/** Grid column minimum widths: cards share each row equally. */
export const GRID_COLUMNS: Record<CardSize, string> = {
  small: 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]',
  average: 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]',
  big: 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]',
}

/** How many characters of a note's text are worth cutting for the preview. */
export const PREVIEW_CHARS: Record<CardSize, number> = { small: 60, average: 160, big: 320 }
