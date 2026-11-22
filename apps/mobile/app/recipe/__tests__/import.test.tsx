import '@/i18n'

import { SafeAreaProvider } from 'react-native-safe-area-context'

import { act, fireEvent, render, screen, waitFor } from '@/test-utils'
import { ToastProvider } from '@/ui'
import ImportRecipeScreen from '../import'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockImport = jest.fn()
const mockOpenPaywall = jest.fn()
const mockParams: { current: Record<string, string> } = { current: {} }
const mockQuota: { current: unknown } = { current: undefined }
const mockQuotaState: { current: { isPending: boolean; fetchStatus: string } } = {
  current: { isPending: false, fetchStatus: 'idle' },
}
const mockFocused = { current: true }

// The progress ring draws with Skia, whose Jest setup falls back to a web build
// that never loads CanvasKit, so a path throws on render. Nothing here is about
// the drawing: the canvas is stubbed down to what the ring touches.
jest.mock('@shopify/react-native-skia', () => {
  const builder = { addArc: () => builder, detach: () => ({}) }
  return {
    Canvas: ({ children }: { children?: unknown }) => children ?? null,
    Path: () => null,
    Skia: { PathBuilder: { Make: () => builder }, XYWHRect: () => ({}) },
  }
})

// The share sheet's way back in. Captured, so a test can hand the screen a link
// the way iOS and Android do while it is open.
const mockLinkListeners: Array<(event: { url: string }) => void> = []
jest.mock('expo-linking', () => ({
  addEventListener: (_: string, listener: (event: { url: string }) => void) => {
    mockLinkListeners.push(listener)
    return {
      remove: () => mockLinkListeners.splice(mockLinkListeners.indexOf(listener), 1),
    }
  },
  parse: (url: string) => {
    const parsed = new URL(url.replace(/^ricecal:\/\/\//, 'https://app.test/'))
    return {
      path: parsed.pathname.replace(/^\//, ''),
      queryParams: Object.fromEntries(parsed.searchParams),
    }
  },
}))

jest.mock('expo-router', () => ({
  useIsFocused: () => mockFocused.current,
  useLocalSearchParams: () => mockParams.current,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/data/refusals', () => ({
  openPaywall: (...args: unknown[]) => mockOpenPaywall(...args),
  proFeatureTitle: () => 'Importing more than 5 videos a month needs RiceCal Pro.',
  storeSaysPaid: () => false,
}))
jest.mock('@/data', () => {
  class VideoImportError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  class VideoImportLimitError extends Error {
    entitled: boolean
    constructor(_used = 0, _limit = 0, entitled = false) {
      super('limit')
      this.entitled = entitled
    }
  }
  class Offline extends Error {
    code = 'offline'
  }
  return {
    VideoImportError,
    VideoImportLimitError,
    useEntitlement: () => ({ entitled: false }),
    useImportRecipe: () => ({ mutateAsync: mockImport, isPending: true }),
    useVideoImportQuota: () => ({ data: mockQuota.current, ...mockQuotaState.current }),
    Offline,
  }
})

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>
        <ImportRecipeScreen />
      </ToastProvider>
    </SafeAreaProvider>,
  )
}

const LINK = 'https://www.tiktok.com/@cook/video/7187898389240040750'

beforeEach(() => {
  mockReplace.mockReset()
  mockImport.mockReset()
  mockOpenPaywall.mockReset()
  mockParams.current = { url: LINK }
  mockQuota.current = { used: 1, limit: 5, remaining: 4, entitled: false }
  mockQuotaState.current = { isPending: false, fetchStatus: 'idle' }
  mockFocused.current = true
})

it('imports the link once and opens the recipe it made', async () => {
  mockImport.mockResolvedValue({ recipeId: 'r1', existing: false, community: true })
  await renderScreen()

  expect(screen.getByText('Making your recipe')).toBeTruthy()
  // The step it is on, as the heading and as the first of the three in the list.
  expect(screen.getAllByText('Watching the video')).toHaveLength(2)
  expect(screen.getByText('Working out the calories')).toBeTruthy()
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'r1' } }),
  )
  expect(mockImport).toHaveBeenCalledTimes(1)
  expect(mockImport).toHaveBeenCalledWith(LINK)
})

it('says a video is not a recipe and offers another link', async () => {
  const { VideoImportError } = jest.requireMock('@/data') as {
    VideoImportError: new (code: string) => Error
  }
  mockImport.mockRejectedValue(new VideoImportError('not_recipe'))
  await renderScreen()

  expect(await screen.findByText('Not a recipe')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use another link' })).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
})

it('says a long video is too long and offers another link', async () => {
  const { VideoImportError } = jest.requireMock('@/data') as {
    VideoImportError: new (code: string) => Error
  }
  mockImport.mockRejectedValue(new VideoImportError('too_long'))
  await renderScreen()

  expect(await screen.findByText('Video too long')).toBeTruthy()
  expect(screen.getByText('Only videos up to 3 minutes can be imported.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use another link' })).toBeTruthy()
})

