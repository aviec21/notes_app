import { MAX_OPS_PER_PUSH, type OpResult, type SyncOp } from '../../shared/sync.js'
import { getStore } from '../_lib/db.js'
import { json, readJson } from '../_lib/http.js'
import { readSession } from '../_lib/session.js'
import { processOp } from '../_lib/sync-core.js'

// Receives a batch of queued changes from a device and reports what happened to each.
export async function POST(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)

    const { ops } = await readJson(request)
    if (!Array.isArray(ops) || ops.length > MAX_OPS_PER_PUSH) return json({ error: 'invalid' }, 400)

    const store = await getStore()
    // Old idempotency records are only needed for short-lived retries.
    await store.pruneApplied()

    const results: OpResult[] = []
    for (const op of ops) results.push(await processOp(store, op as SyncOp))
    return json({ results })
  } catch (err) {
    console.error('Sync push failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
