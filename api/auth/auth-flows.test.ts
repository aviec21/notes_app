import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeRecoveryCode, RECOVERY_ALPHABET } from '../../shared/config.js'
import { runMigrations } from '../_lib/migrations.js'
import { hashPin } from '../_lib/pinhash.js'

// The real database code runs against a real (in-process) Postgres, so these tests cover the
// actual SQL: the lockout counter, the session version, and the atomic use of a recovery code.
vi.mock('../_lib/db.js', async () => {
  const pg = new PGlite()
  const run = async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as Record<string, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  await runMigrations(run)
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      run(strings.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ''), ''), values),
    { query: run },
  )
  return { db: async () => sql }
})

import { db } from '../_lib/db.js'
import { GET as me } from './me.js'
import { POST as login } from './login.js'
import { POST as changePin } from './pin.js'
import { POST as createRecovery } from './recovery.js'
import { POST as resetPin } from './reset.js'

const URL_BASE = 'https://notes.test/api/auth/'

async function call(
  handler: (request: Request) => Promise<Response> | Response,
  options: { body?: unknown; cookie?: string; method?: string } = {},
) {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST')
  const res = await handler(
    new Request(`${URL_BASE}x`, {
      method,
      headers: { 'content-type': 'application/json', ...(options.cookie ? { cookie: options.cookie } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
  )
  const cookie = res.headers.get('set-cookie')?.split(';')[0]
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any>, cookie } // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function signIn(pin = '123456') {
  const res = await call(login, { body: { pin } })
  expect(res.status).toBe(200)
  return res.cookie!
}

/** Signs in with the PIN and creates a recovery code; returns the code and the session. */
async function withRecoveryCode(pin = '123456') {
  const cookie = await signIn(pin)
  const res = await call(createRecovery, { cookie, body: { pin } })
  expect(res.status).toBe(200)
  return { code: res.body.code as string, cookie }
}

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-secret-'.padEnd(48, 'x')
})

beforeEach(async () => {
  const sql = await db()
  await sql`DELETE FROM auth_pin`
  await sql`INSERT INTO auth_pin (id, pin_hash, is_default) VALUES (1, ${await hashPin('123456')}, true)`
})

describe('signing in with the PIN', () => {
  it('accepts the right PIN and rejects a wrong one', async () => {
    expect((await call(login, { body: { pin: '654321' } })).status).toBe(401)
    expect((await call(login, { body: { pin: '123456' } })).status).toBe(200)
  })

  it('reports the session, that the default PIN is in use, and that no recovery code exists yet', async () => {
    const cookie = await signIn()
    const res = await call(me, { cookie })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ defaultPin: true, hasRecovery: false })
    expect((await call(me)).status).toBe(401) // no cookie, no access
  })

  it('locks after five wrong PINs, and even the right PIN is refused while locked', async () => {
    for (let i = 0; i < 5; i++) expect((await call(login, { body: { pin: '000000' } })).status).toBe(401)
    const locked = await call(login, { body: { pin: '123456' } })
    expect(locked.status).toBe(429)
    expect(locked.body.retryAfter).toBeGreaterThan(0)
    expect(locked.body.retryAfter).toBeLessThanOrEqual(60)
  })

  it('forgets earlier wrong guesses after a correct sign-in', async () => {
    for (let i = 0; i < 4; i++) await call(login, { body: { pin: '000000' } })
    await signIn()
    for (let i = 0; i < 4; i++) expect((await call(login, { body: { pin: '000000' } })).status).toBe(401) // not locked yet
  })
})

describe('changing the PIN', () => {
  it('needs the current PIN, refuses the default as a new PIN, and signs out other devices', async () => {
    const phone = await signIn()
    const laptop = await signIn()

    expect((await call(changePin, { cookie: phone, body: { currentPin: '999999', newPin: '246810' } })).status).toBe(401)
    expect((await call(changePin, { cookie: phone, body: { currentPin: '123456', newPin: '123456' } })).status).toBe(400)

    const changed = await call(changePin, { cookie: phone, body: { currentPin: '123456', newPin: '246810' } })
    expect(changed.status).toBe(200)
    expect((await call(me, { cookie: changed.cookie! })).body.defaultPin).toBe(false)
    expect((await call(me, { cookie: laptop })).status).toBe(401) // the other device is signed out
    expect((await call(login, { body: { pin: '123456' } })).status).toBe(401) // the old PIN is gone
    expect((await call(login, { body: { pin: '246810' } })).status).toBe(200)
  })
})

