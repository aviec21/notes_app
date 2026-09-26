import { useEditorState, type Editor } from '@tiptap/react'
import { useEffect, useRef } from 'react'
import { searchSummary, stepSearch } from '../editor/searchHighlight'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from './ui/Icons'

const NONE = { query: '', count: 0, current: -1 }

/**
 * Find inside the open note: the box starts with the word searched for in the list, and the
 * arrows (or Enter / Shift+Enter) walk through the matches, which are marked in the text.
 */
export default function FindBar({
  editor,
  query,
  onQuery,
  onClose,
  focusToken,
}: {
  editor: Editor | null
  query: string
  onQuery: (query: string) => void
  onClose: () => void
  /** Changes each time the person asks for the find bar (Ctrl+F, the button), which puts the cursor in it. */
  focusToken: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const summary =
    useEditorState({
      editor,
      selector: ({ editor: e }) => (e ? searchSummary(e) : NONE),
    }) ?? NONE

  useEffect(() => {
    if (focusToken === 0) return
    input.current?.focus()
    input.current?.select()
  }, [focusToken])

  const hasQuery = query.trim().length > 0
  const status = !hasQuery ? '' : summary.count === 0 ? 'No matches' : `${summary.current + 1} of ${summary.count}`
  const step = (direction: 1 | -1) => editor && stepSearch(editor, direction)

  return (
    <div role="search" aria-label="Find in note" className="flex items-center gap-2 pb-2">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-1.5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <SearchIcon />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              step(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault() // closes only the find bar, not the note
              onClose()
              editor?.commands.focus()
            }
          }}
          placeholder="Find in this note"
          aria-label="Find in this note"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <span role="status" aria-live="polite" className="shrink-0 text-xs whitespace-nowrap" style={{ color: 'var(--muted)' }}>
          {status}
        </span>
      </div>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={summary.count === 0}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        className="rounded-lg p-2 disabled:opacity-40"
        style={{ border: '1px solid var(--border)' }}
      >
        <ChevronUpIcon size={18} />
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={summary.count === 0}
        aria-label="Next match"
        title="Next match (Enter)"
        className="rounded-lg p-2 disabled:opacity-40"
        style={{ border: '1px solid var(--border)' }}
      >
        <ChevronDownIcon size={18} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close find"
        title="Close (Esc)"
        className="rounded-lg p-2"
        style={{ border: '1px solid var(--border)' }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
