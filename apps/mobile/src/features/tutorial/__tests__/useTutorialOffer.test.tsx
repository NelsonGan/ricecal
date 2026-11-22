import { act, render } from '@testing-library/react-native'
import { tutorialOffered } from '../prompt'
import { useTutorialOffer } from '../useTutorialOffer'

const mockShow = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@/data', () => ({ useSession: () => ({ userId: 'full-disk' }) }))
jest.mock('@/ui', () => ({ useToast: () => ({ show: mockShow }) }))

const mmkv = jest.requireMock('react-native-mmkv') as { __failWrites: (on: boolean) => void }

function Probe() {
  useTutorialOffer()
  return null
}

beforeEach(() => {
  jest.useFakeTimers()
  mockShow.mockClear()
})
afterEach(() => {
  mmkv.__failWrites(false)
  jest.useRealTimers()
})

it('offers the tour on a full disk instead of throwing out of its timer', async () => {
  // 1.2.0 on iOS 27.2: MMKV.set(...) failed for "offered:<user>", uncaught in
  // this timer, which is a crash in a release build.
  mmkv.__failWrites(true)
  await render(<Probe />)
  await act(() => jest.advanceTimersByTimeAsync(1300))
  expect(mockShow).toHaveBeenCalledTimes(1)
  // Counted as made for the rest of this run, so nothing re-offers it.
  expect(tutorialOffered('full-disk')).toBe(true)
})
