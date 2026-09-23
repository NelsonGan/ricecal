import { SafeAreaProvider } from 'react-native-safe-area-context'
import { fireEvent, render, screen, waitFor } from '@/test-utils'
import '@/i18n'
import PeopleScreen from '../../../../app/social/people'

const METRICS = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
}
const people = (
  <SafeAreaProvider initialMetrics={METRICS}>
    <PeopleScreen />
  </SafeAreaProvider>
)

const mockSearch = jest.fn()

jest.mock('@/data/social', () => ({
  useSocialSearch: (query: string) => {
    mockSearch(query)
    return {
      data: { pages: [{ rows: [], next: null }] },
      isPending: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      fetchStatus: 'idle',
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    }
  },
  useSocialSuggestions: () => ({ data: [], isPending: false, isError: false, refetch: jest.fn() }),
}))
jest.mock('@/features/social/components', () => {
  const { createElement } = jest.requireActual('react')
  const { View } = jest.requireActual('react-native')
  return {
    SocialBar: () => null,
    PersonRow: () => null,
    SocialList: ({ empty }: { empty: string }) =>
      createElement(View, { accessibilityLabel: `list: ${empty}` }),
  }
})

beforeEach(() => mockSearch.mockClear())

it('searches the handle characters in a typed name instead of failing', async () => {
  await render(people)
  await fireEvent.changeText(screen.getByPlaceholderText('Search handles'), '@Lily Lim')
  await waitFor(() => expect(mockSearch).toHaveBeenLastCalledWith('lilylim'))
})

it('says nobody matched when nothing typed could be a handle', async () => {
  await render(people)
  await fireEvent.changeText(screen.getByPlaceholderText('Search handles'), '莉莉 🍜')
  expect(screen.getByText('No people found')).toBeOnTheScreen()
  expect(mockSearch).not.toHaveBeenCalledWith(expect.stringMatching(/[^a-z0-9_]/))
})

it('does not search a truncated prefix when the visible handle is too long', async () => {
  await render(people)
  const field = screen.getByPlaceholderText('Search handles')
  await fireEvent.changeText(field, 'a'.repeat(24))
  await waitFor(() => expect(mockSearch).toHaveBeenLastCalledWith('a'.repeat(24)))

  await fireEvent.changeText(field, 'a'.repeat(25))
  expect(screen.getByText('No people found')).toBeOnTheScreen()
  await waitFor(() => expect(mockSearch).toHaveBeenLastCalledWith(''))
})
