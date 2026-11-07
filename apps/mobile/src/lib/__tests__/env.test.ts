// `env.ts` validates at import, so each case loads a fresh copy of it with the
// variables it wants and puts the originals back afterwards.
const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
})

function load(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  let mod: typeof import('../env') | undefined
  jest.isolateModules(() => {
    mod = require('../env')
  })
  return mod as typeof import('../env')
}

describe('env', () => {
  it('passes the values through untouched', () => {
    const { env } = load({ EXPO_PUBLIC_GA4_ENABLED: 'false', EXPO_PUBLIC_POSTHOG_DEV: '1' })
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe(original.EXPO_PUBLIC_SUPABASE_URL)
    expect(env.EXPO_PUBLIC_GA4_ENABLED).toBe('false')
    expect(env.EXPO_PUBLIC_POSTHOG_DEV).toBe('1')
  })

  it('leaves optional keys undefined when they are absent', () => {
    const { env } = load({
      EXPO_PUBLIC_RC_TEST_STORE_KEY: undefined,
      EXPO_PUBLIC_GA4_ENABLED: undefined,
      EXPO_PUBLIC_ANALYTICS_ENABLED: undefined,
      EXPO_PUBLIC_POSTHOG_DEV: undefined,
    })
    expect(env.EXPO_PUBLIC_RC_TEST_STORE_KEY).toBeUndefined()
    expect(env.EXPO_PUBLIC_GA4_ENABLED).toBeUndefined()
  })

  it('names every required key that is missing or empty', () => {
    expect(() =>
      load({ EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined, EXPO_PUBLIC_TURNSTILE_ORIGIN: '' }),
    ).toThrow(
      'Missing environment variables: EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_TURNSTILE_ORIGIN\n',
    )
  })

  it('refuses an optional key that is set to something it does not allow', () => {
    expect(() => load({ EXPO_PUBLIC_GA4_ENABLED: 'yes' })).toThrow('EXPO_PUBLIC_GA4_ENABLED')
    expect(() => load({ EXPO_PUBLIC_POSTHOG_DEV: 'true' })).toThrow('EXPO_PUBLIC_POSTHOG_DEV')
    expect(() => load({ EXPO_PUBLIC_RC_TEST_STORE_KEY: '' })).toThrow(
      'EXPO_PUBLIC_RC_TEST_STORE_KEY',
    )
  })
})
