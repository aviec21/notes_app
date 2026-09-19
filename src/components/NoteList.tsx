import type { NoteRecord } from '../../shared/sync'

function formatWhen(ms: number): string {
  const date = new Date(ms)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function NoteList({
  notes,
  onOpen,
}: {
  notes: NoteRecord[]
  onOpen: (id: string) => void
}) {
  if (notes.length === 0) {
    return (
      <p className="py-16 text-center" style={{ color: 'var(--muted)' }}>
        No notes yet. Tap + to write your first one.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            onClick={() => onOpen(note.id)}
            className="block w-full rounded-xl px-4 py-3 text-left"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium">{note.title.trim() || 'Untitled'}</span>
              <span className="shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
                {formatWhen(note.updatedAt)}
              </span>
            </span>
            <span className="mt-1 line-clamp-2 block text-sm break-words" style={{ color: 'var(--muted)' }}>
              {note.contentText.trim().slice(0, 160) || 'No text'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
