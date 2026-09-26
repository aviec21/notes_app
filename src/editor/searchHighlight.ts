import { Extension, type Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Marks every match of a search word inside the open note, without changing the note: the
 * marks are only drawn on screen (decorations), never saved, synced or exported.
 */
export interface Match {
  from: number
  to: number
}

export interface SearchState {
  query: string
  matches: Match[]
  /** Index of the match the find bar is on, or -1 when there are none. */
  current: number
  decorations: DecorationSet
}

export const searchKey = new PluginKey<SearchState>('noteSearch')

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every place `query` occurs in the document, ignoring capitals and matching part of a word
 * (the same rules as the list's search). A match can run across formatting, e.g. half of it
 * bold, but not across a line break or a picture.
 */
export function findMatches(doc: PMNode, query: string): Match[] {
  const needle = query.trim().replace(/\0/g, '')
  if (!needle) return []
  const pattern = new RegExp(escapeRegex(needle), 'gi')
  const matches: Match[] = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // The block's text in one string, remembering where each piece sits in the document.
    // Anything that is not text (a line break, a picture) becomes a \0, which no search contains.
    let text = ''
    const pieces: { start: number; pos: number }[] = []
    node.forEach((child, offset) => {
      pieces.push({ start: text.length, pos: pos + 1 + offset })
      text += child.isText ? child.text : '\0'
    })
    const positionOf = (index: number) => {
      let piece = pieces[0]
      for (const p of pieces) {
        if (p.start > index) break
        piece = p
      }
      return piece.pos + (index - piece.start)
    }
    for (const found of text.matchAll(pattern)) {
      const start = found.index
      matches.push({ from: positionOf(start), to: positionOf(start + found[0].length - 1) + 1 })
    }
    return false
  })
  return matches
}

function build(doc: PMNode, query: string, current: number): SearchState {
  const matches = findMatches(doc, query)
  const at = matches.length === 0 ? -1 : Math.min(Math.max(current, 0), matches.length - 1)
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === at ? 'search-hit search-hit-current' : 'search-hit' })),
  )
  return { query, matches, current: at, decorations }
}

interface Meta {
  query?: string
  current?: number
}

export const NoteSearch = Extension.create({
  name: 'noteSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_config, state) => build(state.doc, '', -1),
          apply(tr, prev, _old, next) {
            const meta = tr.getMeta(searchKey) as Meta | undefined
            if (meta?.query !== undefined) return build(next.doc, meta.query, 0)
            if (meta?.current !== undefined) return build(next.doc, prev.query, meta.current)
            if (tr.docChanged && prev.query) return build(next.doc, prev.query, prev.current)
            return prev
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ]
  },
})

/** What the find bar shows: how many matches there are and which one is current. */
export function searchSummary(editor: Editor): { query: string; count: number; current: number } {
  const state = searchKey.getState(editor.state)
  return { query: state?.query ?? '', count: state?.matches.length ?? 0, current: state?.current ?? -1 }
}

/** Scrolls the current match to the middle of the screen. */
export function revealCurrentMatch(editor: Editor) {
  editor.view.dom.querySelector('.search-hit-current')?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
}

/** Highlights `query` in the note (an empty query clears it) and scrolls to the first match. */
export function setSearchQuery(editor: Editor, query: string, reveal = true) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query } satisfies Meta).setMeta('addToHistory', false))
  if (reveal) revealCurrentMatch(editor)
}

/** Moves to the next (1) or previous (-1) match, wrapping around at the ends. */
export function stepSearch(editor: Editor, direction: 1 | -1) {
  const { count, current } = searchSummary(editor)
  if (count === 0) return
  const next = (current + direction + count) % count
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { current: next } satisfies Meta).setMeta('addToHistory', false))
  revealCurrentMatch(editor)
}
