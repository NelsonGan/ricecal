// Bound streamed input even when a client omits Content-Length.
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!body) throw new Error('missing body')
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error('body is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** A JSON answer. Every function speaks `{ ok, … }` with the status beside it. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/**
 * A response that cannot be cut off by the caller's idle timeout.
 *
 * Most answers come back in milliseconds and are sent as they are, status and
 * all. One that is still being worked on after `graceMs` is answered at once
 * as a 200 JSON stream that writes a space every few seconds and then the
 * answer: leading whitespace is valid JSON, and a phone's request only times
 * out when nothing arrives for a minute (React Native's default on iOS), which
 * a model watching a long video could otherwise outlast while the recipe was
 * still being written for the user. The late answer keeps its `code` in the
 * body; it loses only its status, which is why callers read the code.
 */
export async function respondWithin(
  work: Promise<Response>,
  graceMs = 5000,
  heartbeatMs = 8000,
): Promise<Response> {
  // A failure is answered the same way however soon it comes: as the code the
  // app reads, never as the runtime's opaque 500.
  const failed = () => json({ ok: false, code: 'failed' })
  const settled = work.catch((error) => {
    console.error('[respondWithin]', error)
    return failed()
  })
  const early = await Promise.race([
    settled,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs)),
  ])
  if (early) return early

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const beat = setInterval(() => controller.enqueue(encoder.encode(' ')), heartbeatMs)
      try {
        const done = await settled
        controller.enqueue(encoder.encode(await done.text()))
      } catch {
        controller.enqueue(encoder.encode(JSON.stringify({ ok: false, code: 'failed' })))
      } finally {
        clearInterval(beat)
        controller.close()
      }
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } })
}
