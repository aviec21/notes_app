import { db } from './_lib/db.js'
import { json } from './_lib/http.js'
import { readSession } from './_lib/session.js'

const MAX_BYTES = 3_000_000
const ALLOWED = ['image/webp', 'image/jpeg', 'image/png', 'image/gif']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function idFrom(request: Request): string | null {
  const id = new URL(request.url).searchParams.get('id')
  return id && UUID.test(id) ? id : null
}

// Stores one picture. Re-sending the same id is harmless.
export async function PUT(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)
    const id = idFrom(request)
    if (!id) return json({ error: 'invalid' }, 400)

    const noteId = new URL(request.url).searchParams.get('noteId')
    const mime = (request.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!ALLOWED.includes(mime)) return json({ error: 'unsupported_type' }, 415)

    const data = Buffer.from(await request.arrayBuffer())
    if (data.length === 0) return json({ error: 'empty' }, 400)
    if (data.length > MAX_BYTES) return json({ error: 'too_large' }, 413)

    const sql = await db()
    await sql`
      INSERT INTO images (id, note_id, mime, size, data)
      VALUES (${id}::uuid, ${noteId && UUID.test(noteId) ? noteId : null}::uuid, ${mime}, ${data.length}, ${data})
      ON CONFLICT (id) DO NOTHING`
    return json({ ok: true })
  } catch (err) {
    console.error('Image upload failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}

// Returns the picture itself. Private: only a signed-in session can read it.
export async function GET(request: Request) {
  try {
    if (!(await readSession(request))) return json({ error: 'unauthorized' }, 401)
    const id = idFrom(request)
    if (!id) return json({ error: 'invalid' }, 400)

    const sql = await db()
    const [row] = await sql`SELECT mime, data FROM images WHERE id = ${id}::uuid`
    if (!row) return json({ error: 'not_found' }, 404)

    const data = row.data as Buffer | Uint8Array
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': String(row.mime),
        // The bytes for an id never change, so a device may keep it; but it stays private.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Image fetch failed:', err instanceof Error ? err.message : err)
    return json({ error: 'server' }, 500)
  }
}
