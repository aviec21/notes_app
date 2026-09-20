/**
 * Folder colours. A folder stores the colour's name (for example "blue"), not a hex code, so
 * each theme can show the shade that reads best on its own background (see the
 * `--folder-*` variables in index.css).
 */
export const FOLDER_COLORS = [
  { id: 'red', label: 'Red' },
  { id: 'orange', label: 'Orange' },
  { id: 'amber', label: 'Amber' },
  { id: 'green', label: 'Green' },
  { id: 'teal', label: 'Teal' },
  { id: 'blue', label: 'Blue' },
  { id: 'violet', label: 'Violet' },
  { id: 'pink', label: 'Pink' },
  { id: 'gray', label: 'Gray' },
] as const

export type FolderColorId = (typeof FOLDER_COLORS)[number]['id']

export function isFolderColor(value: unknown): value is FolderColorId {
  return FOLDER_COLORS.some((c) => c.id === value)
}

/** The CSS colour for a folder's stored colour, or undefined for "no colour" / unknown values. */
export function folderColorVar(color: string | null | undefined): string | undefined {
  return isFolderColor(color) ? `var(--folder-${color})` : undefined
}

export function folderColorLabel(color: string | null | undefined): string {
  return FOLDER_COLORS.find((c) => c.id === color)?.label ?? 'No colour'
}
