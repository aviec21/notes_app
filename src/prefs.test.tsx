// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useNumberPref, usePref } from './prefs'

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

function Choice({ name }: { name: string }) {
  const [value, set] = usePref('test.choice', 'a', ['a', 'b', 'c'])
  return (
    <button type="button" onClick={() => set('b')}>
      {name}: {value}
    </button>
  )
}

function Amount() {
  const [value, set] = useNumberPref('test.amount', 100, 50, 200)
  return (
    <button type="button" onClick={() => set(150)}>
      amount {value}
    </button>
  )
}

describe('remembered choices', () => {
  it('start at the default', () => {
    render(<Choice name="one" />)
    expect(screen.getByRole('button').textContent).toBe('one: a')
  })

  it('are saved, and every component using the same choice updates at once', async () => {
    const user = userEvent.setup()
    render(
      <>
        <Choice name="one" />
        <Choice name="two" />
      </>,
    )
    await user.click(screen.getByRole('button', { name: /one/ }))
    expect(screen.getByRole('button', { name: /one/ }).textContent).toBe('one: b')
    expect(screen.getByRole('button', { name: /two/ }).textContent).toBe('two: b')
    expect(localStorage.getItem('test.choice')).toBe('b')
  })

  it('ignore a stored value that is not allowed', () => {
    localStorage.setItem('test.choice', 'zzz')
    render(<Choice name="one" />)
    expect(screen.getByRole('button').textContent).toBe('one: a')
  })

  it('pick up a change made in another tab', () => {
    render(<Choice name="one" />)
    act(() => {
      localStorage.setItem('test.choice', 'c')
      window.dispatchEvent(new StorageEvent('storage', { key: 'test.choice', storageArea: localStorage }))
    })
    expect(screen.getByRole('button').textContent).toBe('one: c')
  })
})

describe('remembered numbers', () => {
  it('start at the default, save, and stay inside their limits', async () => {
    const user = userEvent.setup()
    localStorage.setItem('test.amount', '9999') // out of range: ignored
    render(<Amount />)
    expect(screen.getByRole('button').textContent).toBe('amount 100')
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('amount 150')
    expect(localStorage.getItem('test.amount')).toBe('150')
  })

  it('ignore text that is not a number', () => {
    localStorage.setItem('test.amount', 'wide')
    render(<Amount />)
    expect(screen.getByRole('button').textContent).toBe('amount 100')
  })
})
