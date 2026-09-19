import { BIN_RETENTION_DAYS } from '../../shared/sync.js'
import { getStore } from '../_lib/db.js'
import { json } from '../_lib/http.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Runs daily (see vercel.json). Permanently deletes anything that has sat in the
// recycle bin for more than 30 days; devices then remove it on their next sync.
export async function GET(request: Request) {
  // Vercel sends "Authorization: Bearer <CRON_SECRET>" with scheduled runs.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'unauthorized' }, 401)
  }
  try {
    const store = await getStore()
    const purged = await store.purgeExpired(Date.now() - BIN_RETENTION_DAYS * DAY_MS)
    const images = await store.purgeOrphanImages()
    return json({ purged, images })
  } catch (err) {
    console.error('Bin purge failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
