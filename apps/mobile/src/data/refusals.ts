/**
 * The two ways the server refuses to reach the model, read back off the wire.
 *
 * Both arrive as an HTTP status with a `code` in the body, which is the one
 * shape supabase-js makes awkward: a non-2xx turns into a `FunctionsHttpError`
 * with `data` null, and the body — the part that says WHICH refusal — is only
 * reachable through the response hanging off the error. Every caller that
 * needs to tell "you have not paid" from "you have used it all up" would
 * otherwise reimplement that, so it is done once here.
 *
 * These exist as classes rather than as a string union because they travel
 * through `.catch()` handlers alongside timeouts and dropped connections, and
 * `instanceof` is the only test that stays honest when an error has been
 * through a promise chain.
 */

/** The account is not subscribed. The answer is the paywall. */
export class NotEntitledError extends Error {
  constructor() {
    super('This account is not subscribed')
    this.name = 'NotEntitledError'
  }
}

/**
 * The account has spent its monthly allowance of model requests.
 *
 * Nothing the user can buy fixes this, which is why it is a toast asking them
 * to get in touch rather than another paywall.
 */
export class AiLimitError extends Error {
  readonly used: number
  readonly limit: number

  constructor(used: number, limit: number) {
    super('Monthly AI limit reached')
    this.name = 'AiLimitError'
    this.used = used
    this.limit = limit
  }
}

type RefusalBody = { code?: string; used?: number; limit?: number }

/**
 * Turns a failed `functions.invoke` into one of the two refusals, or null when
 * it is an ordinary failure.
 *
 * Null is the common answer and callers must keep their existing handling for
 * it: a timeout and a dropped connection are not refusals, and treating them
 * as one would tell somebody they were out of budget because their train went
 * into a tunnel.
 */
export async function refusalFrom(error: unknown): Promise<NotEntitledError | AiLimitError | null> {
  const response = (error as { context?: unknown })?.context
  if (!(response instanceof Response)) return null
  // 402 and 429 are the only two statuses these endpoints use for a refusal.
  // Reading the body of everything else would be a wasted parse on the far
  // more common 401.
  if (response.status !== 402 && response.status !== 429) return null

  let body: RefusalBody
  try {
    // `clone` because the caller's own error handling may read it too, and a
    // Response body can only be consumed once.
    body = (await response.clone().json()) as RefusalBody
  } catch {
    return null
  }

  if (body.code === 'not_entitled') return new NotEntitledError()
  if (body.code === 'ai_limit') {
    return new AiLimitError(Number(body.used ?? 0), Number(body.limit ?? 0))
  }
  return null
}
