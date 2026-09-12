import { ga4EventName, ga4EventParameters, ga4UserProperties } from '../ga4'

describe('the GA4 shape', () => {
  it('maps product events into a namespaced valid event name', () => {
    expect(ga4EventName('Onboarding Step Completed')).toBe('ricecal_onboarding_step_completed')
    expect(ga4EventName('x'.repeat(100))).toHaveLength(40)
    expect(ga4EventName('')).toBe('ricecal_event')
  })

  it('keeps supported values and bounds the GA4 parameter shape', () => {
    const properties = ga4EventParameters({
      enabled: true,
      disabled: false,
      duration_ms: 123,
      changed: ['portion', 'calories'],
      long: 'x'.repeat(120),
      missing: undefined,
      invalid: Number.NaN,
    })

    expect(properties).toEqual({
      enabled: 1,
      disabled: 0,
      duration_ms: 123,
      changed: 'portion,calories',
      long: 'x'.repeat(100),
    })

    const many = ga4EventParameters(
      Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`property_${index}`, index])),
    )
    expect(Object.keys(many)).toHaveLength(25)
  })

  it('never sends email and can clear a stale user property', () => {
    expect(
      ga4UserProperties({
        $email: 'person@example.com',
        email: 'person@example.com',
        onboarded: true,
        health_provider: null,
        onboarded_at: 'x'.repeat(50),
      }),
    ).toEqual({
      onboarded: 'true',
      health_provider: null,
      onboarded_at: 'x'.repeat(36),
    })
  })

  it('moves reserved property prefixes into the RiceCal namespace', () => {
    expect(ga4EventParameters({ ga_test: 1, firebase_test: 2, google_test: 3 })).toEqual({
      ricecal_ga_test: 1,
      ricecal_firebase_test: 2,
      ricecal_google_test: 3,
    })
  })
})
