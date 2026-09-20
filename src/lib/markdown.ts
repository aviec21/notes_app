import type { DocJson } from '../../shared/sync'

interface Mark {
  type: string
  attrs?: Record<string, unknown>
}

interface Node {
  type?: string
  text?: string
  marks?: Mark[]
  attrs?: Record<string, unknown>
  content?: Node[]
}

const escapeText = (text: string) => text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1')

export interface MarkdownOptions {
  /** Pushes every heading in the note this many levels down (capped at level 6). */
  headingOffset?: number
  /**
   * Where a picture's source comes from. Return null when the picture is unavailable.
   * Without this, pictures point at an `images/<id>.webp` file beside the Markdown.
   */
  imageSrc?: (imageId: string) => string | null
}

// The converter is synchronous, so its options can safely be held here while it runs.
let options: MarkdownOptions = {}

function withMarks(text: string, marks: Mark[] = []): string {
  let out = text
  for (const mark of marks) {
    if (mark.type === 'bold') out = `**${out}**`
    else if (mark.type === 'italic') out = `*${out}*`
    else if (mark.type === 'strike') out = `~~${out}~~`
    else if (mark.type === 'code') out = `\`${out}\``
    // Markdown has no underline, subscript, superscript, colour or font: keep them as HTML.
    else if (mark.type === 'underline') out = `<u>${out}</u>`
    else if (mark.type === 'subscript') out = `<sub>${out}</sub>`
    else if (mark.type === 'superscript') out = `<sup>${out}</sup>`
    else if (mark.type === 'highlight') out = `==${out}==`
    else if (mark.type === 'link') out = `[${out}](${String(mark.attrs?.href ?? '')})`
  }
  return out
}

function inline(nodes: Node[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return withMarks(escapeText(node.text ?? ''), node.marks)
      if (node.type === 'hardBreak') return '  \n'
      return block(node, '').trim()
    })
    .join('')
}

function tableRow(row: Node): string[] {
  return (row.content ?? []).map((cell) => inline(cell.content?.flatMap((p) => p.content ?? []) ?? []).replace(/\|/g, '\\|'))
}

function table(node: Node): string {
  const rows = (node.content ?? []).map(tableRow)
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (cells: string[]) => [...cells, ...Array(width - cells.length).fill('')]
  const [head, ...body] = rows
  return [
    `| ${pad(head).join(' | ')} |`,
    `| ${Array(width).fill('---').join(' | ')} |`,
    ...body.map((r) => `| ${pad(r).join(' | ')} |`),
  ].join('\n')
}

/** A chart becomes its title plus a Markdown table of the same numbers. */
function chart(node: Node): string {
  const { title, labels = [], series = [] } = node.attrs as {
    title?: string
    labels?: string[]
    series?: { name: string; values: number[] }[]
  }
  const header = ['', ...series.map((s) => s.name)]
  const rows = labels.map((label, i) => [label, ...series.map((s) => String(s.values[i] ?? ''))])
  const lines = [
    `**${title || 'Chart'}** (${String(node.attrs?.chartType ?? 'bar')} chart)`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ]
  return lines.join('\n')
}

function listItems(node: Node, indent: string, bullet: (index: number) => string): string {
  return (node.content ?? [])
    .map((item, index) => {
      const marker = bullet(index)
      const tick = node.type === 'taskList' ? (item.attrs?.checked ? '[x] ' : '[ ] ') : ''
      const inner = (item.content ?? []).map((child) => block(child, `${indent}  `)).join('\n\n')
      // Continuation lines line up under the marker.
      const body = inner.split('\n').join(`\n${indent}  `)
      return `${indent}${marker}${tick}${body}`
    })
    .join('\n')
}

function block(node: Node, indent: string): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((child) => block(child, indent)).filter(Boolean).join('\n\n')
    case 'paragraph':
      return inline(node.content)
    case 'heading':
      return `${'#'.repeat(Math.min(6, Number(node.attrs?.level ?? 1) + (options.headingOffset ?? 0)))} ${inline(node.content)}`
    case 'bulletList':
      return listItems(node, indent, () => '- ')
    case 'orderedList':
      return listItems(node, indent, (i) => `${Number(node.attrs?.start ?? 1) + i}. `)
    case 'taskList':
      return listItems(node, indent, () => '- ')
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => block(child, indent))
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'codeBlock':
      return `\`\`\`${String(node.attrs?.language ?? '')}\n${(node.content ?? []).map((c) => c.text ?? '').join('')}\n\`\`\``
    case 'horizontalRule':
      return '---'
    case 'table':
      return table(node)
    case 'chart':
      return chart(node)
    case 'noteImage': {
      const id = String(node.attrs?.imageId ?? '')
      const alt = String(node.attrs?.alt ?? '') || 'Picture'
      if (!options.imageSrc) return `![${alt}](images/${id}.webp)`
      const src = options.imageSrc(id)
      return src ? `![${alt}](${src})` : `*[Picture “${alt}” could not be included]*`
    }
    case 'text':
      return inline([node])
    default:
      return (node.content ?? []).map((child) => block(child, indent)).filter(Boolean).join('\n\n')
  }
}