describe('the recovery code', () => {
  it('is created only by someone signed in who also knows the PIN', async () => {
    const cookie = await signIn()
    expect((await call(createRecovery, { body: { pin: '123456' } })).status).toBe(401) // not signed in
    expect((await call(createRecovery, { cookie, body: { pin: '000000' } })).status).toBe(401) // wrong PIN
    expect((await call(createRecovery, { cookie, body: {} })).status).toBe(401)

    const ok = await call(createRecovery, { cookie, body: { pin: '123456' } })
    expect(ok.status).toBe(200)
    expect(ok.body.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
    expect((await call(me, { cookie })).body.hasRecovery).toBe(true)
  })

  it('never contains look-alike characters, and is different every time', async () => {
    const cookie = await signIn()
    const codes = new Set<string>()
    for (let i = 0; i < 12; i++) {
      const { body } = await call(createRecovery, { cookie, body: { pin: '123456' } })
      codes.add(body.code)
      for (const ch of body.code.replace(/-/g, '')) expect(RECOVERY_ALPHABET).toContain(ch)
      expect(body.code).not.toMatch(/[01OIL]/)
    }
    expect(codes.size).toBe(12)
  })

  it('is stored only as a salted hash, never as the code itself', async () => {
    const { code } = await withRecoveryCode()
    const [row] = await (await db())`SELECT recovery_hash FROM auth_pin WHERE id = 1`
    expect(row.recovery_hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(row.recovery_hash).not.toContain(code.replace(/-/g, ''))
  })

  it('replacing it makes the old one useless', async () => {
    const first = await withRecoveryCode()
    const cookie = first.cookie
    const second = await call(createRecovery, { cookie, body: { pin: '123456' } })
    expect((await call(resetPin, { body: { recoveryCode: first.code, newPin: '135791' } })).status).toBe(401)
    expect((await call(resetPin, { body: { recoveryCode: second.body.code, newPin: '135791' } })).status).toBe(200)
  })
})

describe('resetting a forgotten PIN', () => {
  it('sets the new PIN, signs in, hands back a fresh code, and retires the old one', async () => {
    const { code, cookie: oldSession } = await withRecoveryCode()
    const res = await call(resetPin, { body: { recoveryCode: code, newPin: '482915' } })

    expect(res.status).toBe(200)
    expect(res.cookie).toBeTruthy() // signed in straight away
    expect(res.body.code).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/)
    expect(res.body.code).not.toBe(code)

    expect((await call(me, { cookie: res.cookie! })).body).toEqual({ defaultPin: false, hasRecovery: true })
    expect((await call(login, { body: { pin: '482915' } })).status).toBe(200)
    expect((await call(login, { body: { pin: '123456' } })).status).toBe(401) // the forgotten PIN no longer works
    expect((await call(me, { cookie: oldSession })).status).toBe(401) // earlier sessions are signed out
    expect((await call(resetPin, { body: { recoveryCode: code, newPin: '111222' } })).status).toBe(401) // one use only
    expect((await call(resetPin, { body: { recoveryCode: res.body.code, newPin: '333444' } })).status).toBe(200) // the new one works
  })

  it('accepts the code however it was typed', async () => {
    const { code } = await withRecoveryCode()
    const sloppy = code.toLowerCase().replace(/-/g, '  ')
    expect((await call(resetPin, { body: { recoveryCode: sloppy, newPin: '482915' } })).status).toBe(200)
  })

  it('rejects wrong, malformed and missing codes without saying which', async () => {
    await withRecoveryCode()
    for (const bad of ['AAAA-AAAA-AAAA-AAAA', 'short', '', 12345, null, 'A'.repeat(100), 'ABCD-EFGH-JKMN-PQR0']) {
      const res = await call(resetPin, { body: { recoveryCode: bad, newPin: '482915' } })
      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'invalid' })
    }
  })

  it('is refused when no recovery code was ever created', async () => {
    const res = await call(resetPin, { body: { recoveryCode: 'ABCD-EFGH-JKMN-PQRS', newPin: '482915' } })
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'invalid' }) // the same answer as a wrong code
  })

  it('will not set the default PIN or a badly formed one', async () => {
    const { code } = await withRecoveryCode()
    expect((await call(resetPin, { body: { recoveryCode: code, newPin: '123456' } })).status).toBe(400)
    expect((await call(resetPin, { body: { recoveryCode: code, newPin: '12' } })).status).toBe(400)
    expect((await call(resetPin, { body: { recoveryCode: code, newPin: 'abcdef' } })).status).toBe(400)
    // None of those used up the code.
    expect((await call(resetPin, { body: { recoveryCode: code, newPin: '482915' } })).status).toBe(200)
  })

  it('locks after repeated wrong codes, and the right code is refused while locked', async () => {
    const { code } = await withRecoveryCode()
    for (let i = 0; i < 5; i++) expect((await call(resetPin, { body: { recoveryCode: 'AAAA-AAAA-AAAA-AAAA', newPin: '482915' } })).status).toBe(401)
    const locked = await call(resetPin, { body: { recoveryCode: code, newPin: '482915' } })
    expect(locked.status).toBe(429)
    expect((await call(login, { body: { pin: '123456' } })).status).toBe(429) // the PIN is locked too
  })

  it('shares one guess counter with the PIN, so alternating cannot double the attempts', async () => {
    await withRecoveryCode()
    for (let i = 0; i < 3; i++) await call(login, { body: { pin: '000000' } })
    for (let i = 0; i < 2; i++) await call(resetPin, { body: { recoveryCode: 'AAAA-AAAA-AAAA-AAAA', newPin: '482915' } })
    expect((await call(login, { body: { pin: '123456' } })).status).toBe(429) // five failures in total
  })

  it('lets only one of two simultaneous requests use the same code', async () => {
    const { code } = await withRecoveryCode()
    const results = await Promise.all([
      call(resetPin, { body: { recoveryCode: code, newPin: '482915' } }),
      call(resetPin, { body: { recoveryCode: code, newPin: '915284' } }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 401])
    const winner = results.find((r) => r.status === 200)!
    expect((await call(me, { cookie: winner.cookie! })).status).toBe(200)
  })
})

describe('recovery code format helpers', () => {
  it('normalise typing variations and reject impossible codes', () => {
    expect(normalizeRecoveryCode('k7qm-2xpd-9hrt-4wnb')).toBe('K7QM2XPD9HRT4WNB')
    expect(normalizeRecoveryCode(' K7QM 2XPD 9HRT 4WNB ')).toBe('K7QM2XPD9HRT4WNB')
    expect(normalizeRecoveryCode('K7QM-2XPD-9HRT')).toBeNull() // too short
    expect(normalizeRecoveryCode('K7QM-2XPD-9HRT-4WN0')).toBeNull() // 0 is not in the alphabet
    expect(normalizeRecoveryCode(42)).toBeNull()
  })
})
