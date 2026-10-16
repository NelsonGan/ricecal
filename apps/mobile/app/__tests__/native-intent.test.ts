import { redirectSystemPath } from '../+native-intent'

describe('links rewritten before the router sees them', () => {
  it('opens the logger from the Live Activity with the app running', () => {
    expect(redirectSystemPath({ path: 'ricecal://workout/resume', initial: false })).toBe(
      '/workout/active',
    )
  })

  it('goes through the Workouts tab on a cold launch, so the tabs are under the logger', () => {
    expect(redirectSystemPath({ path: 'ricecal://workout/resume', initial: true })).toBe(
      '/workouts?resume=1',
    )
  })

  it('leaves every other link alone', () => {
    for (const path of [
      'ricecal://widget/camera?w=kcal',
      '/workout/active',
      'ricecal://workouts',
    ]) {
      expect(redirectSystemPath({ path, initial: true })).toBe(path)
    }
  })
})
