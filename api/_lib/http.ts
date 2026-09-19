/** Parses a JSON object body, or returns an empty object if it is missing or malformed. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function json(body: unknown, status = 200, headers?: Headers | Record<string, string>): Response {
  const merged = new Headers(headers)
  merged.set('Cache-Control', 'no-store')
  return Response.json(body, { status, headers: merged })
}
