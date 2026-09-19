import { useEffect, useMemo, useState } from 'react'
import SearchBox from '../components/SearchBox'

import type { CompactEmoji } from './emojiData'

const GROUPS: { id: number; name: string }[] = [
  { id: 0, name: 'Smileys' },
  { id: 1, name: 'People' },
  { id: 3, name: 'Animals' },
  { id: 4, name: 'Food' },
  { id: 5, name: 'Travel' },
  { id: 6, name: 'Activities' },
  { id: 7, name: 'Objects' },
  { id: 8, name: 'Symbols' },
  { id: 9, name: 'Flags' },
]

const RECENT_KEY = 'notes.recentEmoji'
const RECENT_MAX = 24

function readRecent(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(value) ? (value.filter((v) => typeof v === 'string') as string[]) : []
  } catch {
    return []
  }
}

function rememberRecent(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Recents are a convenience only.
  }
}

/**
 * Emoji chooser. The emoji list ships with the app (about 100 KB compressed) and loads the
 * first time the picker is opened, so it also works offline.
 */
export default function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [all, setAll] = useState<CompactEmoji[] | null>(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(GROUPS[0].id)
  const [recent, setRecent] = useState(readRecent)

  useEffect(() => {
    let cancelled = false
    void import('./emojiData')
      .then(({ EMOJI }) => {
        if (!cancelled) setAll(EMOJI)
      })
      .catch(() => {
        if (!cancelled) setAll([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const shown = useMemo(() => {
    if (!all) return []
    const q = query.trim().toLowerCase()
    if (!q) {
      return all.filter((e) => e.group === group).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }
    return all
      .filter((e) => e.label.toLowerCase().includes(q) || e.tags?.some((tag) => tag.includes(q)))
      .slice(0, 120)
  }, [all, query, group])

  function pick(emoji: string) {
    rememberRecent(emoji)
    setRecent(readRecent())
    onPick(emoji)
  }

  const emojiButton = (emoji: string, label: string) => (
    <button
      key={emoji + label}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(emoji)}
      title={label}
      aria-label={label}
      className="h-8 w-8 rounded text-xl leading-none"
    >
      {emoji}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <SearchBox value={query} onChange={setQuery} placeholder="Search emoji" />

      {!query && recent.length > 0 && (
        <>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Recent
          </span>
          <div className="flex flex-wrap gap-0.5">{recent.map((emoji) => emojiButton(emoji, emoji))}</div>
        </>
      )}

      {!query && (
        <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Emoji groups">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={group === g.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setGroup(g.id)}
              className="shrink-0 rounded-full px-2.5 py-1 text-xs"
              style={group === g.id ? { background: 'var(--accent)', color: 'var(--bg)' } : { border: '1px solid var(--border)' }}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
        {all === null && (
          <span className="col-span-8 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Loading emoji…
          </span>
        )}
        {all !== null && shown.length === 0 && (
          <span className="col-span-8 py-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            No emoji matches “{query.trim()}”.
          </span>
        )}
        {shown.map((e) => emojiButton(e.unicode, e.label))}
      </div>
    </div>
  )
}
