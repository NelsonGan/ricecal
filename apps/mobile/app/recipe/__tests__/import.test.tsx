import '@/i18n'

import { SafeAreaProvider } from 'react-native-safe-area-context'

import { render, screen, waitFor } from '@/test-utils'
import { ToastProvider } from '@/ui'
import ImportRecipeScreen from '../import'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockImport = jest.fn()
const mockOpenPaywall = jest.fn()
const mockParams: { current: Record<string, string> } = { current: {} }
const mockQuota: { current: unknown } = { current: undefined }

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams.current,
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))
jest.mock('@/lib/navigation', () => ({ useBack: () => jest.fn() }))
jest.mock('@/data/refusals', () => ({
  openPaywall: (...args: unknown[]) => mockOpenPaywall(...args),
  proFeatureTitle: () => 'Importing more than 5 videos a month needs RiceCal Pro.',
}))
jest.mock('@/data', () => {
  class VideoImportError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  class VideoImportLimitError extends Error {}
  return {
    VideoImportError,
    VideoImportLimitError,
    useImportRecipe: () => ({ mutateAsync: mockImport, isPending: true }),
    useVideoImportQuota: () => ({ data: mockQuota.current, isPending: false }),
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
})

it('imports the link once and opens the recipe it made', async () => {
  mockImport.mockResolvedValue({ recipeId: 'r1', existing: false, community: true })
  await renderScreen()

  expect(screen.getByText('Making your recipe')).toBeTruthy()
  expect(screen.getByText('Watching the video')).toBeTruthy()
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
