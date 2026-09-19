import { clearedSessionCookie } from '../_lib/session.js'

export function POST(request: Request) {
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': clearedSessionCookie(request), 'Cache-Control': 'no-store' },
  })
}
