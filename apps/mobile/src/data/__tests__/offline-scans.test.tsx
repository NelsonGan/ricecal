import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import { unclaimedSnaps } from '../day'
import {
  clearPendingSnaps,
  type PendingSnap,
  PendingSnapProvider,
  usePendingSnaps,
} from '../pending-snaps'
import { lostRequest, useImportRecipe, VideoImportError } from '../recipes'
import { SnapQueue, useDescribeFood, useSnapFood } from '../snap'

/**
 * What happens when the connection is not there, for the two things a person
 * starts and then walks away from: a video import and a photographed meal.
 *
 * The import used to tell people they were offline when they were not: the
 * first request after coming back from Instagram or TikTok went down a pooled
 * connection the other end had dropped, failed at once, and the recipe the
 * server went on to write turned up a moment later under the error. And a meal
 * photographed offline failed its upload and sat on the day as "could not
 * read this one", which is the meal lost. Both are about a request that never
 * got an answer, and neither shows anything wrong in a test that does not
 * take the connection away.
 */

const USER = 'eater'

const mockInvoke = jest.fn()
const mockUpload = jest.fn()
const mockTrack = jest.fn()
const mockReachable = jest.fn()
const mockSchedule = jest.fn()
const mockSession = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, options: unknown) => mockInvoke(name, options) },
    // The one read a queued typed meal makes before it is sent again.
    from: () => ({ select: () => ({ limit: () => mockReachable() }) }),
  },
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../session', () => ({
  useUserId: () => 'eater',
  useSession: () => mockSession(),
}))
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
  dateOffset: () => 0,
  setPersonProps: jest.fn(),
}))
jest.mock('@/lib/notifications', () => ({
  announceScan: jest.fn(),
  cancelScanNotice: jest.fn(),
  ensureNotificationPermission: () => Promise.resolve(true),
  scheduleScanNotice: () => mockSchedule(),
}))
jest.mock('@/lib/places', () => ({
  autoTagLocation: jest.fn(),
  autoTagWanted: () => false,
  recordMealForLocationsOffer: jest.fn(),
}))
jest.mock('@/lib/rating', () => ({ recordMealLogged: jest.fn() }))
jest.mock('@/ui', () => ({ useToast: () => ({ show: jest.fn() }) }))
jest.mock('../photos', () => ({
  uploadMealPhoto: (uri: string) => mockUpload(uri),
  lostUpload: (error: { lost?: boolean }) => error?.lost === true,
}))
jest.mock('../queued-photos', () => ({
  keepQueuedPhoto: (_id: string, uri: string) => Promise.resolve(`kept:${uri}`),
  dropQueuedPhoto: jest.fn(),
  dropQueuedPhotos: jest.fn(),
  sweepQueuedPhotos: jest.fn(),
  queuedPhotoUri: (uri?: string) => uri,
}))

/** A request that got no answer, as functions-js reports one. */
const lost = () => ({
  data: null,
  error: Object.assign(new Error('Failed to send a request to the Edge Function'), {
    name: 'FunctionsFetchError',
    context: new TypeError('The network connection was lost.'),
  }),
})

/** An upload that never reached storage. */
const lostUpload = () => Object.assign(new Error('Network request failed'), { lost: true })

const clients: QueryClient[] = []

function client() {
  const made = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false, gcTime: 0 } },
  })
  clients.push(made)
  return made
}

beforeEach(() => {
  // Pending rows are persisted, and a queued one left by the last test would
  // be restored and sent by this one's queue.
  clearPendingSnaps()
  mockInvoke.mockReset()
  mockUpload.mockReset()
  mockTrack.mockReset()
  mockReachable.mockReset().mockResolvedValue({ status: 200 })
  mockSchedule.mockReset().mockResolvedValue('notice')
  mockSession.mockReset().mockReturnValue({ userId: USER })
  onlineManager.setOnline(true)
})

afterEach(() => {
  for (const made of clients.splice(0)) made.clear()
  onlineManager.setOnline(true)
})

