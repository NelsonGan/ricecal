import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SessionGate } from '@/lib/SessionGate'
import FoodDetailRoute from '../log/food/[id]'
import LogRoute from '../log/index'
import IngredientsRoute from '../log/ingredients'
import SearchRoute from '../log/search'
import PaywallRoute from '../paywall/index'
import IntroPaywallRoute from '../paywall/intro'
import WelcomeToProRoute from '../paywall/welcome'

const mockSession: { session: unknown; loading: boolean } = { session: null, loading: true }

jest.mock('@/data', () => ({ useSession: () => mockSession }))
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text>{`redirect:${href}`}</Text>
  },
}))

const ROUTES = [
  ['/log', LogRoute],
  ['/log/search', SearchRoute],
  ['/log/food/[id]', FoodDetailRoute],
  ['/log/ingredients', IngredientsRoute],
  ['/paywall', PaywallRoute],
  ['/paywall/intro', IntroPaywallRoute],
  ['/paywall/welcome', WelcomeToProRoute],
] as const

it.each(ROUTES)('%s waits on a cold start before mounting account hooks', async (_url, Route) => {
  mockSession.session = null
  mockSession.loading = true
  const view = await render(<Route />)
  expect(view.toJSON()).toBeNull()
})

it.each(ROUTES)('%s sends a signed-out deep link to Welcome', async (_url, Route) => {
  mockSession.session = null
  mockSession.loading = false
  await render(<Route />)
  expect(screen.getByText('redirect:/welcome')).toBeOnTheScreen()
})

it('mounts private content after restoration and removes it when the session goes away', async () => {
  const read = jest.fn()
  function PrivateContent() {
    read()
    return <Text>Private diary</Text>
  }
  const tree = () => (
    <SessionGate>
      <PrivateContent />
    </SessionGate>
  )
  mockSession.session = {}
  mockSession.loading = true
  const view = await render(tree())
  expect(read).not.toHaveBeenCalled()

  mockSession.loading = false
  await view.rerender(tree())
  expect(screen.getByText('Private diary')).toBeOnTheScreen()

  mockSession.session = null
  await view.rerender(tree())
  expect(screen.queryByText('Private diary')).toBeNull()
  expect(screen.getByText('redirect:/welcome')).toBeOnTheScreen()
})
