import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { copyRich, copyText, inlineImages, type CopyResult } from '../lib/clipboard'
import { noteToMarkdown } from '../lib/markdown'
import { docToText } from '../lib/doc'
import { CopyIcon } from './ui/Icons'

type Format = 'formatted' | 'markdown' | 'plain'

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: 'formatted', label: 'Copy note', hint: 'keeps formatting and pictures' },
  { id: 'markdown', label: 'Copy as Markdown', hint: 'plain text with # and **bold**' },
  { id: 'plain', label: 'Copy plain text', hint: 'no formatting at all' },
]

/** Copies the whole open note in the format you choose. */
export default function CopyMenu({ editor, title }: { editor: Editor | null; title: string }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  useEffect(() => {
    if (!status) return
    const timer = setTimeout(() => setStatus(null), 2500)
    return () => clearTimeout(timer)
  }, [status])

  async function copy(format: Format) {
    setOpen(false)
    if (!editor) return
    const heading = title.trim() || 'Untitled'
    const doc = editor.getJSON()
    let result: CopyResult

    if (format === 'formatted') {
      const html = `<h1>${heading.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</h1>${await inlineImages(editor.getHTML())}`
      result = await copyRich(html, `${heading}\n\n${docToText(doc)}`)
    } else if (format === 'markdown') {
      result = await copyText(noteToMarkdown(heading, doc))
    } else {
      result = await copyText(`${heading}\n\n${docToText(doc)}`)
    }

    setStatus(
      result === 'failed'
        ? 'Could not copy. Select the text and use Ctrl+C.'
        : result === 'plain' && format === 'formatted'
          ? 'Copied as plain text (this browser cannot copy formatting).'
          : 'Copied.',
    )
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Copy note"
        title="Copy note (Ctrl+Shift+C for Markdown)"
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"
        style={{ border: '1px solid var(--border)' }}
      >
        <CopyIcon />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Copy note"
          className="absolute top-full right-0 z-30 mt-1 w-64 rounded-xl p-1.5 shadow-xl"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          {FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              role="menuitem"
              onClick={() => void copy(format.id)}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm"
            >
              {format.label}
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {format.hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {status && (
        <span
          role="status"
          className="absolute top-full right-0 z-20 mt-1 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap shadow"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {status}
        </span>
      )}
    </div>
  )
}
