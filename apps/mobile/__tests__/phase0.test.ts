import { APP_NAME, SCHEMA_VERSION } from '@ricecal/shared'

import { isConfigured, PLACEHOLDER } from '@/lib/env'

// The point of these is the harness, not the assertions: if this file runs at
// all, jest-expo, the workspace link, and the @/ path alias all resolved.

describe('workspace resolution', () => {
  it('imports from @ricecal/shared', () => {
    expect(APP_NAME).toBe('RiceCal')
    expect(SCHEMA_VERSION).toBe('1')
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
