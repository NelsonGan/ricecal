import type { ReactElement } from 'react'

import '@/i18n'
import type { Food } from '@/data'
import { act, render, screen, userEvent } from '@/test-utils'
import { FoodSearchPanel } from '../FoodSearchPanel'

/**
 * What the panel owes a host that has to rebuild it.
 *
 * The quick selector's inline search does not survive the dish it opens: the
 * sheet is replaced by `log/search`, which mounts this panel again and has to
 * come back looking like the search the user left. So `onPick` hands over the
 * search as well as the dish, and `restore` takes it back — which is the whole
 * of the contract, and neither half is visible from either screen alone.
 *
 * `Food Searched` is most of what is pinned here, because a rebuilt panel can
 * get it wrong in both directions and neither shows on screen: send it twice for
 * one search, or never send it at all. `tracked` is the bit that decides which,
 * so the two restores below are the two answers it can carry.
 */

const mockTrack = jest.fn()
jest.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }))

const THOSAI: Food = {
  id: 'f1',
  name: 'Thosai',
  place: 'mamak',
  servingLabel: '1 piece',
  servings: [],
  macros: { kcal: 269, carbs: 43, protein: 4, fat: 9 },
  extras: {},
  verified: true,
}

const mockSearch = jest.fn()
// The two hooks under test, plus the pair `ItemRow` reaches for to draw a
// photographed meal. Nothing here has a photograph, so both answer with nothing.
jest.mock('@/data', () => ({
  useFoodSearch: (query: string) => mockSearch(query),
  useRecentFoods: () => ({ data: [], isPending: false, isPaused: false, isError: false }),
  useRecipes: () => ({ data: [], isPending: false, isPaused: false, isError: false }),
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  storedImageSource: () => undefined,
}))

const onPick = jest.fn()
const user = userEvent.setup()

/** Render, then run past `SETTLED_MS` so the `Food Searched` timer has had its say. */
const settle = async (ui: ReactElement) => {
  jest.useFakeTimers()
  try {
    await render(ui)
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
  } finally {
    jest.useRealTimers()
  }
}

beforeEach(() => {
  onPick.mockClear()
  mockTrack.mockClear()
  mockSearch.mockReturnValue({
    data: [THOSAI],
    isFetching: false,
    isPaused: false,
    isError: false,
  })
})

/** Picked before `Food Searched` could fire, which is the fast, common path. */
it('hands the host the search that found the dish, uncounted', async () => {
  await render(<FoodSearchPanel onPick={onPick} />)

  await user.type(screen.getByPlaceholderText('Search any dish'), 'thosai')
  await user.press(await screen.findByRole('button', { name: /Thosai/ }))

  expect(onPick).toHaveBeenCalledWith(THOSAI, { query: 'thosai', tracked: false })
})

it('restores a search, and asks the catalogue without waiting to be typed into', async () => {
  await render(<FoodSearchPanel restore={{ query: 'thosai', tracked: true }} onPick={onPick} />)

  expect(screen.getByDisplayValue('thosai')).toBeOnTheScreen()
  expect(mockSearch).toHaveBeenCalledWith('thosai')
  expect(await screen.findByRole('button', { name: /Thosai/ })).toBeOnTheScreen()
})

it('does not record a restored search that was already counted', async () => {
  await settle(<FoodSearchPanel restore={{ query: 'thosai', tracked: true }} onPick={onPick} />)

  expect(mockTrack).not.toHaveBeenCalledWith('Food Searched', expect.anything())
})

/**
 * The other half, and the reason `tracked` is carried rather than assumed. The
 * panel this was handed over from unmounted with its timer still pending, so
 * nobody has recorded this search yet and this panel has to.
 */
it('records a restored search that was not', async () => {
  await settle(<FoodSearchPanel restore={{ query: 'thosai', tracked: false }} onPick={onPick} />)

  expect(mockTrack).toHaveBeenCalledWith('Food Searched', { results: 1, query_length: 6 })
})

/**
 * "New food" is the second thing that leaves this panel behind, and it leaves it
 * behind harder: a form is abandoned more often than a portion is, and it is
 * reached from the tab whose job is "not in the catalogue" — so the search
 * underneath it is the search that just failed to find the dish being written.
 */
it('hands the host the search when a food is written instead of found', async () => {
  const onCreateOwn = jest.fn()
  await render(
    <FoodSearchPanel
      onPick={onPick}
      onPickOwn={jest.fn()}
      onOpenOwn={jest.fn()}
      onCreateOwn={onCreateOwn}
    />,
  )

  await user.type(screen.getByPlaceholderText('Search any dish'), 'sup ekor')
  await user.press(screen.getByRole('tab', { name: 'My foods' }))
  await user.press(await screen.findByRole('button', { name: 'New food' }))

  expect(onCreateOwn).toHaveBeenCalledWith({ query: 'sup ekor', tracked: false })
})
