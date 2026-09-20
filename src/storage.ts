/**
 * Browsers may clear a site's stored data when a device runs low on space (Safari also
 * after about a week without use). "Persistent storage" is the browser's promise not to,
 * which matters here because unsynced notes live only in that storage until they sync.
 */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    const storage = navigator.storage
    if (!storage?.persist) return null
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return null
  }
}

export interface StorageInfo {
  /** true: protected from clearing; false: the browser may clear it; null: cannot tell. */
  persisted: boolean | null
  usedMB: number | null
  quotaMB: number | null
}

export async function storageInfo(): Promise<StorageInfo> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  let persisted: boolean | null = null
  let usedMB: number | null = null
  let quotaMB: number | null = null
  try {
    if (storage?.persisted) persisted = await storage.persisted()
    if (storage?.estimate) {
      const { usage, quota } = await storage.estimate()
      usedMB = usage == null ? null : Math.round((usage / 1024 / 1024) * 10) / 10
      quotaMB = quota == null ? null : Math.round(quota / 1024 / 1024)
    }
  } catch {
    // Some browsers refuse these questions (private windows); the answer is "unknown".
  }
  return { persisted, usedMB, quotaMB }
}