/** Converts a note's rich-text document to Markdown. */
export function docToMarkdown(doc: DocJson | unknown, opts: MarkdownOptions = {}): string {
  options = opts
  try {
    return block(doc as Node, '').trim()
  } finally {
    options = {}
  }
}

export interface ExportNote {
  title: string
  content: unknown
  updatedAt: number
  tags: string[]
  /** The note's folder, shown when the note is exported on its own. */
  folderName?: string
}

export interface ExportGroup {
  name: string
  notes: ExportNote[]
}

const oneLine = (text: string, fallback: string) => text.replace(/\s+/g, ' ').trim() || fallback
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function noteSection(note: ExportNote, level: number, opts: MarkdownOptions): string {
  const details = [`Updated ${day(note.updatedAt)}`]
  if (note.folderName) details.push(`Folder: ${note.folderName}`)
  if (note.tags.length) details.push(`Tags: ${note.tags.map((t) => `#${t.replace(/\s+/g, '-')}`).join(' ')}`)

  const body = docToMarkdown(note.content, { ...opts, headingOffset: level })
  return [
    `${'#'.repeat(Math.min(6, level))} ${oneLine(note.title, 'Untitled')}`,
    `*${details.join(' · ')}*`,
    body,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Builds one Markdown document from chosen folders and notes, with a heading hierarchy
 * that follows how they are arranged:
 *
 *   one note        # Note title            (its own headings become ##, ###, …)
 *   one folder      # Folder  →  ## Note    (note headings become ###, …)
 *   several items   # Notes export  →  ## Folder  →  ### Note   (or ## Note if not in a folder)
 *
 * so the outline of the result always reads correctly in any Markdown viewer.
 */
export function selectionToMarkdown(
  input: { groups: ExportGroup[]; loose: ExportNote[]; exportedOn: Date },
  opts: MarkdownOptions = {},
): string {
  const { groups, loose } = input

  if (groups.length === 0 && loose.length === 1) return `${noteSection(loose[0], 1, opts)}\n`

  if (groups.length === 1 && loose.length === 0) {
    const [group] = groups
    const sections = group.notes.map((n) => noteSection({ ...n, folderName: undefined }, 2, opts))
    return `${[`# ${oneLine(group.name, 'Folder')}`, ...(sections.length ? sections : ['*This folder has no notes.*'])].join('\n\n')}\n`
  }

  const count = groups.reduce((sum, g) => sum + g.notes.length, 0) + loose.length
  const outline = [
    ...groups.flatMap((g) => [`- ${oneLine(g.name, 'Folder')}`, ...g.notes.map((n) => `  - ${oneLine(n.title, 'Untitled')}`)]),
    ...loose.map((n) => `- ${oneLine(n.title, 'Untitled')}`),
  ].join('\n')

  const parts = [
    '# Notes export',
    `*Exported ${day(input.exportedOn.getTime())} · ${count} ${count === 1 ? 'note' : 'notes'}*`,
    '## Contents',
    outline,
  ]
  for (const group of groups) {
    parts.push(`## ${oneLine(group.name, 'Folder')}`)
    if (group.notes.length === 0) parts.push('*This folder has no notes.*')
    for (const note of group.notes) parts.push(noteSection({ ...note, folderName: undefined }, 3, opts))
  }
  for (const note of loose) parts.push(noteSection(note, 2, opts))
  return `${parts.join('\n\n')}\n`
}

/** A whole note as Markdown: its title as a heading, then its body. */
export function noteToMarkdown(title: string, doc: DocJson | unknown): string {
  return `# ${title.trim() || 'Untitled'}\n\n${docToMarkdown(doc)}`
}

/** Collects the ids of every picture used in a document. */
export function imageIdsIn(doc: unknown): string[] {
  const ids: string[] = []
  const walk = (node: Node | undefined) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'noteImage' && typeof node.attrs?.imageId === 'string') ids.push(node.attrs.imageId)
    for (const child of node.content ?? []) walk(child)
  }
  walk(doc as Node)
  return ids
}
