import { deleteAccount } from '../auth'

/**
 * Deleting an account, from the phone's side.
 *
 * The server does the deleting; this half decides what happens around it, and
 * every case here is one where getting it wrong is invisible on a happy path.
 *
 * A sign-out that runs before the server has answered signs somebody out of an
 * account that still exists. A sign-out with the default scope asks GoTrue to
 * end the sessions of a user it can no longer find, which fails, on a screen
 * whose work actually succeeded. And the event and the analytics-profile delete
 * are filed against whichever identity the SDK is holding, so either of them
 * arriving after the sign-out lands on an anonymous profile and leaves the real
 * one, address and all, exactly where it was.
 */

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}))

jest.mock('expo-linking', () => ({ createURL: (path: string) => `ricecal://${path}` }))
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'ricecal' } },
}))

/** What happened, in order. The ordering is most of what is asserted here. */
const calls: string[] = []

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: jest.fn() },
    auth: { signOut: jest.fn() },
  },
}))

jest.mock('@/lib/analytics', () => ({
  track: (event: string) => calls.push(`track:${event}`),
  forgetPerson: () => calls.push('forgetPerson'),
}))

const { supabase } = require('@/lib/supabase') as {
  supabase: {
    functions: { invoke: jest.Mock }
    auth: { signOut: jest.Mock }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  calls.length = 0
  supabase.auth.signOut.mockImplementation((options?: { scope?: string }) => {
    calls.push(`signOut:${options?.scope ?? 'global'}`)
    return Promise.resolve({ error: null })
  })
})

it('deletes on the server, then signs out locally', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: { ok: true, photos: 3 }, error: null })

  await deleteAccount()

  expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', {
    body: { confirm: true },
  })
  // `local`, because there is no session left on the server to revoke.
  expect(calls).toEqual(['track:Account Deleted', 'forgetPerson', 'signOut:local'])
})

/**
 * The transport failure: the function answered 4xx or 5xx, which `invoke`
 * reports as an error with a body it has not read.
 */
it('leaves the session alone when the request fails', async () => {
  supabase.functions.invoke.mockResolvedValue({ data: null, error: new Error('502') })

  await expect(deleteAccount()).rejects.toThrow('502')
  expect(calls).toEqual([])
})

/**
 * The other one, and the reason both are checked: a 200 whose body says no.
 * Read on the transport error alone, this signs somebody out of an account
 * that is still there and tells them it is gone.
 */
it('leaves the session alone when the function refuses', async () => {
  supabase.functions.invoke.mockResolvedValue({
    data: { ok: false, error: 'storage is not configured on this deployment' },
    error: null,
  })

  await expect(deleteAccount()).rejects.toThrow('storage is not configured on this deployment')
  expect(calls).toEqual([])
})
