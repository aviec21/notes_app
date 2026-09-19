import type { Ref } from 'react'
import { CloseIcon, SearchIcon } from './ui/Icons'

export default function SearchBox({
  value,
  onChange,
  inputRef,
  showHint = false,
  placeholder = 'Search notes',
}: {
  value: string
  onChange: (value: string) => void
  inputRef?: Ref<HTMLInputElement>
  /** Show the "/" shortcut hint (desktop). */
  showHint?: boolean
  placeholder?: string
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <SearchIcon />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Inside a dialog, a filled box is cleared first; an empty one lets Esc close the dialog.
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          } else if (e.key === 'Escape' && !e.currentTarget.closest('dialog')) {
            e.currentTarget.blur()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="rounded p-0.5">
          <CloseIcon />
        </button>
      ) : (
        showHint && (
          <kbd className="rounded px-1.5 text-xs" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
            /
          </kbd>
        )
      )}
    </div>
  )
}