describe('importing a video', () => {
  async function importer() {
    const queryClient = client()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    return (await renderHook(() => useImportRecipe(), { wrapper })).result
  }

  it('sends a request that got no answer once more instead of saying offline', async () => {
    mockInvoke.mockResolvedValueOnce(lost()).mockResolvedValueOnce({
      data: { ok: true, recipe_id: 'r1', platform: 'tiktok' },
      error: null,
    })
    const result = await importer()

    let imported: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => {
      imported = await result.current.mutateAsync('https://www.tiktok.com/@a/video/1')
    })

    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(imported?.recipeId).toBe('r1')
  })

  it('does not repeat a request that was lost slowly', async () => {
    // A request that ran to the platform's timeout may still be running on the
    // server, and a second would start a second model run for the same video.
    let now = 1_000_000
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now)
    mockInvoke.mockImplementationOnce(() => {
      now += 60_000
      return Promise.resolve(lost())
    })
    const result = await importer()

    let failure: unknown
    await act(async () => {
      failure = await result.current
        .mutateAsync('https://www.tiktok.com/@a/video/1')
        .catch((e) => e)
    })
    clock.mockRestore()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect((failure as VideoImportError).code).toBe('offline')
  })

  it('still says "already yours" when nothing was lost', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: { ok: true, recipe_id: 'r1', existing: true, platform: 'instagram' },
      error: null,
    })
    const result = await importer()

    let imported: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => {
      imported = await result.current.mutateAsync('https://www.instagram.com/reel/X/')
    })

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(imported?.existing).toBe(true)
  })

  it('says offline only when the second request is lost too', async () => {
    mockInvoke.mockResolvedValue(lost())
    const result = await importer()

    let failure: unknown
    await act(async () => {
      failure = await result.current
        .mutateAsync('https://www.tiktok.com/@a/video/1')
        .catch((e) => e)
    })

    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(failure).toBeInstanceOf(VideoImportError)
    expect((failure as VideoImportError).code).toBe('offline')
  })

  it('does not repeat a request the server answered', async () => {
    // A status is an answer, even a gateway's: sending it again would not help.
    mockInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        context: { status: 502, json: () => Promise.reject(new Error('not JSON')) },
      }),
    })
    const result = await importer()

    let failure: unknown
    await act(async () => {
      failure = await result.current
        .mutateAsync('https://www.tiktok.com/@a/video/1')
        .catch((e) => e)
    })

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect((failure as VideoImportError).code).toBe('failed')
  })

  it('tells a lost request from an answered one', () => {
    expect(lostRequest(null)).toBe(false)
    expect(lostRequest(lost().error)).toBe(true)
    expect(lostRequest(new SyntaxError('JSON Parse error'))).toBe(true)
    expect(lostRequest({ context: { status: 500 } })).toBe(false)
  })
})

describe('a meal photographed offline', () => {
  /** The scans `scan-meal` was asked for, which is what a duplicate would be. */
  const scans = () => mockInvoke.mock.calls.filter(([name]) => name === 'scan-meal')

  async function app() {
    const queryClient = client()
    const seen: {
      snaps: PendingSnap[]
      snap?: ReturnType<typeof useSnapFood>
      describe?: ReturnType<typeof useDescribeFood>
    } = { snaps: [] }
    function Probe() {
      seen.snaps = usePendingSnaps().snaps
      seen.snap = useSnapFood()
      seen.describe = useDescribeFood()
      return null
    }
    await render(
      <QueryClientProvider client={queryClient}>
        <PendingSnapProvider>
          <SnapQueue />
          <Probe />
        </PendingSnapProvider>
      </QueryClientProvider>,
    )
    return seen
  }

  const answered = () =>
    Promise.resolve({
      data: {
        ok: true,
        entries: [{ id: 'e1', foodId: 'f', tier: 1, name: 'Nasi lemak', kcal: 640 }],
      },
      error: null,
    })

  it('waits for the connection instead of failing, then sends it once', async () => {
    onlineManager.setOnline(false)
    mockUpload.mockResolvedValue('meals/eater/plate.jpg')
    mockInvoke.mockImplementation(answered)
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' }) ?? ''
    })

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('queued'))
    // Nothing left the phone: no upload, no scan.
    expect(mockUpload).not.toHaveBeenCalled()
    expect(scans()).toHaveLength(0)
    const queued = seen.snaps.find((s) => s.id === id)
    // The photo was moved somewhere the OS will not reclaim, and the owner kept.
    expect(queued?.photoUri).toBe('kept:file:///cache/plate.jpg')
    expect(queued?.userId).toBe(USER)

    await act(() => onlineManager.setOnline(true))

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)).toBeUndefined())
    expect(mockUpload).toHaveBeenCalledWith('kept:file:///cache/plate.jpg')
    expect(scans()).toHaveLength(1)
    // Stamped with the shutter, so lunch taken offline is not logged at dinner.
    const body = (scans()[0][1] as { body: Record<string, unknown> }).body
    expect(body.logged_at).toBe(queued?.loggedAt)
    expect(body.photo_path).toBe('meals/eater/plate.jpg')
  })

  it('queues a photo whose upload got no answer, without asking for a scan', async () => {
    mockUpload.mockRejectedValueOnce(lostUpload())
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' }) ?? ''
    })

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('queued'))
    expect(scans()).toHaveLength(0)
  })

  it('still fails a photo storage refused, rather than queueing it for ever', async () => {
    mockUpload.mockRejectedValueOnce(new Error('Upload failed (403)'))
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' }) ?? ''
    })

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('failed'))
    expect(scans()).toHaveLength(0)
  })

  it('never resends a scan whose request was lost after it went out', async () => {
    // The server may be writing that entry right now: the row waits and polls
    // for it instead, and the queue leaves it alone.
    mockUpload.mockResolvedValue('meals/eater/plate.jpg')
    mockInvoke.mockResolvedValue(lost())
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' }) ?? ''
    })

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('waiting'))
    await act(() => onlineManager.setOnline(false))
    await act(() => onlineManager.setOnline(true))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(scans()).toHaveLength(1)
  })

  it('sends a queued meal once however often the connection flickers', async () => {
    onlineManager.setOnline(false)
    mockUpload.mockResolvedValue('meals/eater/plate.jpg')
    let finish: () => void = () => {}
    mockInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(answered())
        }),
    )
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' }) ?? ''
    })
    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('queued'))

    await act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(scans()).toHaveLength(1))
    await act(() => onlineManager.setOnline(false))
    await act(() => onlineManager.setOnline(true))
    await act(() => onlineManager.setOnline(false))
    await act(() => onlineManager.setOnline(true))
    await act(async () => {
      finish()
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)).toBeUndefined())
    expect(scans()).toHaveLength(1)
  })

  it('reads once before resending a typed meal, and waits again if that is lost', async () => {
    // A typed meal has no upload to prove the connection first, and a scan
    // request lost on the way could never be sent again safely.
    onlineManager.setOnline(false)
    mockReachable.mockResolvedValue({ status: 0 })
    mockInvoke.mockImplementation(answered)
    const seen = await app()

    let id = ''
    await act(() => {
      id = seen.describe?.({ logDate: '2026-11-26', text: 'nasi lemak' }) ?? ''
    })
    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('queued'))

    await act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(mockReachable).toHaveBeenCalled())
    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)?.status).toBe('queued'))
    expect(scans()).toHaveLength(0)

    mockReachable.mockResolvedValue({ status: 200 })
    await act(() => onlineManager.setOnline(false))
    await act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(seen.snaps.find((s) => s.id === id)).toBeUndefined())
    expect(scans()).toHaveLength(1)
  })

  it('books the "plate is counted" notice on a resend only once the photo is up', async () => {
    const schedule = mockSchedule
    onlineManager.setOnline(false)
    const seen = await app()

    await act(() => {
      seen.snap?.({ logDate: '2026-11-26', photoUri: 'file:///cache/plate.jpg' })
    })
    await waitFor(() => expect(seen.snaps[0]?.status).toBe('queued'))
    schedule.mockClear()

    // Back online, and the upload is lost again: nothing was counted, so
    // nothing may say it was.
    mockUpload.mockRejectedValueOnce(lostUpload())
    await act(() => onlineManager.setOnline(true))
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(seen.snaps[0]?.status).toBe('queued'))
    expect(schedule).not.toHaveBeenCalled()
  })
})

