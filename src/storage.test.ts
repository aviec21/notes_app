// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistence, storageInfo } from './storage'

function stubStorage(value: Record<string, unknown> | undefined) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value })
}
afterEach(() => vi.restoreAllMocks())

describe('asking the browser to protect stored notes', () => {
  it('requests persistence, and reports the answer', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persist, persisted: async () => false })
    expect(await requestPersistence()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does not ask again when already protected', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persist, persisted: async () => true })
    expect(await requestPersistence()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('carries on quietly when the browser says no, cannot answer, or lacks the feature', async () => {
    stubStorage({ persist: async () => false, persisted: async () => false })
    expect(await requestPersistence()).toBe(false)
    stubStorage({ persist: async () => Promise.reject(new Error('blocked')), persisted: async () => false })
    expect(await requestPersistence()).toBeNull()
    stubStorage(undefined)
    expect(await requestPersistence()).toBeNull()
  })

  it('reports how much space is used', async () => {
    stubStorage({ persisted: async () => true, estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 2048 * 1024 * 1024 }) })
    expect(await storageInfo()).toEqual({ persisted: true, usedMB: 5, quotaMB: 2048 })
  })

  it('says "unknown" rather than failing when the browser will not tell', async () => {
    stubStorage({ persisted: async () => Promise.reject(new Error('private window')) })
    expect(await storageInfo()).toEqual({ persisted: null, usedMB: null, quotaMB: null })
  })
})
