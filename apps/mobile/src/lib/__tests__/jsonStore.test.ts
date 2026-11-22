import { createJsonStore } from '../jsonStore'

describe('the JSON store', () => {
  const store = createJsonStore<{ n: number } | null>('test-json-store', (stored) =>
    stored && typeof stored === 'object' ? (stored as { n: number }) : null,
  )

  it('reads back the very object it was given, so React can skip what did not change', () => {
    const value = { n: 1 }
    store.set('a', value)
    expect(store.get('a')).toBe(value)
    expect(store.get('a')).toBe(store.get('a'))
  })

  it('removes a key written as null, and parses nothing into the fallback', () => {
    store.set('b', { n: 2 })
    store.set('b', null)
    expect(store.get('b')).toBeNull()
    expect(store.get('never-written')).toBeNull()
  })
})

describe('on a full disk', () => {
  const mmkv = jest.requireMock('react-native-mmkv') as { __failWrites: (on: boolean) => void }
  afterEach(() => mmkv.__failWrites(false))

  const parse = (stored: unknown) =>
    stored && typeof stored === 'object' ? (stored as { n: number }) : null

  it('throws by default, so a workout cannot look saved when it is not', () => {
    const store = createJsonStore<{ n: number } | null>('test-json-store-strict', parse)
    mmkv.__failWrites(true)
    expect(() => store.set('a', { n: 3 })).toThrow(/MMKV/)
    expect(store.get('a')).toBeNull()
  })

  it('keeps the value for this run instead of throwing, when made best effort', () => {
    // MMKV throws from `set` when the phone has no room left, and these callers
    // run in timers and mutation callbacks, where a throw is a crash or a failed save.
    const store = createJsonStore<{ n: number } | null>('test-json-store-full', parse, {
      bestEffort: true,
    })
    mmkv.__failWrites(true)
    expect(() => store.set('a', { n: 3 })).not.toThrow()
    expect(store.get('a')).toEqual({ n: 3 })
    expect(() => store.set('a', null)).not.toThrow()
    expect(store.get('a')).toBeNull()
  })
})
