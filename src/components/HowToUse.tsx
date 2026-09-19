import { useState } from 'react'
import { HELP_TOPICS, searchHelp } from '../help'
import SearchBox from './SearchBox'
import { buttonStyles, Modal } from './ui/Modal'

/** The searchable user guide. */
export default function HowToUse({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const shown = searchHelp(HELP_TOPICS, query, (t) => `${t.section} ${t.title} ${t.body} ${t.keywords ?? ''}`)
  const sections = [...new Set(shown.map((t) => t.section))]
  const searching = query.trim().length > 0

  return (
    <Modal open={open} onClose={onClose} title="How to use" width="max-w-xl">
      <div className="flex flex-col gap-4">
        <SearchBox value={query} onChange={setQuery} placeholder="Search help, e.g. “restore” or “bold”" />
        {sections.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nothing in the guide matches “{query.trim()}”. Try another word, such as “folder”, “tag” or “offline”.
          </p>
        )}
        {sections.map((section) => (
          <section key={section} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
              {section}
            </h3>
            {shown
              .filter((t) => t.section === section)
              .map((topic) => (
                // Search results open by default; the full guide starts collapsed.
                <details
                  key={`${topic.id}-${searching}`}
                  open={searching}
                  className="rounded-lg px-3 py-2"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <summary className="cursor-pointer text-sm font-medium">{topic.title}</summary>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                    {topic.body}
                  </p>
                </details>
              ))}
          </section>
        ))}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.primary}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
