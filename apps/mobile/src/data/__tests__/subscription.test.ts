import { isEntitledRow } from '../subscription'

/**
 * The client's copy of the entitlement rule.
 *
 * It decides what every gated button does, and the server enforces the same
 * rule independently in `entitledBy`. The two cannot import each other across
 * the Deno / React Native line, so they are two copies — and these are
 * deliberately the same cases as `functions/_shared/entitlement.test.ts`, so a
 * change made to one and not the other fails here or there rather than showing
 * up as a screen that offers something the server then refuses.
 */

const NOW = new Date('2026-08-18T00:00:00Z')
const LATER = '2026-09-18T00:00:00Z'
const EARLIER = '2026-07-18T00:00:00Z'

describe('isEntitledRow', () => {
  it('unlocks a running period on an entitled status', () => {
    expect(isEntitledRow({ status: 'active', current_period_end: LATER }, NOW)).toBe(true)
    expect(isEntitledRow({ status: 'trial', current_period_end: LATER }, NOW)).toBe(true)
  })

  it('refuses an expiry in the past, whatever the status claims', () => {
    // A row goes on SAYING `active` after an ending that never reached us. Read
    // on the status alone the app unlocks itself for ever; read with the date,
    // only until the period somebody actually paid for.
    expect(isEntitledRow({ status: 'active', current_period_end: EARLIER }, NOW)).toBe(false)
    expect(isEntitledRow({ status: 'trial', current_period_end: EARLIER }, NOW)).toBe(false)
  })

  it('treats no expiry as lifetime rather than as expired', () => {
    // Lifetime renews never, so there is no date to hold it up. Read the other
    // way round this would refuse the one plan that cannot lapse.
    expect(isEntitledRow({ status: 'active', current_period_end: null }, NOW)).toBe(true)
    expect(isEntitledRow({ status: 'active' }, NOW)).toBe(true)
  })

  it('keeps out the statuses that are not entitlement', () => {
    expect(isEntitledRow({ status: 'expired', current_period_end: LATER }, NOW)).toBe(false)
    expect(isEntitledRow({ status: 'billing_retry', current_period_end: LATER }, NOW)).toBe(false)
    expect(isEntitledRow({ status: 'none' }, NOW)).toBe(false)
  })

  it('reads a missing row as "not subscribed" rather than as an error', () => {
    // The ordinary state for most accounts, and what the query returns before
    // anybody has ever bought anything.
    expect(isEntitledRow(null, NOW)).toBe(false)
    expect(isEntitledRow(undefined, NOW)).toBe(false)
    expect(isEntitledRow({}, NOW)).toBe(false)
  })

  it('refuses at the boundary rather than granting one last tap', () => {
    expect(isEntitledRow({ status: 'active', current_period_end: NOW.toISOString() }, NOW)).toBe(
      false,
    )
  })
})
