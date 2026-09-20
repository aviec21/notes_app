// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './LoginScreen'
import RecoverySection from './RecoveryCode'

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function openForgot() {
  fireEvent.click(screen.getByRole('button', { name: 'Forgot your PIN?' }))
  return {
    code: await screen.findByLabelText('Recovery code'),
    pin: screen.getByLabelText('New PIN'),
    confirm: screen.getByLabelText('Confirm new PIN'),
    submit: screen.getByRole('button', { name: 'Reset PIN and sign in' }),
  }
}

describe('forgot your PIN', () => {
  it('checks the form before sending anything', async () => {
    render(<LoginScreen onSignedIn={() => {}} />)
    const f = await openForgot()

    fireEvent.change(f.code, { target: { value: 'too short' } })
    fireEvent.change(f.pin, { target: { value: '246810' } })
    fireEvent.change(f.confirm, { target: { value: '246810' } })
    fireEvent.click(f.submit)
    expect((await screen.findByRole('alert')).textContent).toContain('does not look like a recovery code')

    fireEvent.change(f.code, { target: { value: 'ABCD-EFGH-JKMN-PQRS' } })
    fireEvent.change(f.confirm, { target: { value: '111111' } })
    fireEvent.click(f.submit)
    expect((await screen.findByRole('alert')).textContent).toContain('do not match')

    fireEvent.change(f.pin, { target: { value: '12' } })
    fireEvent.change(f.confirm, { target: { value: '12' } })
    fireEvent.click(f.submit)
    expect((await screen.findByRole('alert')).textContent).toContain('must be')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the fresh code once and only continues after it is confirmed as saved', async () => {
    fetchMock.mockReturnValueOnce(json(200, { code: 'WXYZ-2345-ABCD-EFGH' }))
    const onSignedIn = vi.fn()
    render(<LoginScreen onSignedIn={onSignedIn} />)
    const f = await openForgot()
    fireEvent.change(f.code, { target: { value: 'abcd efgh jkmn pqrs' } })
    fireEvent.change(f.pin, { target: { value: '246810' } })
    fireEvent.change(f.confirm, { target: { value: '246810' } })
    fireEvent.click(f.submit)

    expect((await screen.findByLabelText('Your recovery code')).textContent).toContain('WXYZ-2345-ABCD-EFGH')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({ recoveryCode: 'abcd efgh jkmn pqrs', newPin: '246810' })

    const carryOn = screen.getByRole('button', { name: 'Continue to my notes' })
    expect((carryOn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('I have saved this code somewhere safe'))
    fireEvent.click(carryOn)
    expect(onSignedIn).toHaveBeenCalledTimes(1)
  })

  it('explains a wrong code, and a lock-out', async () => {
    fetchMock.mockReturnValueOnce(json(401, { error: 'invalid' }))
    fetchMock.mockReturnValueOnce(json(429, { error: 'locked', retryAfter: 60 }))
    render(<LoginScreen onSignedIn={() => {}} />)
    const f = await openForgot()
    fireEvent.change(f.code, { target: { value: 'ABCD-EFGH-JKMN-PQRS' } })
    fireEvent.change(f.pin, { target: { value: '246810' } })
    fireEvent.change(f.confirm, { target: { value: '246810' } })

    fireEvent.click(f.submit)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not right'))
    fireEvent.click(f.submit)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Too many wrong attempts'))
  })

  it('can go back to the normal sign-in', async () => {
    render(<LoginScreen onSignedIn={() => {}} />)
    await openForgot()
    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(screen.getByLabelText('PIN')).toBeTruthy()
  })
})

describe('creating a recovery code in Settings', () => {
  it('asks for the current PIN, shows the code once, then reports the change', async () => {
    fetchMock.mockReturnValueOnce(json(401, { error: 'invalid' }))
    fetchMock.mockReturnValueOnce(json(200, { code: 'K7QM-2XPD-9HRT-4WNB' }))
    const onChanged = vi.fn()
    render(<RecoverySection hasRecovery={false} onChanged={onChanged} />)

    expect(screen.getByText(/no recovery code yet/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create a recovery code' }))
    const input = screen.getByLabelText('Current PIN for recovery code')

    fireEvent.change(input, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not your current PIN')

    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }))
    expect((await screen.findByLabelText('Your recovery code')).textContent).toContain('K7QM-2XPD-9HRT-4WNB')
    expect(onChanged).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('I have saved this code somewhere safe'))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('offers to replace an existing code', () => {
    render(<RecoverySection hasRecovery onChanged={() => {}} />)
    expect(screen.getByRole('button', { name: 'Create a new recovery code' })).toBeTruthy()
  })
})
