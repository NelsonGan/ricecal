import { SCHEMA_VERSION } from '@ricecal/shared'

import { isConfigured, PLACEHOLDER } from '@/lib/env'

// The point of these is the harness, not the assertions: if this file runs at
// all, jest-expo, the workspace link, and the @/ path alias all resolved.

describe('workspace resolution', () => {
  it('imports from @ricecal/shared', () => {
    // Not pinned to a number: SCHEMA_VERSION is a cache buster and is SUPPOSED
    // to change whenever a persisted shape does. Asserting today's value would
    // make a deliberate bump look like a regression.
    expect(SCHEMA_VERSION).toMatch(/^\d+$/)
  })
})

describe('env placeholder handling', () => {
  it('treats the sentinel as not-yet-provisioned', () => {
    expect(isConfigured(PLACEHOLDER)).toBe(false)
  })

  it('treats a real value as configured', () => {
    expect(isConfigured('sb_publishable_realvalue')).toBe(true)
  })
})
