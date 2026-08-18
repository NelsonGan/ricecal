import { pruneHours } from '@/data/health-sync'

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn(), setPersonProps: jest.fn() }))
jest.mock('@/lib/health', () => ({ providerFor: jest.fn() }))

const { supabase } = require('@/lib/supabase') as { supabase: { from: jest.Mock } }

/**
 * The retention half of the hourly sync.
 *
 * Worth testing in isolation because the bug it fixes had no symptom: the
 * charts were right, the sync succeeded, and the only trace was a table growing
 * by 24 rows a day per connected user for rows nothing would read again. A
 * regression here would be just as quiet, so what these assert is the shape of
 * the statement rather than any behaviour the user could notice.
 */

const USER = '1f0c9a5e-0000-4000-8000-000000000001'
const RETAIN_FROM = '2026-07-19'

function deleteChain(result: { error: unknown } = { error: null }) {
  const lt = jest.fn().mockResolvedValue(result)
  const eq = jest.fn(() => ({ lt }))
  const remove = jest.fn(() => ({ eq }))
  supabase.from.mockReturnValue({ delete: remove })
  return { remove, eq, lt }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('pruneHours', () => {
  /**
   * Scoped to the user AND bounded by the date, in that order. Either filter
   * alone is a different statement: without the date it empties the chart the
   * sync has just drawn, and without the user it is a delete somebody else's
   * RLS policy is the only thing standing in front of.
   */
  it("deletes the caller's own rows from before the retention window", async () => {
    const chain = deleteChain()

    await pruneHours(USER, RETAIN_FROM)

    expect(supabase.from).toHaveBeenCalledWith('activity_hours')
    expect(chain.eq).toHaveBeenCalledWith('user_id', USER)
    // `lt`, never `lte`: the retention date is the oldest day the charts still
    // draw, so deleting it would make the window a day shallower than
    // `HOURLY_DAYS` claims — at the far edge of the scroll, where nobody looks.
    expect(chain.lt).toHaveBeenCalledWith('log_date', RETAIN_FROM)
  })

  /**
   * The sync has already written the user's activity by the time this runs.
   * Throwing would report a failed sync for a successful one, and the retry
   * would rewrite every day to arrive back at the same delete.
   */
  it('does not throw when the delete fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    deleteChain({ error: { message: 'nope' } })

    await expect(pruneHours(USER, RETAIN_FROM)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()

    warn.mockRestore()
  })
})
