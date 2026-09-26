// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from './auth'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A server check that answers only when the test says so (a slow server or a sleeping database). */
function slowServer() {
  let answer: (r: Response) => void = () => {}
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    reply: (status: number, body: unknown = {}) => act(async () => answer(new Response(JSON.stringify(body), { status }))),
  }
}

describe('opening the app', () => {
  it('shows the notes straight away on a device that was signed in, without waiting for the server', () => {
    localStorage.setItem('notes.signedIn', '1')
    const server = slowServer()
    const { result } = renderHook(() => useAuth())
    // The server has not answered, yet the person is already in.
    expect(result.current.state.status).toBe('signedIn')
    expect(server.fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.anything())
  })

  it('then takes the real answer from the server (for example the default-PIN warning)', async () => {
    localStorage.setItem('notes.signedIn', '1')
    const server = slowServer()
    const { result } = renderHook(() => useAuth())
    await server.reply(200, { defaultPin: true, hasRecovery: false })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'signedIn', defaultPin: true, hasRecovery: false }))
  })

  it('goes to the sign-in screen if the server says the session has ended', async () => {
    localStorage.setItem('notes.signedIn', '1')
    const server = slowServer()
    const { result } = renderHook(() => useAuth())
    expect(result.current.state.status).toBe('signedIn')
    await server.reply(401)
    await waitFor(() => expect(result.current.state.status).toBe('signedOut'))
    expect(localStorage.getItem('notes.signedIn')).toBeNull() // and it does not open straight in next time
  })

  it('a new device still waits for the server before showing anything', async () => {
    const server = slowServer()
    const { result } = renderHook(() => useAuth())
    expect(result.current.state.status).toBe('loading')
    await server.reply(401)
    await waitFor(() => expect(result.current.state.status).toBe('signedOut'))
  })

  it('stays open when offline', async () => {
    localStorage.setItem('notes.signedIn', '1')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.state.status).toBe('signedIn'))
  })
})