describe('a queued row on the day', () => {
  it('is not taken off the day by a later meal that landed', () => {
    // A queued meal has not been sent, so no entry can be its. Without this
    // the next meal photographed once the phone was online claimed it, and the
    // queued meal vanished without ever being sent.
    const queued = {
      id: 'q',
      status: 'queued' as const,
      loggedAt: '2026-11-26T04:00:00.000Z',
    }
    const later = { id: 'e', source: 'camera' as const, loggedAt: '2026-11-26T05:00:00.000Z' }
    expect(unclaimedSnaps([queued], [later])).toEqual([queued])
  })

  it('once resent, is claimed only by the entry stamped with its own shutter', () => {
    // A snack photographed online after a queued lunch used to be taken as the
    // lunch's entry the moment lunch was resent, and the lunch row went, photo
    // and all, while it was still uploading.
    const lunch = {
      id: 'lunch',
      status: 'analysing' as const,
      loggedAt: '2026-11-26T04:00:00.000Z',
      sentAt: '2026-11-26T06:00:00.000Z',
    }
    const snack = { id: 's', source: 'camera' as const, loggedAt: '2026-11-26T04:20:00.000Z' }
    expect(unclaimedSnaps([lunch], [snack])).toEqual([lunch])

    const its = { id: 'l', source: 'camera' as const, loggedAt: '2026-11-26T04:00:00.000+00:00' }
    expect(unclaimedSnaps([lunch], [snack, its])).toEqual([])
  })

  it("keeps a resent meal's entry from an earlier shot still being read", () => {
    const earlier = {
      id: 'early',
      status: 'analysing' as const,
      loggedAt: '2026-11-26T03:50:00.000Z',
    }
    const lunch = {
      id: 'lunch',
      status: 'analysing' as const,
      loggedAt: '2026-11-26T04:00:00.000Z',
      sentAt: '2026-11-26T06:00:00.000Z',
    }
    const its = { id: 'l', source: 'camera' as const, loggedAt: '2026-11-26T04:00:00.000Z' }
    expect(unclaimedSnaps([earlier, lunch], [its])).toEqual([earlier])
  })
})

describe('the queue at the root', () => {
  it('renders nothing, and does not throw, with nobody signed in', async () => {
    mockSession.mockReturnValue({ userId: null })
    const queryClient = client()
    await expect(
      render(
        <QueryClientProvider client={queryClient}>
          <PendingSnapProvider>
            <SnapQueue />
          </PendingSnapProvider>
        </QueryClientProvider>,
      ),
    ).resolves.toBeDefined()
  })
})
