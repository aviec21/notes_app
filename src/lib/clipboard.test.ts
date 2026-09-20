// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyRich, copyText, inlineImages } from './clipboard'

const clipboard = () => navigator.clipboard as unknown as { write: ReturnType<typeof vi.fn>; writeText: ReturnType<typeof vi.fn> }

function setClipboard(write: () => Promise<void>, writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { write: vi.fn(write), writeText: vi.fn(writeText) },
  })
}

const ok = () => Promise.resolve()
const fail = () => Promise.reject(new Error('refused'))

beforeEach(() => {
  setClipboard(ok, ok)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }) })),
  )
  // jsdom has no ClipboardItem; stand one in so the rich path can be exercised.
  vi.stubGlobal(
    'ClipboardItem',
    class {
      items: Record<string, Blob>
      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    },
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('copying', () => {
  it('copies formatted content with plain text alongside it', async () => {
    expect(await copyRich('<p><b>Hi</b></p>', 'Hi')).toBe('rich')
    const item = clipboard().write.mock.calls[0][0][0] as { items: Record<string, Blob> }
    expect(Object.keys(item.items)).toEqual(['text/html', 'text/plain'])
    expect(await item.items['text/html'].text()).toBe('<p><b>Hi</b></p>')
  })

  it('falls back to plain text where formatting cannot be copied', async () => {
    setClipboard(fail, ok)
    expect(await copyRich('<p>Hi</p>', 'Hi')).toBe('plain')
    expect(clipboard().writeText).toHaveBeenCalledWith('Hi')
  })

  it('falls back again when the clipboard API is missing entirely', async () => {
    vi.stubGlobal('ClipboardItem', undefined)
    setClipboard(fail, fail)
    document.execCommand = vi.fn(() => true)
    expect(await copyRich('<p>Hi</p>', 'Hi')).toBe('plain')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports failure when nothing works, so the app can say so', async () => {
    setClipboard(fail, fail)
    document.execCommand = vi.fn(() => false)
    expect(await copyText('Hi')).toBe('failed')
  })
})

describe('pictures in copied content', () => {
  it('embeds the picture so other apps can show it', async () => {
    const html = await inlineImages('<p>Before</p><img data-image-id="abc" alt="Map">')
    expect(html).toContain('src="data:image/webp;base64,')
    expect(html).toContain('data-image-id="abc"') // still recognised when pasted back here
  })

  it('leaves a picture alone when it is not on this device', async () => {
    const html = await inlineImages('<img data-image-id="missing" alt="Gone">')
    expect(html).not.toContain('src=')
    expect(html).toContain('data-image-id="missing"')
  })
})

vi.mock('../images', () => ({
  imageUrl: async (id: string) => (id === 'missing' ? null : 'blob:fake'),
}))
