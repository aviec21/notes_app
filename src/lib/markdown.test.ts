import { describe, expect, it } from 'vitest'
import { docToMarkdown, imageIdsIn } from './markdown'

const doc = (...content: unknown[]) => ({ type: 'doc', content })
const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const para = (...content: unknown[]) => ({ type: 'paragraph', content })

describe('notes as Markdown', () => {
  it('writes headings, paragraphs and the usual emphasis', () => {
    const md = docToMarkdown(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Plans')] },
        para(text('Buy '), text('milk', [{ type: 'bold' }]), text(' and '), text('eggs', [{ type: 'italic' }])),
        para(text('gone', [{ type: 'strike' }]), text(' '), text('code', [{ type: 'code' }])),
      ),
    )
    expect(md).toBe('## Plans\n\nBuy **milk** and *eggs*\n\n~~gone~~ `code`')
  })

  it('keeps underline, subscript and superscript as HTML, which Markdown lacks', () => {
    const md = docToMarkdown(
      doc(para(text('H', []), text('2', [{ type: 'subscript' }]), text('O '), text('x', []), text('2', [{ type: 'superscript' }]), text(' '), text('note', [{ type: 'underline' }]))),
    )
    expect(md).toBe('H<sub>2</sub>O x<sup>2</sup> <u>note</u>')
  })

  it('writes links', () => {
    const md = docToMarkdown(doc(para(text('site', [{ type: 'link', attrs: { href: 'https://example.com' } }]))))
    expect(md).toBe('[site](https://example.com)')
  })

  it('writes bulleted, numbered and checklist items', () => {
    const item = (value: string, checked?: boolean) => ({
      type: checked === undefined ? 'listItem' : 'taskItem',
      ...(checked === undefined ? {} : { attrs: { checked } }),
      content: [para(text(value))],
    })
    expect(docToMarkdown(doc({ type: 'bulletList', content: [item('one'), item('two')] }))).toBe('- one\n- two')
    expect(docToMarkdown(doc({ type: 'orderedList', attrs: { start: 1 }, content: [item('a'), item('b')] }))).toBe('1. a\n2. b')
    expect(docToMarkdown(doc({ type: 'taskList', content: [item('done', true), item('todo', false)] }))).toBe('- [x] done\n- [ ] todo')
  })

  it('writes a table with a header row', () => {
    const cell = (value: string, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(text(value))] })
    const md = docToMarkdown(
      doc({
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('Item', true), cell('Cost', true)] },
          { type: 'tableRow', content: [cell('Tea'), cell('30')] },
        ],
      }),
    )
    expect(md).toBe('| Item | Cost |\n| --- | --- |\n| Tea | 30 |')
  })

  it('writes a chart as its title and a table of the same numbers', () => {
    const md = docToMarkdown(
      doc({
        type: 'chart',
        attrs: {
          chartType: 'bar',
          title: 'Sales',
          labels: ['Jan', 'Feb'],
          series: [{ name: 'Shop', values: [3, 5] }],
        },
      }),
    )
    expect(md).toBe('**Sales** (bar chart)\n\n|  | Shop |\n| --- | --- |\n| Jan | 3 |\n| Feb | 5 |')
  })

  it('points a picture at the exported images folder, and lists its id', () => {
    const document = doc(para(text('before')), { type: 'noteImage', attrs: { imageId: 'abc-123', alt: 'Map', width: 50 } })
    expect(docToMarkdown(document)).toBe('before\n\n![Map](images/abc-123.webp)')
    expect(imageIdsIn(document)).toEqual(['abc-123'])
  })

  it('escapes characters that would otherwise be Markdown syntax', () => {
    expect(docToMarkdown(doc(para(text('2 * 3 [note] _x_'))))).toBe('2 \\* 3 \\[note\\] \\_x\\_')
  })

  it('writes quotes, code blocks and rules', () => {
    expect(docToMarkdown(doc({ type: 'blockquote', content: [para(text('quoted'))] }))).toBe('> quoted')
    expect(docToMarkdown(doc({ type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'a = 1' }] }))).toBe('```js\na = 1\n```')
    expect(docToMarkdown(doc({ type: 'horizontalRule' }))).toBe('---')
  })
})
