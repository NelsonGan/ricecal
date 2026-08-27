import { registerAnalytics, resetAnalyticsForTest } from '@/lib/analytics'
import { diffWidgets, forgetWidgetsForTest, reportWidgets } from '../adoption'

/**
 * How the app finds out that a widget was added.
 *
 * It cannot be told: neither platform has a callback for it, so adoption is a
 * diff taken on foreground against what was seen last time. Every case here is
 * one where the naive version reports something that did not happen — which
 * matters more than usual, because these events are the only evidence any of
 * the six widgets were worth building.
 */

const client = {
  track: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  registerSuperProperties: jest.fn(),
  getPeople: () => ({ set: people, deleteUser: jest.fn() }),
}
const people = jest.fn()

/**
 * `__DEV__` is true under Jest and `lib/analytics/client.ts` deliberately sends
 * nothing in development, so these have to flip it off — which is also the only
 * way to exercise the path that ships. Same trick, and same reason, as the
 * seam's own tests.
 */
const wasDev = __DEV__

beforeEach(() => {
  // @ts-expect-error — a boolean the bundler defines, assigned here on purpose.
  global.__DEV__ = false
  forgetWidgetsForTest()
  resetAnalyticsForTest()
  client.track.mockClear()
  people.mockClear()
  registerAnalytics(client)
})

afterEach(() => {
  // @ts-expect-error — see above.
  global.__DEV__ = wasDev
})

describe('diffWidgets', () => {
  it('finds nothing in two identical sets', () => {
    expect(diffWidgets(['kcal', 'water'], ['kcal', 'water'])).toEqual({ added: [], removed: [] })
  })

  it('does not mind what order they arrive in', () => {
    // The native side answers from a Set on iOS and from a provider sweep on
    // Android, and neither promises an order. Compared as lists, a home screen
    // that had not changed would report three removals and three installs.
    expect(diffWidgets(['kcal', 'water'], ['water', 'kcal'])).toEqual({ added: [], removed: [] })
  })

  it('reports both directions at once', () => {
    expect(diffWidgets(['kcal', 'water'], ['water', 'today'])).toEqual({
      added: ['today'],
      removed: ['kcal'],
    })
  })
})

describe('reportWidgets', () => {
  it('says nothing on the first look, however many are already there', () => {
    // A REINSTALL is the case this exists for: deleting the app leaves the
    // widgets on the home screen, so the first poll of the new install sees
    // three widgets it has no history for. Reported, that is three installs
    // that happened months ago landing on today's chart.
    reportWidgets(['kcal', 'water', 'today'])

    expect(client.track).not.toHaveBeenCalled()
    // The count is still recorded, because the property is about now rather
    // than about a change.
    expect(people).toHaveBeenCalledWith({ widgets_installed: 3 })
  })

  it('reports what changed after that', () => {
    reportWidgets(['kcal'])
    client.track.mockClear()
    people.mockClear()

    reportWidgets(['kcal', 'water'])

    expect(client.track).toHaveBeenCalledWith('Widget Added', { widget: 'water' })
    expect(people).toHaveBeenCalledWith({ widgets_installed: 2 })
  })

  it('counts a removal, which is the clearest verdict any of them gets', () => {
    reportWidgets(['kcal', 'water'])
    client.track.mockClear()

    reportWidgets(['kcal'])

    expect(client.track).toHaveBeenCalledWith('Widget Removed', { widget: 'water' })
  })

  it('writes the count down to zero rather than leaving the old one', () => {
    reportWidgets(['kcal'])
    people.mockClear()

    reportWidgets([])

    // "Used to have one and took it off" is a real answer, and a property left
    // at 1 would file that account under "has a widget" for ever.
    expect(people).toHaveBeenCalledWith({ widgets_installed: 0 })
  })

  it('is quiet when nothing moved', () => {
    reportWidgets(['kcal'])
    client.track.mockClear()
    people.mockClear()

    reportWidgets(['kcal'])

    expect(client.track).not.toHaveBeenCalled()
    // Not rewritten either. The app comes forward many times a day and this
    // would otherwise be the most-written property in the project.
    expect(people).not.toHaveBeenCalled()
  })
})
