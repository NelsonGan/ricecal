import { act, renderHook } from '@testing-library/react-native'

import { noteMealLoggedHere } from '@/lib/mealsLogged'

import { useMealLanded } from '../useMealLanded'

type Entry = { id: string; loggedAt: string; status?: string }

const at = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

async function setup(initial: Entry[], ready = true) {
  return await renderHook(
    ({ entries, day, isReady }: { entries: Entry[]; day: string; isReady: boolean }) =>
      useMealLanded(entries, day, isReady),
    { initialProps: { entries: initial, day: '2026-11-28', isReady: ready } },
  )
}

describe('useMealLanded', () => {
  it('ignores what was already on the day when it was first shown', async () => {
    const hook = await setup([{ id: 'a', loggedAt: at(1000) }])
    await hook.rerender({
      entries: [{ id: 'a', loggedAt: at(1000) }],
      day: '2026-11-28',
      isReady: true,
    })
    expect(hook.result.current.landed).toBeNull()
  })

  it('offers a new meal in the render that first shows it, and only once', async () => {
    const hook = await setup([])
    const entries = [{ id: 'b', loggedAt: at(500) }]
    await hook.rerender({ entries, day: '2026-11-28', isReady: true })
    expect(hook.result.current.landed).toBe('b')
    await act(async () => hook.result.current.played('b'))
    await hook.rerender({ entries, day: '2026-11-28', isReady: true })
    expect(hook.result.current.landed).toBeNull()
  })

  it('counts a meal logged for an earlier time of day', async () => {
    const hook = await setup([])
    await hook.rerender({
      entries: [{ id: 'f', loggedAt: at(4 * 3600_000) }],
      day: '2026-11-28',
      isReady: true,
    })
    expect(hook.result.current.landed).toBe('f')
  })

  it('drops a waiting bite for a meal deleted before it played', async () => {
    const hook = await setup([])
    await hook.rerender({
      entries: [{ id: 'g', loggedAt: at(0) }],
      day: '2026-11-28',
      isReady: true,
    })
    await hook.rerender({
      entries: [{ id: 'g', loggedAt: at(0) }],
      day: '2026-11-28',
      isReady: true,
    })
    expect(hook.result.current.landed).toBe('g')
    await hook.rerender({ entries: [], day: '2026-11-28', isReady: true })
    expect(hook.result.current.landed).toBeNull()
  })

  it('takes in what the first server answer adds to a cached day, silently', async () => {
    const hook = await renderHook(
      ({ entries, fresh }: { entries: Entry[]; fresh: boolean }) =>
        useMealLanded(entries, '2026-11-28', true, fresh),
      { initialProps: { entries: [{ id: 'a', loggedAt: at(0) }], fresh: false } },
    )
    await hook.rerender({
      entries: [
        { id: 'a', loggedAt: at(0) },
        { id: 'elsewhere', loggedAt: at(0) },
      ],
      fresh: true,
    })
    expect(hook.result.current.landed).toBeNull()
    await hook.rerender({
      entries: [
        { id: 'a', loggedAt: at(0) },
        { id: 'elsewhere', loggedAt: at(0) },
        { id: 'mine', loggedAt: at(0) },
      ],
      fresh: true,
    })
    expect(hook.result.current.landed).toBe('mine')
  })

  it('eats a meal logged here even when its refetch is the first server answer', async () => {
    const hook = await renderHook(
      ({ entries, fresh }: { entries: Entry[]; fresh: boolean }) =>
        useMealLanded(entries, '2026-11-28', true, fresh),
      { initialProps: { entries: [], fresh: false } },
    )
    noteMealLoggedHere()
    await hook.rerender({ entries: [{ id: 'mine', loggedAt: at(0) }], fresh: true })
    expect(hook.result.current.landed).toBe('mine')
  })

  it('does not count a scan still being read', async () => {
    const hook = await setup([])
    await hook.rerender({
      entries: [{ id: 'c', loggedAt: at(500), status: 'analysing' }],
      day: '2026-11-28',
      isReady: true,
    })
    expect(hook.result.current.landed).toBeNull()
  })

  it('takes no baseline before the day has loaded', async () => {
    const hook = await setup([], false)
    const entries = [{ id: 'd', loggedAt: at(500) }]
    await hook.rerender({ entries, day: '2026-11-28', isReady: true })
    expect(hook.result.current.landed).toBeNull()
  })

  it('starts again on another day', async () => {
    const hook = await setup([])
    await hook.rerender({
      entries: [{ id: 'e', loggedAt: at(500) }],
      day: '2026-11-27',
      isReady: true,
    })
    expect(hook.result.current.landed).toBeNull()
  })
})
