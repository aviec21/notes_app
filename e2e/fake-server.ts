import type { BrowserContext, Route } from '@playwright/test'
import { MemoryStore } from '../api/_lib/memory-store'
import { processOp, pullChanges } from '../api/_lib/sync-core'
import { PULL_PAGE_SIZE, type SyncOp } from '../shared/sync'

/**
 * A stand-in for the real API, so real browsers can be tested without the internet or a
 * database. It runs the app's actual sync rules (the same code the server uses), and lets
 * several browser windows act as separate devices sharing one account.
 */
export class FakeServer {
  readonly store = new MemoryStore()
  readonly images = new Map<string, { mime: string; data: Buffer }>()
  pin = '123456'
  /** Every request seen, for tests that care what was (not) sent. */
  readonly log: string[] = []
  /** Set to make the next sync request fail, to test recovery. */
  failNext = 0

  // Which browser windows are signed in. (Tracked here rather than with a cookie, because
  // Safari's engine does not show a request's cookie header to the test's interceptor.)
  private signedIn = new WeakSet<BrowserContext>()

  private contextOf(route: Route): BrowserContext {
    return route.request().frame().page().context()
  }

  private isSignedIn(route: Route) {
    return this.signedIn.has(this.contextOf(route))
  }

  private json(route: Route, status: number, body: unknown, headers: Record<string, string> = {}) {
    return route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store', ...headers },
      body: JSON.stringify(body),
    })
  }

  private async handle(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    this.log.push(`${request.method()} ${path}`)

    if (path === '/api/health') return this.json(route, 200, { ok: true })

    if (path === '/api/auth/login' && request.method() === 'POST') {
      const { pin } = request.postDataJSON() as { pin?: string }
      if (pin !== this.pin) return this.json(route, 401, { error: 'invalid' })
      this.signedIn.add(this.contextOf(route))
      return this.json(route, 200, { ok: true })
    }
    if (path === '/api/auth/logout') {
      this.signedIn.delete(this.contextOf(route))
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/auth/me') {
      if (!this.isSignedIn(route)) return this.json(route, 401, { error: 'unauthorized' })
      return this.json(route, 200, { defaultPin: this.pin === '123456' })
    }

    if (!this.isSignedIn(route)) return this.json(route, 401, { error: 'unauthorized' })

    if (path.startsWith('/api/sync/') && this.failNext > 0) {
      this.failNext--
      return this.json(route, 500, { error: 'server' })
    }
    if (path === '/api/sync/push') {
      const { ops } = request.postDataJSON() as { ops: SyncOp[] }
      const results = []
      for (const op of ops) results.push(await processOp(this.store, op))
      return this.json(route, 200, { results })
    }
    if (path === '/api/sync/pull') {
      const since = Number(url.searchParams.get('since') ?? 0)
      return this.json(route, 200, await pullChanges(this.store, since, PULL_PAGE_SIZE))
    }

    if (path === '/api/images') {
      const id = url.searchParams.get('id') ?? ''
      if (request.method() === 'PUT') {
        this.images.set(id, { mime: request.headers()['content-type'] ?? 'image/webp', data: request.postDataBuffer() ?? Buffer.alloc(0) })
        return this.json(route, 200, { ok: true })
      }
      const found = this.images.get(id)
      if (!found) return this.json(route, 404, { error: 'not_found' })
      return route.fulfill({ status: 200, contentType: found.mime, body: found.data })
    }

    return this.json(route, 404, { error: 'not_found' })
  }

  /** Makes every API request from this browser window go to this fake server. */
  async attach(context: BrowserContext) {
    await context.route('**/api/**', (route) => void this.handle(route))
  }

  /** Puts a folder on the server, as if created on another device. Returns its id. */
  async addFolder(name: string): Promise<string> {
    const id = crypto.randomUUID()
    await processOp(this.store, { opId: crypto.randomUUID(), entity: 'folder', id, kind: 'upsert', baseRev: null, fields: { name } })
    return id
  }

  /** Puts a note on the server, as if created on another device. Returns its id. */
  async addNote(title: string, body: string, options: { folderId?: string; tagIds?: string[]; pinned?: boolean } = {}): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()
    await processOp(this.store, {
      opId: crypto.randomUUID(),
      entity: 'note',
      id,
      kind: 'upsert',
      baseRev: null,
      fields: {
        title,
        contentText: body,
        content: { type: 'doc', content: body.split('\n').map((line) => (line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' })) },
        folderId: options.folderId ?? null,
        tagIds: options.tagIds ?? [],
        pinned: options.pinned ?? false,
        pinnedAt: options.pinned ? now : null,
        createdAt: now,
        updatedAt: now,
      },
    })
    return id
  }

  /** All notes currently stored on the "server". */
  async notes() {
    const page = await this.store.changesSince(0, 10_000)
    return page.records.filter((r) => r.entity === 'note').map((r) => r.row)
  }
}
