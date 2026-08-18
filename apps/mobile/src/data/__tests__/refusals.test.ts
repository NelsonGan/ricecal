// `refusals` reaches for the router to open the paywall, and importing
// expo-router for real pulls the whole native stack navigator into a suite that
// only wants to parse a response body. Same shape as every other test here that
// touches navigation.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

import { NotEntitledError, refusalFrom, ScanLimitError } from '../refusals'

/**
 * Reading a refusal off the wire.
 *
 * The shape is awkward and that is why this is worth a test: supabase-js turns
 * a non-2xx into an error with `data: null` and hides the body — the part that
 * says WHICH refusal it was — behind a `Response` hanging off the error. Get
 * this wrong in either direction and the symptom is far from the cause: a
 * refusal read as an ordinary failure is a scan that "just failed", and an
 * ordinary failure read as a refusal tells somebody in a tunnel that they are
 * out of scans.
 */

const failure = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: new Response(JSON.stringify(body), { status }),
})

describe('refusalFrom', () => {
  it('reads a spent daily allowance, and whether there is anything to sell', async () => {
    const free = await refusalFrom(
      failure(429, { code: 'scan_limit', used: 3, limit: 3, entitled: false }),
    )
    expect(free).toBeInstanceOf(ScanLimitError)
    expect((free as ScanLimitError).limit).toBe(3)
    // The half that decides the message. A subscriber at the ceiling has
    // nothing to buy, and must not be shown a paywall.
    expect((free as ScanLimitError).entitled).toBe(false)

    const pro = await refusalFrom(
      failure(429, { code: 'scan_limit', used: 50, limit: 50, entitled: true }),
    )
    expect((pro as ScanLimitError).entitled).toBe(true)
  })

  it('still reads the old code, for the hour between the two deploys', async () => {
    // The server ships before the bundle does. An app on a phone meeting
    // `scan_limit` it has never heard of would answer a paywall-worthy refusal
    // with a generic "scan failed", so the name it used to have is accepted.
    const legacy = await refusalFrom(failure(429, { code: 'ai_limit', used: 3, limit: 3 }))
    expect(legacy).toBeInstanceOf(ScanLimitError)
  })

  it('reads a Pro-only feature, and keeps the name the server gave it', async () => {
    const refusal = await refusalFrom(failure(402, { code: 'not_entitled', feature: 'describe' }))
    expect(refusal).toBeInstanceOf(NotEntitledError)
    expect((refusal as NotEntitledError).feature).toBe('describe')
  })

  it('drops a feature name it does not recognise', async () => {
    // The funnel is a fixed set of triggers. A name from a newer server than
    // this bundle is null rather than a string nobody can group by.
    const refusal = await refusalFrom(failure(402, { code: 'not_entitled', feature: 'teleport' }))
    expect((refusal as NotEntitledError).feature).toBeNull()
  })

  it('is null for everything that is not a refusal', async () => {
    // The common answers, and every one of them must stay an ordinary failure.
    expect(await refusalFrom(new Error('network request failed'))).toBeNull()
    expect(await refusalFrom(failure(401, { error: 'not signed in' }))).toBeNull()
    expect(await refusalFrom(failure(500, { error: 'boom' }))).toBeNull()
    // A 4xx this app does use, carrying something that is not one of the two
    // codes: still not a refusal.
    expect(await refusalFrom(failure(402, { error: 'no' }))).toBeNull()
  })

  it('is null for a refusal status with an unreadable body', async () => {
    expect(await refusalFrom({ context: new Response('<html>', { status: 429 }) })).toBeNull()
  })
})
