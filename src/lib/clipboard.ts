import { imageUrl } from '../images'

export type CopyResult = 'rich' | 'plain' | 'failed'

/** Last-resort copy for browsers without the clipboard API (or when it refuses). */
function copyWithTextarea(text: string): boolean {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

export async function copyText(text: string): Promise<CopyResult> {
  try {
    await navigator.clipboard.writeText(text)
    return 'plain'
  } catch {
    return copyWithTextarea(text) ? 'plain' : 'failed'
  }
}

/**
 * Copies formatted content, with plain text alongside it so any app can paste something.
 * Falls back to plain text where the richer clipboard is unavailable (older Firefox, and
 * anywhere the page is not on https).
 */
export async function copyRich(html: string, text: string): Promise<CopyResult> {
  if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ])
      return 'rich'
    } catch {
      // Fall through to plain text.
    }
  }
  return copyText(text)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read picture'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Puts the actual pictures into copied HTML. In the note they are only referenced by id,
 * which other apps cannot resolve, so each one is embedded as data. Pictures that are not
 * on this device are left as they are.
 */
export async function inlineImages(html: string): Promise<string> {
  const document_ = new DOMParser().parseFromString(html, 'text/html')
  const images = [...document_.querySelectorAll('img[data-image-id]')]
  await Promise.all(
    images.map(async (img) => {
      const id = img.getAttribute('data-image-id')
      if (!id) return
      try {
        const url = await imageUrl(id)
        if (!url) return
        const response = await fetch(url)
        img.setAttribute('src', await blobToDataUrl(await response.blob()))
      } catch {
        // Leave the picture out rather than fail the whole copy.
      }
    }),
  )
  return document_.body.innerHTML
}