it('does not send anything when the month is spent on a free account', async () => {
  mockQuota.current = { used: 5, limit: 5, remaining: 0, entitled: false }
  await renderScreen()

  expect(await screen.findByText('No imports left this month')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'See Pro' })).toBeTruthy()
  expect(mockImport).not.toHaveBeenCalled()
})

it('refuses text that is not a video link without asking the server', async () => {
  mockParams.current = { url: 'https://example.com/recipes/rendang' }
  await renderScreen()

  expect(await screen.findByText('Not a video link')).toBeTruthy()
  expect(mockImport).not.toHaveBeenCalled()
})

it('offline, it does not wait on a paused allowance and says so', async () => {
  const { VideoImportError } = jest.requireMock('@/data') as {
    VideoImportError: new (code: string) => Error
  }
  mockQuota.current = undefined
  mockQuotaState.current = { isPending: true, fetchStatus: 'paused' }
  mockImport.mockRejectedValue(new VideoImportError('offline'))
  await renderScreen()

  expect(await screen.findByText('You are offline')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  expect(mockImport).toHaveBeenCalledTimes(1)
})

it('waits while the allowance is actually loading', async () => {
  mockQuota.current = undefined
  mockQuotaState.current = { isPending: true, fetchStatus: 'fetching' }
  await renderScreen()
  expect(mockImport).not.toHaveBeenCalled()
})

it('does not sell Pro to a Pro account at its ceiling', async () => {
  const { VideoImportLimitError } = jest.requireMock('@/data') as {
    VideoImportLimitError: new () => Error
  }
  mockQuota.current = { used: 199, limit: 200, remaining: 1, entitled: true }
  mockImport.mockRejectedValue(new VideoImportLimitError())
  await renderScreen()

  expect(await screen.findByText('That is a lot of recipes')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'See Pro' })).toBeNull()
  expect(mockOpenPaywall).not.toHaveBeenCalled()
})

it('opens the paywall when a free account runs out mid-import', async () => {
  const { VideoImportLimitError } = jest.requireMock('@/data') as {
    VideoImportLimitError: new () => Error
  }
  mockImport.mockRejectedValue(new VideoImportLimitError())
  await renderScreen()

  expect(await screen.findByText('No imports left this month')).toBeTruthy()
  expect(mockOpenPaywall).toHaveBeenCalledTimes(1)
})

it('announces a recipe that lands under another screen instead of replacing it', async () => {
  mockFocused.current = false
  mockImport.mockResolvedValue({ recipeId: 'r1', existing: false, community: false })
  await renderScreen()

  expect(await screen.findByText('Your recipe from the video is ready')).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
})

it('reads a link pasted without its scheme', async () => {
  mockParams.current = { url: 'instagram.com/reel/CnkNjXVsAJv/' }
  mockImport.mockResolvedValue({ recipeId: 'r2', existing: false, community: false })
  await renderScreen()

  await waitFor(() =>
    expect(mockImport).toHaveBeenCalledWith('https://instagram.com/reel/CnkNjXVsAJv/'),
  )
})

it('offers to try again when the post could not be opened, and tries again', async () => {
  const { VideoImportError } = jest.requireMock('@/data') as {
    VideoImportError: new (code: string) => Error
  }
  mockImport.mockRejectedValueOnce(new VideoImportError('unreadable'))
  mockImport.mockResolvedValueOnce({ recipeId: 'r1', existing: false, community: false })
  await renderScreen()

  expect(await screen.findByText('Could not open that post')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'r1' } }),
  )
  expect(mockImport).toHaveBeenCalledTimes(2)
})

it('starts again when the same video is shared while the screen shows a failure', async () => {
  const { VideoImportError } = jest.requireMock('@/data') as {
    VideoImportError: new (code: string) => Error
  }
  mockImport.mockRejectedValueOnce(new VideoImportError('unreadable'))
  mockImport.mockResolvedValueOnce({ recipeId: 'r2', existing: false, community: false })
  await renderScreen()
  expect(await screen.findByText('Could not open that post')).toBeTruthy()

  // The router keeps this screen for the same route; the link still arrives.
  const shared = `ricecal:///recipe/import?url=${encodeURIComponent(LINK)}`
  await act(async () => {
    for (const listener of [...mockLinkListeners]) listener({ url: shared })
  })
  await waitFor(() =>
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/recipe/[id]', params: { id: 'r2' } }),
  )
  expect(mockImport).toHaveBeenCalledTimes(2)
})

it('does not start a second import when the video is shared again mid-import', async () => {
  mockImport.mockReturnValue(new Promise(() => {}))
  await renderScreen()
  await act(async () => {
    for (const listener of [...mockLinkListeners]) {
      listener({ url: `ricecal:///recipe/import?url=${encodeURIComponent(LINK)}` })
    }
  })
  expect(mockImport).toHaveBeenCalledTimes(1)
})
