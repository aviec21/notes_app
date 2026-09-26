import { describe, expect, it } from 'vitest'
import { EDGE_ZONE, edgeScrollSpeed, scrollToReveal } from './viewport'

describe('edgeScrollSpeed (dragging a selection with the mouse)', () => {
  // Text can be seen between y = 100 and y = 700 (a header above, the window's edge below).
  const speed = (y: number) => edgeScrollSpeed(y, 100, 700, 0, 760)

  it('does not scroll while the pointer is in the middle', () => {
    expect(speed(400)).toBe(0)
    expect(speed(100 + EDGE_ZONE)).toBe(0)
    expect(speed(700 - EDGE_ZONE)).toBe(0)
  })

  it('scrolls down near the bottom, and faster the closer it gets', () => {
    const near = speed(700 - EDGE_ZONE + 10)
    const closer = speed(690)
    expect(near).toBeGreaterThan(0)
    expect(closer).toBeGreaterThan(near)
  })

  it('scrolls up near the top, where a sticky header is covering the text', () => {
    expect(speed(110)).toBeLessThan(0)
    expect(speed(102)).toBeLessThan(speed(140))
    // Even over the header itself (inside the panel, above the visible text).
    expect(speed(50)).toBeLessThan(0)
  })

  it('is capped, so it never becomes a blur', () => {
    expect(Math.abs(speed(755))).toBeLessThanOrEqual(22)
    expect(Math.abs(speed(5))).toBeLessThanOrEqual(22)
  })

  it('leaves it to the browser once the pointer is outside the panel', () => {
    expect(speed(-20)).toBe(0)
    expect(speed(800)).toBe(0)
  })
})

describe('scrollToReveal (keeping the caret clear of the keyboard and toolbar)', () => {
  it('does nothing when the line is already in view', () => {
    expect(scrollToReveal(300, 324, 60, 500)).toBe(0)
  })

  it('scrolls down by exactly what is needed when the line is behind the keyboard or toolbar', () => {
    // Visible area ends at 500; the line's bottom is at 520; 16px of breathing room.
    expect(scrollToReveal(496, 520, 60, 500)).toBe(36)
    expect(scrollToReveal(640, 664, 60, 500)).toBe(180)
  })

  it('scrolls up when the line is behind the header', () => {
    expect(scrollToReveal(40, 64, 60, 500)).toBe(-36)
  })

  it('keeps a line just inside the margin where it is', () => {
    expect(scrollToReveal(460, 484, 60, 500)).toBe(0)
    expect(scrollToReveal(76, 100, 60, 500)).toBe(0)
  })
})
