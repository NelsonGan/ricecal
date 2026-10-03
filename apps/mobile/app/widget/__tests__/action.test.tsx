import { render, screen } from '@testing-library/react-native'
import WidgetLanding from '../[action]'

const mockParams: { action?: string; w?: string } = {}
const mockTrack = jest.fn()

jest.mock('@modules/ricecal-widgets', () => ({ WIDGET_KINDS: ['water'] }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>{`redirect:${href}`}</Text>
  },
}))
jest.mock('@/data', () => ({ useSession: () => ({ session: {}, loading: false }) }))
jest.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }))
jest.mock('@/ui', () => ({ Spinner: () => null }))

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.w = 'water'
})

it.each(['unknown-future-action', 'toString', '__proto__', 'constructor'])(
  'lands safely on Today for an unrecognized widget target %s',
  async (action) => {
    mockParams.action = action
    await render(<WidgetLanding />)
    expect(screen.getByText('redirect:/today')).toBeOnTheScreen()
    expect(mockTrack).toHaveBeenCalledWith('Widget Opened', { widget: 'water', target: 'open' })
  },
)

it.each(['barcode', 'recipes'])('keeps the legacy %s widget link working', async (action) => {
  mockParams.action = action
  await render(<WidgetLanding />)
  expect(screen.getByText(`redirect:/log?panel=${action}`)).toBeOnTheScreen()
  expect(mockTrack).toHaveBeenCalledWith('Widget Opened', { widget: 'water', target: action })
})
