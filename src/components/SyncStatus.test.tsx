// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncSnapshot } from '../sync/engine'
import SyncStatus from './SyncStatus'

const state = { snapshot: { state: 'idle', lastSyncedAt: null, refused: 0 } as SyncSnapshot, pending: 0, online: true }

vi.mock('../hooks', () => ({
  useSyncSnapshot: () => state.snapshot,
  usePendingCount: () => state.pending,
  useOnline: () => state.online,
}))

beforeEach(() => {
  state.snapshot = { state: 'idle', lastSyncedAt: null, refused: 0 }
  state.pending = 0
  state.online = true
})
afterEach(() => cleanup())

const dot = () => document.querySelector('[data-sync-dot]') as HTMLElement

describe('the sync status dot', () => {
  it('is green when everything is synced', () => {
    render(<SyncStatus />)
    expect(screen.getByText('Synced')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('synced')
    expect(dot().style.background).toBe('var(--status-ok)')
  })

  it('is yellow (and pulses) while syncing', () => {
    state.snapshot = { state: 'syncing', lastSyncedAt: null, refused: 0 }
    render(<SyncStatus />)
    expect(screen.getByText('Syncing…')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('working')
    expect(dot().style.background).toBe('var(--status-busy)')
    expect(dot().className).toContain('sync-dot-pulse')
  })

  it('is yellow while changes are waiting to be sent', () => {
    state.pending = 3
    render(<SyncStatus />)
    expect(screen.getByText('3 changes waiting')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('working')
  })

  it('is red when syncing failed', () => {
    state.snapshot = { state: 'error', lastSyncedAt: null, refused: 0 }
    render(<SyncStatus />)
    expect(screen.getByText('Sync problem · will retry')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('problem')
    expect(dot().style.background).toBe('var(--status-error)')
  })

  it('is red when the server refused a change, and says so', () => {
    state.snapshot = { state: 'idle', lastSyncedAt: null, refused: 2 }
    render(<SyncStatus />)
    expect(screen.getByText(/2 changes were refused by the server/)).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('problem')
  })

  it('is grey, not an alarm, when offline with nothing waiting', () => {
    state.online = false
    render(<SyncStatus />)
    expect(screen.getByText('Offline · saved on this device')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('idle')
    expect(dot().className).not.toContain('sync-dot-pulse')
  })

  it('is yellow (not pulsing) when offline with changes waiting', () => {
    state.online = false
    state.pending = 1
    render(<SyncStatus />)
    expect(screen.getByText('Offline · 1 change waiting')).toBeTruthy()
    expect(dot().dataset.syncDot).toBe('working')
    expect(dot().className).not.toContain('sync-dot-pulse')
  })

  it('leaves the words in the normal muted colour instead of colouring them', () => {
    state.snapshot = { state: 'error', lastSyncedAt: null, refused: 0 }
    render(<SyncStatus />)
    expect(screen.getByRole('status').style.color).toBe('var(--muted)')
  })

  it('hides the dot from screen readers, which get the words', () => {
    render(<SyncStatus />)
    expect(dot().getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Synced')
  })

  it('compact form shows just the dot, with the words for screen readers and a tooltip', () => {
    state.snapshot = { state: 'error', lastSyncedAt: null, refused: 0 }
    render(<SyncStatus compact />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('title')).toContain('Sync problem')
    expect(status.querySelector('.sr-only')?.textContent).toBe('Sync problem · will retry')
    expect(dot().dataset.syncDot).toBe('problem')
  })
})
