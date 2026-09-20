import { describe, expect, it } from 'vitest'
import { docToMarkdown, imageIdsIn, selectionToMarkdown, type ExportNote } from './markdown'

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

// --- exporting a chosen set of notes and folders as one document ------------------------------

const heading = (level: number, value: string) => ({ type: 'heading', attrs: { level }, content: [text(value)] })
const note = (title: string, ...content: unknown[]): ExportNote => ({
  title,
  content: doc(...content),
  updatedAt: Date.UTC(2026, 8, 20),
  tags: [],
})
const when = new Date(Date.UTC(2026, 8, 20))

/** The document's heading outline, as "level title" lines. */
const outline = (markdown: string) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,6} /.test(line))
    .map((line) => `${line.indexOf(' ')} ${line.slice(line.indexOf(' ') + 1)}`)

describe('shifting headings', () => {
  it('nests the headings written inside a note below a given level', () => {
    const d = doc(heading(1, 'Goals'), heading(2, 'Q3'))
    expect(docToMarkdown(d)).toBe('# Goals\n\n## Q3')
    expect(docToMarkdown(d, { headingOffset: 2 })).toBe('### Goals\n\n#### Q3')
  })

  it('never goes deeper than level 6', () => {
    expect(docToMarkdown(doc(heading(3, 'Deep')), { headingOffset: 5 })).toBe('###### Deep')
  })

  it('embeds pictures from the given source, or says when one is missing', () => {
    const d = doc({ type: 'noteImage', attrs: { imageId: 'a', alt: 'Map' } }, { type: 'noteImage', attrs: { imageId: 'b', alt: 'Gone' } })
    const md = docToMarkdown(d, { imageSrc: (id) => (id === 'a' ? 'data:image/webp;base64,AAAA' : null) })
    expect(md).toContain('![Map](data:image/webp;base64,AAAA)')
    expect(md).toContain('*[Picture “Gone” could not be included]*')
  })
})

describe('exporting a selection as one Markdown file', () => {
  it('a single note: its title is the top heading and its own headings nest below it', () => {
    const md = selectionToMarkdown({ groups: [], loose: [note('Trip plan', heading(1, 'Flights'), para(text('Book early')), heading(2, 'Hotels'))], exportedOn: when })
    expect(outline(md)).toEqual(['1 Trip plan', '2 Flights', '3 Hotels'])
    expect(md).toContain('Book early')
    expect(md).toContain('*Updated 2026-09-20*')
  })

  it('a single folder: the folder is the title, each note a section, note headings below that', () => {
    const md = selectionToMarkdown({
      groups: [{ name: 'Work', notes: [note('Plan', heading(1, 'Goals')), note('Notes', para(text('hi')))] }],
      loose: [],
      exportedOn: when,
    })
    expect(outline(md)).toEqual(['1 Work', '2 Plan', '3 Goals', '2 Notes'])
  })

  it('several items: a title and contents, folders as sections, their notes as sub-sections', () => {
    const md = selectionToMarkdown({
      groups: [
        { name: 'Work', notes: [note('Plan', heading(1, 'Goals'))] },
        { name: 'Home', notes: [note('Chores', heading(2, 'Weekly'))] },
      ],
      loose: [note('Groceries', para(text('milk')))],
      exportedOn: when,
    })
    expect(outline(md)).toEqual([
      '1 Notes export',
      '2 Contents',
      '2 Work',
      '3 Plan',
      '4 Goals',
      '2 Home',
      '3 Chores',
      '5 Weekly', // a level-2 heading inside a note sits two below the note's own level
      '2 Groceries', // a note that is not in a folder sits beside the folders
    ])
    expect(md).toContain('*Exported 2026-09-20 · 3 notes*')
  })

  it('lists what is inside in the contents outline', () => {
    const md = selectionToMarkdown({
      groups: [{ name: 'Work', notes: [note('Plan')] }],
      loose: [note('Groceries')],
      exportedOn: when,
    })
    expect(md).toContain('## Contents\n\n- Work\n  - Plan\n- Groceries')
  })

  it('records tags, the folder of a loose note, and the update date under each title', () => {
    const md = selectionToMarkdown({
      groups: [],
      loose: [{ ...note('Idea'), tags: ['big idea', 'urgent'], folderName: 'Work' }],
      exportedOn: when,
    })
    expect(md).toContain('*Updated 2026-09-20 · Folder: Work · Tags: #big-idea #urgent*')
  })

  it('keeps titles on one line and names untitled notes', () => {
    const md = selectionToMarkdown({ groups: [], loose: [note('  Two\nlines '), note('')], exportedOn: when })
    expect(outline(md)).toContain('2 Two lines')
    expect(outline(md)).toContain('2 Untitled')
  })

  it('says so when an exported folder has no notes', () => {
    const md = selectionToMarkdown({ groups: [{ name: 'Empty', notes: [] }], loose: [], exportedOn: when })
    expect(md).toBe('# Empty\n\n*This folder has no notes.*\n')
  })

  it('carries tables, charts, checklists and pictures through to the file', () => {
    const cell = (v: string, header = false) => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(text(v))] })
    const md = selectionToMarkdown(
      {
        groups: [],
        loose: [
          note(
            'Rich',
            { type: 'table', content: [{ type: 'tableRow', content: [cell('A', true)] }, { type: 'tableRow', content: [cell('1')] }] },
            { type: 'chart', attrs: { chartType: 'bar', title: 'Sales', labels: ['Jan'], series: [{ name: 'Shop', values: [3] }] } },
            { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [para(text('done'))] }] },
            { type: 'noteImage', attrs: { imageId: 'p1', alt: 'Photo' } },
          ),
        ],
        exportedOn: when,
      },
      { imageSrc: () => 'data:image/webp;base64,QQ==' },
    )
    expect(md).toContain('| A |')
    expect(md).toContain('**Sales** (bar chart)')
    expect(md).toContain('- [x] done')
    expect(md).toContain('![Photo](data:image/webp;base64,QQ==)')
  })
})
