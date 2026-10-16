import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { forgetOutbox, getOutbox, type WorkoutDocument } from '../workout-outbox'
import { SAVE_TIMEOUT_MS, useDeleteWorkout, useSaveWorkout } from '../workouts'

/**
 * The paths a finished workout takes to the server. Each one decides whether
 * a workout somebody did survives a bad connection, so each is pinned here:
 * the copy on the phone stays until the server has answered, a refusal takes
 * it out, and a delete cannot be undone by a queued copy sent behind it.
 */

type Reply = { error: { code?: string; message: string } | null }
let mockSave: () => Promise<Reply>
const mockDelete = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: () => ({ abortSignal: () => mockSave() }),
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => mockDelete() }) }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}))
jest.mock('../session', () => ({ useUserId: () => 'lifter' }))
jest.mock('@/features/workouts/health', () => ({ removeWorkoutFromHealth: jest.fn() }))
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }))

const document: WorkoutDocument = {
  id: 'workout-1',
  name: 'Push day',
  notes: null,
  started_at: '2026-10-16T01:00:00.000Z',
  ended_at: '2026-10-16T02:00:00.000Z',
  log_date: '2026-10-16',
  routine_id: null,
  kcal: null,
  health_workout_id: null,
  exercises: [],
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const queued = () => getOutbox('lifter').map((entry) => entry.id)

beforeEach(() => {
  jest.useRealTimers()
  onlineManager.setOnline(true)
  mockDelete.mockReset()
  mockSave = async () => ({ error: null })
})

afterEach(() => {
  forgetOutbox('lifter')
})

it('takes a saved workout off the phone once the server has it', async () => {
  const { wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveWorkout, { wrapper })
  let answer: unknown
  await act(async () => {
    answer = await result.current.mutateAsync(document)
  })
  expect(answer).toEqual({ queued: false })
  expect(queued()).toEqual([])
  await unmount()
})

it('keeps the workout on the phone when offline, without sending it', async () => {
  onlineManager.setOnline(false)
  const send = jest.fn(mockSave)
  mockSave = send
  const { wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveWorkout, { wrapper })
  let answer: unknown
  await act(async () => {
    answer = await result.current.mutateAsync(document)
  })
  expect(answer).toEqual({ queued: true })
  expect(send).not.toHaveBeenCalled()
  expect(queued()).toEqual([document.id])
  await unmount()
})

it('keeps the workout on the phone when the connection drops mid-save', async () => {
  mockSave = async () => ({ error: { message: 'Network request failed' } })
  const { wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveWorkout, { wrapper })
  let answer: unknown
  await act(async () => {
    answer = await result.current.mutateAsync(document)
  })
  expect(answer).toEqual({ queued: true })
  expect(queued()).toEqual([document.id])
  await unmount()
})

it('throws a refusal and leaves nothing queued, so the finish screen can say why', async () => {
  mockSave = async () => ({ error: { code: '23514', message: 'check violation' } })
  const { wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveWorkout, { wrapper })
  await act(async () => {
    await expect(result.current.mutateAsync(document)).rejects.toMatchObject({ code: '23514' })
  })
  expect(queued()).toEqual([])
  await unmount()
})

it('answers queued at the deadline, and clears the copy when the late reply lands', async () => {
  jest.useFakeTimers()
  let reply: ((value: Reply) => void) | undefined
  mockSave = () =>
    new Promise<Reply>((resolve) => {
      reply = resolve
    })
  const { wrapper } = setup()
  const { result, unmount } = await renderHook(useSaveWorkout, { wrapper })
  let answer: unknown
  await act(async () => {
    const saving = result.current.mutateAsync(document)
    await jest.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS)
    answer = await saving
  })
  expect(answer).toEqual({ queued: true })
  expect(queued()).toEqual([document.id])
  await act(async () => {
    reply?.({ error: null })
    await jest.advanceTimersByTimeAsync(0)
  })
  expect(queued()).toEqual([])
  await unmount()
})

it('takes a queued copy out before deleting, so a flush cannot bring it back', async () => {
  onlineManager.setOnline(false)
  const { wrapper } = setup()
  const save = await renderHook(useSaveWorkout, { wrapper })
  await act(async () => {
    await save.result.current.mutateAsync(document)
  })
  expect(queued()).toEqual([document.id])
  onlineManager.setOnline(true)

  let seenWhileDeleting: string[] | undefined
  mockDelete.mockImplementation(async () => {
    seenWhileDeleting = queued()
    return { error: null }
  })
  const remove = await renderHook(useDeleteWorkout, { wrapper })
  await act(async () => {
    await remove.result.current.mutateAsync(document.id)
  })
  expect(seenWhileDeleting).toEqual([])
  expect(queued()).toEqual([])
  await save.unmount()
  await remove.unmount()
})
