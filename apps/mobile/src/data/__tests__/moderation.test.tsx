import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import { keys } from '../keys'
import { useBlockAuthor } from '../moderation'

const mockUpsert = jest.fn()
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }) },
}))
jest.mock('../session', () => ({ useUserId: () => 'viewer' }))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUpsert.mockResolvedValue({ error: null })
})

it('a recipe block clears social content and prevents an older read restoring it', async () => {
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed', { p_mode: 'following' })
  const profileKey = keys.socialRead('viewer', 'social_profile', { p_user_id: 'author' })
  const otherViewerKey = keys.socialRead('other-viewer', 'social_feed')
  const diaryKey = keys.day('viewer', '2026-09-22')
  const recipesKey = keys.recipes('viewer', 'community', '')
  client.setQueryData(feedKey, ['blocked post'])
  client.setQueryData(profileKey, { is_following: true })
  client.setQueryData(otherViewerKey, ['other viewer'])
  client.setQueryData(diaryKey, ['private meal'])
  client.setQueryData(recipesKey, ['recipe'])
  let resolveRead: ((rows: string[]) => void) | undefined
  let aborted = false
  const oldRead = client
    .fetchQuery({
      queryKey: feedKey,
      queryFn: ({ signal }) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return new Promise<string[]>((resolve) => {
          resolveRead = resolve
        })
      },
    })
    .catch(() => undefined)
  const { result, unmount } = await renderHook(useBlockAuthor, { wrapper })
  await act(async () => {
    await result.current.mutateAsync('author')
  })
  expect(mockUpsert).toHaveBeenCalledWith(
    { user_id: 'viewer', author_id: 'author' },
    { onConflict: 'user_id,author_id', ignoreDuplicates: true },
  )
  expect(aborted).toBe(true)
  expect(client.getQueryData(feedKey)).toBeUndefined()
  expect(client.getQueryData(profileKey)).toBeUndefined()
  resolveRead?.(['stale blocked post'])
  await oldRead
  expect(client.getQueryData(feedKey)).toBeUndefined()
  expect(client.getQueryData(otherViewerKey)).toEqual(['other viewer'])
  expect(client.getQueryData(diaryKey)).toEqual(['private meal'])
  expect(client.getQueryState(recipesKey)?.isInvalidated).toBe(true)
  await unmount()
  client.clear()
})

it('a refused recipe block preserves the existing social cache', async () => {
  mockUpsert.mockResolvedValue({ error: new Error('block refused') })
  const { client, wrapper } = setup()
  const feedKey = keys.socialRead('viewer', 'social_feed')
  client.setQueryData(feedKey, ['still visible'])
  const { result, unmount } = await renderHook(useBlockAuthor, { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync('author')).rejects.toThrow('block refused')
  })
  expect(client.getQueryData(feedKey)).toEqual(['still visible'])
  await unmount()
  client.clear()
})
