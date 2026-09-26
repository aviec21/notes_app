import type { Editor } from '@tiptap/react'
import { useEffect } from 'react'

/**
 * Keeping the text you are working on in view. On a phone the on-screen keyboard and the
 * formatting bar cover the bottom of the screen, and the sticky header covers the top; the
 * browser knows nothing about our bars, so text under them has to be scrolled out by hand.
 */

/** How close to an edge (px) the pointer must be for a drag-selection to start scrolling. */
export const EDGE_ZONE = 48
const MAX_SPEED = 22 // px per frame

/**
 * How fast to scroll (px per frame; negative = up) while a selection is dragged with the
 * mouse at height `y`, when the text can be seen between `top` and `bottom`. Zero in the
 * middle; faster the closer to (or past) the edge. Pointers outside [rectTop, rectBottom]
 * are left to the browser, which scrolls on its own there.
 */
export function edgeScrollSpeed(y: number, top: number, bottom: number, rectTop = top, rectBottom = bottom): number {
  if (y < rectTop || y > rectBottom) return 0
  if (y < top + EDGE_ZONE) return -Math.min(MAX_SPEED, Math.max(2, ((top + EDGE_ZONE - y) / EDGE_ZONE) * MAX_SPEED))
  if (y > bottom - EDGE_ZONE) return Math.min(MAX_SPEED, Math.max(2, ((y - (bottom - EDGE_ZONE)) / EDGE_ZONE) * MAX_SPEED))
  return 0
}

/**
 * How far to scroll (px; positive = down) so a line at [top, bottom] is inside the part of
 * the screen that is not covered, with `margin` to spare. Zero if it already is.
 */
export function scrollToReveal(top: number, bottom: number, visibleTop: number, visibleBottom: number, margin = 16): number {
  if (bottom > visibleBottom - margin) return Math.ceil(bottom - (visibleBottom - margin))
  if (top < visibleTop + margin) return -Math.ceil(visibleTop + margin - top)
  return 0
}

/** The element that scrolls `el`: the nearest scrolling ancestor, or the page itself. */
export function scrollerOf(el: Element | null): Element {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return document.scrollingElement ?? document.documentElement
}

/** The strip of the screen the text can actually be seen in (clear of the bars and the keyboard). */
export function visibleBand(scroller: Element): { top: number; bottom: number; rectTop: number; rectBottom: number } {
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement
  const vv = window.visualViewport
  const rect = isPage
    ? { top: vv?.offsetTop ?? 0, bottom: (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) }
    : scroller.getBoundingClientRect()
  let top = rect.top
  let bottom = isPage ? rect.bottom : Math.min(rect.bottom, (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight))
  const header = document.querySelector('[data-editor-header]')
  if (header) {
    const h = header.getBoundingClientRect()
    if (h.bottom > top && h.top < bottom) top = h.bottom
  }
  const bar = document.querySelector('[data-editor-bottom-bar]')
  if (bar) {
    const b = bar.getBoundingClientRect()
    if (b.top < bottom && b.bottom > top) bottom = b.top
  }
  return { top, bottom, rectTop: rect.top, rectBottom: rect.bottom }
}

/**
 * Publishes how much of the bottom of the screen the on-screen keyboard covers as the CSS
 * variable `--kb-inset`. Chrome on Android already shrinks the page for the keyboard (so this
 * stays 0 there); Safari on iPhone does not, and the bottom toolbar would sit behind the keys.
 */
export function useKeyboardInset(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport
    if (!enabled || !vv) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--kb-inset')
    }
  }, [enabled])
}

/** Scrolls the caret or the selection's moving end into the visible band, if it is hidden. */
function revealSelectionEnd(editor: Editor) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.focusNode || !editor.view.dom.contains(sel.focusNode)) return
  const range = document.createRange()
  try {
    range.setStart(sel.focusNode, sel.focusOffset)
  } catch {
    return
  }
  range.collapse(true)
  const rects = range.getClientRects()
  let rect: DOMRect | undefined = rects[0] ?? range.getBoundingClientRect()
  if (!rect || (rect.height === 0 && rect.top === 0)) {
    // An empty line has no box of its own; its element's position will do.
    const el = sel.focusNode instanceof Element ? sel.focusNode : sel.focusNode.parentElement
    rect = el?.getBoundingClientRect()
  }
  if (!rect) return
  const scroller = scrollerOf(editor.view.dom)
  const band = visibleBand(scroller)
  const delta = scrollToReveal(rect.top, rect.bottom, band.top, band.bottom)
  if (delta !== 0) scroller.scrollBy({ top: delta })
}

/**
 * Phones: keeps the caret and the moving end of a selection clear of the keyboard, the
 * toolbar and the header. It reacts when the keyboard opens or closes and whenever the
 * selection changes, which includes dragging the selection handles (the browser gives no
 * events for those, so this scrolls the moment the handle reaches a covered area).
 */
export function useKeepSelectionVisible(editor: Editor | null, enabled: boolean) {
  useEffect(() => {
    if (!editor || !enabled) return
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => editor.isFocused && revealSelectionEnd(editor))
    }
    document.addEventListener('selectionchange', later)
    const vv = window.visualViewport
    vv?.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('selectionchange', later)
      vv?.removeEventListener('resize', later)
    }
  }, [editor, enabled])
}

/**
 * Computers: while a selection is being dragged with the mouse, scrolls the page (or the
 * side panel) up or down when the pointer nears its top or bottom, so the selection can be
 * carried to text that is off screen. Beyond the very edge the browser scrolls by itself.
 */
export function useDragSelectAutoscroll(editor: Editor | null, enabled: boolean) {
  useEffect(() => {
    if (!editor || !enabled) return
    const dom = editor.view.dom
    let y = 0
    let frame = 0
    let active = false

    const step = () => {
      if (!active) return
      const scroller = scrollerOf(dom)
      const band = visibleBand(scroller)
      const speed = edgeScrollSpeed(y, band.top, band.bottom, band.rectTop, band.rectBottom)
      if (speed !== 0) scroller.scrollBy({ top: speed })
      frame = requestAnimationFrame(step)
    }
    const stop = () => {
      active = false
      cancelAnimationFrame(frame)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      y = e.clientY
      active = true
      frame = requestAnimationFrame(step)
    }
    const onMove = (e: PointerEvent) => {
      if (active) y = e.clientY
    }
    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
    return () => {
      stop()
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('blur', stop)
    }
  }, [editor, enabled])
}
