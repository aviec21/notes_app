import type { DocJson } from '../../shared/sync'

/** Plain text -> a rich-text document with one paragraph per line. */
export function textToDoc(text: string): DocJson {
  return {
    type: 'doc',
    content: text.split('\n').map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  }
}

interface DocNode {
  type?: string
  text?: string
  content?: unknown[]
  attrs?: { title?: string; labels?: string[]; alt?: string }
}

// Nodes whose children are separate lines / cells rather than inline text.
const LINE_CONTAINERS = new Set([
  'doc', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'blockquote', 'table',
  'tableCell', 'tableHeader',
])

function walk(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { type, text, content, attrs } = node as DocNode
  if (type === 'text') return text ?? ''
  if (type === 'hardBreak') return '\n'
  // Blocks with no text of their own still carry words worth finding in a search.
  if (type === 'chart') return [attrs?.title, ...(attrs?.labels ?? [])].filter(Boolean).join(' ')
  if (type === 'noteImage') return attrs?.alt ?? ''
  const children = (content ?? []).map(walk)
  if (type === 'tableRow') return children.join('\t')
  return children.join(type && LINE_CONTAINERS.has(type) ? '\n' : '')
}

/** A document's plain text (for search and previews). */
export function docToText(doc: unknown): string {
  return walk(doc)
}
