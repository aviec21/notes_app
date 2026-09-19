import { PULL_PAGE_SIZE } from '../../shared/sync.js'
import { getStore } from '../_lib/db.js'
import { json } from '../_lib/http.js'
import { readSession } from '../_lib/session.js'
import { pullChanges } from '../_lib/sync-core.js'

// Returns everything that changed after the revision the device last saw.
export async function GET(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)

    const since = Number(new URL(request.url).searchParams.get('since') ?? 0)
    if (!Number.isSafeInteger(since) || since < 0) return json({ error: 'invalid' }, 400)

    return json(await pullChanges(await getStore(), since, PULL_PAGE_SIZE))
  } catch (err) {
    console.error('Sync pull failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
