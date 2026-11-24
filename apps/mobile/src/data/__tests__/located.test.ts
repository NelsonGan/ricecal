import { fetchLocated } from '../located'

/** What PostgREST does with any read: `max_rows` in config.toml. */
const MAX_ROWS = 1000

type Row = { id: string; latitude: number; longitude: number; location_name: string }

let mockRows: Row[] = []
const mockRanges: Array<[number, number]> = []

jest.mock('@/lib/supabase', () => {
  const builder = () => {
    let range: [number, number] | null = null
    let limit: number | null = null
    const chain = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      order: () => chain,
      limit: (n: number) => {
        limit = n
        return chain
      },
      range: (from: number, to: number) => {
        range = [from, to]
        mockRanges.push(range)
        return chain
      },
      overrideTypes: () => chain,
      // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited
      then: (resolve: (value: unknown) => unknown) => {
        const [from, to] = range ?? [0, (limit ?? Number.POSITIVE_INFINITY) - 1]
        const data = mockRows.slice(from, Math.min(to + 1, from + MAX_ROWS))
        return Promise.resolve({
          data,
          error: null,
          count: null,
          status: 200,
          statusText: '',
        }).then(resolve)
      },
    }
    return chain
  }
  return { supabase: { from: builder } }
})
jest.mock('../session', () => ({ useUserId: () => 'me' }))
jest.mock('../mappers', () => ({
  ...jest.requireActual('../mappers'),
  toEntry: (row: Row) => ({
    id: row.id,
    location: { latitude: row.latitude, longitude: row.longitude, name: row.location_name },
  }),
}))

const tagged = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    latitude: 3.1,
    longitude: 101.6,
    location_name: i < 1000 ? 'Newer place' : 'Older place',
  }))

beforeEach(() => {
  mockRanges.length = 0
})

// PostgREST answers 1,000 rows whatever `.limit` asks, so the 1,001st tagged
// meal, and every place only it was eaten at, never reached the food map.
it('reads past the server row cap, up to its own limit', async () => {
  mockRows = tagged(1500)
  const entries = await fetchLocated('me')
  expect(entries).toHaveLength(1500)
  expect(entries.some((e) => e.location.name === 'Older place')).toBe(true)
})

it('stops at 2,000 however many there are', async () => {
  mockRows = tagged(2600)
  const entries = await fetchLocated('me')
  expect(entries).toHaveLength(2000)
  expect(mockRanges.at(-1)).toEqual([1000, 1999])
})

it('asks once more and stops when a short account runs out', async () => {
  mockRows = tagged(19)
  expect(await fetchLocated('me')).toHaveLength(19)
  expect(mockRanges).toEqual([
    [0, 999],
    [19, 1018],
  ])
})
