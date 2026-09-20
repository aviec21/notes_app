// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { imageBlobOf, storeImage } from './images'
import { db } from './sync/runtime'

beforeEach(async () => {
  await db.images.clear()
})

describe('pictures kept on the device', () => {
  it('are stored as plain bytes, not as a Blob (Safari cannot always store those)', async () => {
    const id = await storeImage('note-1', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' }), 'image/webp')
    const row = (await db.images.get(id))!
    expect(row.blob).toBeUndefined()
    expect(Object.prototype.toString.call(row.data)).toBe('[object ArrayBuffer]')
    expect([...new Uint8Array(row.data!)]).toEqual([1, 2, 3, 4])
    expect(row).toMatchObject({ noteId: 'note-1', mime: 'image/webp', size: 4, uploaded: 0 })
  })

  it('come back out as a Blob of the right type and size', async () => {
    const id = await storeImage('n', new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }), 'image/png')
    const blob = imageBlobOf((await db.images.get(id))!)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(3)
  })

  it('saved by earlier versions (as a Blob) can still be read', () => {
    const old = new Blob([new Uint8Array([1, 2])], { type: 'image/webp' })
    const blob = imageBlobOf({ id: 'x', noteId: 'n', blob: old, mime: 'image/webp', size: 2, uploaded: 1, createdAt: 1 })
    expect(blob).toBe(old)
  })

  it('refuses a row that has no picture in it, rather than showing a broken image', () => {
    expect(() => imageBlobOf({ id: 'x', noteId: 'n', mime: 'image/webp', size: 0, uploaded: 0, createdAt: 1 })).toThrow()
  })
})
