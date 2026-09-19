import { db } from './sync/runtime'

export const MAX_IMAGE_BYTES = 3_000_000
const MAX_DIMENSION = 1600
const QUALITY = 0.82

/** Shrinks and re-encodes a picture so notes stay small and sync quickly. */
export async function compressImage(file: File | Blob): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Not an image')
  // Animated GIFs and SVGs would lose their point (or their safety) when redrawn.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('too-large')
    return { blob: file, mime: file.type }
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY))
  if (!blob) throw new Error('Could not read that image')
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('too-large')
  return { blob, mime: blob.type || 'image/webp' }
}

/** Saves a picture on this device and queues it for upload. Returns its id. */
export async function storeImage(noteId: string, blob: Blob, mime: string): Promise<string> {
  const id = crypto.randomUUID()
  await db.images.put({ id, noteId, blob, mime, size: blob.size, uploaded: 0, createdAt: Date.now() })
  return id
}

const urls = new Map<string, string>()
const fetching = new Map<string, Promise<string | null>>()

/** A viewable URL, or null if the stored copy turns out to be unreadable. */
function toUrl(id: string, blob: Blob): string | null {
  try {
    const url = URL.createObjectURL(blob)
    urls.set(id, url)
    return url
  } catch {
    return null
  }
}

/**
 * A URL for showing a picture: from this device if it is here, otherwise fetched from the
 * server once and then kept locally so it also works offline.
 */
export async function imageUrl(id: string): Promise<string | null> {
  const cached = urls.get(id)
  if (cached) return cached

  const local = await db.images.get(id)
  if (local) return toUrl(id, local.blob)

  let pending = fetching.get(id)
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`/api/images?id=${id}`, { credentials: 'same-origin' })
        if (!res.ok) return null
        const blob = await res.blob()
        // Keep it for offline use; it is already on the server, so it needs no upload.
        await db.images.put({ id, noteId: '', blob, mime: blob.type, size: blob.size, uploaded: 1, createdAt: Date.now() })
        return toUrl(id, blob)
      } catch {
        return null // offline: the placeholder stays until the connection is back
      } finally {
        fetching.delete(id)
      }
    })()
    fetching.set(id, pending)
  }
  return pending
}

/** Sends pictures that have not reached the server yet. Called before each sync push. */
export async function uploadPendingImages(): Promise<void> {
  const pending = await db.images.where('uploaded').equals(0).toArray()
  for (const image of pending) {
    const res = await fetch(`/api/images?id=${image.id}&noteId=${image.noteId}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': image.mime },
      body: image.blob,
    })
    // 413 means the server refused the size: keep the local copy, but stop retrying forever.
    if (res.ok || res.status === 413) await db.images.update(image.id, { uploaded: res.ok ? 1 : 2 })
    else if (res.status === 401) return // signed out; the sync engine reports it
    else throw new Error(`Image upload failed with ${res.status}`)
  }
}
