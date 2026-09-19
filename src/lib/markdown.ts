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
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(node.content)}`
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
    case 'noteImage':
      return `![${String(node.attrs?.alt ?? 'Picture')}](images/${String(node.attrs?.imageId ?? '')}.webp)`
    case 'text':
      return inline([node])
    default:
      return (node.content ?? []).map((child) => block(child, indent)).filter(Boolean).join('\n\n')
  }
}

/** Converts a note's rich-text document to Markdown. */
export function docToMarkdown(doc: DocJson | unknown): string {
  return block(doc as Node, '').trim()
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
