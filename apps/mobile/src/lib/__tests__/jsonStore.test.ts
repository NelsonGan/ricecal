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
