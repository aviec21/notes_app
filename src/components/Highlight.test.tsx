// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import Highlight from './Highlight'

afterEach(() => cleanup())

const marks = (container: HTMLElement) => [...container.querySelectorAll('mark')].map((m) => m.textContent)

describe('highlighting matched words', () => {
  it('marks every match, whatever its capitals', () => {
    const { container } = render(<Highlight text="Milk and more MILK, milkshake" query="milk" />)
    expect(marks(container)).toEqual(['Milk', 'MILK', 'milk'])
    expect(container.textContent).toBe('Milk and more MILK, milkshake') // the words themselves are unchanged
  })

  it('marks part of a word', () => {
    const { container } = render(<Highlight text="Meeting notes" query="mee" />)
    expect(marks(container)).toEqual(['Mee'])
  })

  it('shows plain text when there is no query, or nothing matches', () => {
    expect(marks(render(<Highlight text="Hello" query="" />).container)).toEqual([])
    expect(marks(render(<Highlight text="Hello" query="   " />).container)).toEqual([])
    expect(marks(render(<Highlight text="Hello" query="zzz" />).container)).toEqual([])
  })

  it('treats characters like ( ) . * + ? as ordinary text, not as pattern syntax', () => {
    const { container } = render(<Highlight text="cost (approx.) is 3+4 = 7?" query="(approx.)" />)
    expect(marks(container)).toEqual(['(approx.)'])
    expect(marks(render(<Highlight text="a+b and a.b" query="a.b" />).container)).toEqual(['a.b'])
    expect(marks(render(<Highlight text="what?" query="?" />).container)).toEqual(['?'])
    expect(marks(render(<Highlight text="x [y] z" query="[y]" />).container)).toEqual(['[y]'])
  })

  it('handles text with unusual capitals in other languages', () => {
    expect(marks(render(<Highlight text="Straße und ÄPFEL" query="äpfel" />).container)).toEqual(['ÄPFEL'])
  })

  it('does not run away on a very long text', () => {
    const start = Date.now()
    const { container } = render(<Highlight text={'word '.repeat(20_000)} query="word" />)
    expect(marks(container)).toHaveLength(20_000)
    expect(Date.now() - start).toBeLessThan(5000)
  })
})
