import { loggerJustOpened, openLogger } from '../loggerOpen'

/**
 * Every way into the logger goes through `openLogger`, and a second tap while
 * it slides in must not push a second one: two loggers shared a keep-awake tag,
 * and the first to close let the phone sleep under the other.
 */
it('opens the logger once for a double tap, and again once it has settled', () => {
  jest.useFakeTimers()
  const router = { push: jest.fn(), dismissTo: jest.fn() }
  openLogger(router)
  openLogger(router)
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(loggerJustOpened()).toBe(true)

  jest.advanceTimersByTime(1000)
  expect(loggerJustOpened()).toBe(false)
  openLogger(router)
  expect(router.push).toHaveBeenCalledTimes(2)
  jest.useRealTimers()
})
