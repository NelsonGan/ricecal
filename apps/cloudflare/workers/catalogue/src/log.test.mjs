import assert from 'node:assert/strict'
import test from 'node:test'
import worker from './index.ts'

/**
 * A D1 error as Workers Logs printed it: its stack is only the frames, so a log
 * line of the error object said where a query failed and never why. Seen on
 * 2026-11-24 and 2026-11-25 as "catalogue worker     at
 * D1DatabaseSessionAlwaysPrimary._sendOrThrow ..." beside a 500.
 */
function d1Error() {
  const error = new Error('D1_ERROR: no such table: food: SQLITE_ERROR')
  error.stack =
    '    at D1DatabaseSessionAlwaysPrimary._sendOrThrow (cloudflare-internal:d1-api:191:19)'
  return error
}

test('a failed query logs what D1 said, not only where', async (t) => {
  const lines = []
  t.mock.method(console, 'error', (...args) => lines.push(args))
  const env = {
    CATALOGUE_TOKEN: 'service-token',
    DB: {
      prepare() {
        throw d1Error()
      },
    },
  }
  const request = new Request('https://catalogue.example/health', {
    headers: { authorization: 'Bearer service-token' },
  })

  const response = await worker.fetch(request, env, {})

  assert.equal(response.status, 500)
  const text = lines
    .flat()
    .filter((part) => typeof part === 'string')
    .join(' ')
  assert.match(text, /D1_ERROR: no such table: food: SQLITE_ERROR/)
})
