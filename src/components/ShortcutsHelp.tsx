import { useState } from 'react'
import { searchHelp } from '../help'
import { SHORTCUTS } from '../hotkeys'
import SearchBox from './SearchBox'
import { buttonStyles, Modal } from './ui/Modal'

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const shown = searchHelp(SHORTCUTS, query, (s) => `${s.group} ${s.keys} ${s.description}`)
  const groups = [...new Set(shown.map((s) => s.group))]

  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-lg">
      <div className="flex flex-col gap-5">
        <SearchBox value={query} onChange={setQuery} placeholder="Search shortcuts" />
        {groups.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No shortcut matches “{query.trim()}”.
          </p>
        )}
        {groups.map((group) => (
          <section key={group}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>
              {group}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
              {shown
                .filter((s) => s.group === group)
                .map((s) => (
                  <div key={s.keys + s.description} className="contents">
                    <dt>
                      <kbd className="rounded px-1.5 py-0.5 text-xs whitespace-nowrap" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                        {s.keys}
                      </kbd>
                    </dt>
                    <dd style={{ color: 'var(--muted)' }}>{s.description}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Single-key shortcuts pause while you are typing in a field.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.primary}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
