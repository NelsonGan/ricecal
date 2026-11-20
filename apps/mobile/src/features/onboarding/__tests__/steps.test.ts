import { ONBOARDING_STEPS, stepNumber, TOTAL_STEPS } from '../steps'

/**
 * The bar has to be continuous and it has to end where the flow ends.
 *
 * Nine screens across three route groups draw the same progress bar, and before
 * this list they each carried their own hardcoded pair of numbers. That survived
 * exactly until a screen was inserted in the middle: the four questions said "of
 * 4" while the permissions after them said "of 9", and one of them said "step 4"
 * twice. None of it crashed and none of it typechecked as wrong.
 */

it('numbers every step once, from one, with no gaps', () => {
  const numbers = ONBOARDING_STEPS.map(stepNumber)

  expect(numbers).toEqual(Array.from({ length: ONBOARDING_STEPS.length }, (_, i) => i + 1))
})

it('ends on the last screen of the flow, not past it', () => {
  expect(stepNumber('notifications')).toBe(TOTAL_STEPS)
})

it('puts the account after the plan and before the permissions', () => {
  // The order is the argument for the whole flow: the questions are answered and
  // the budget is shown BEFORE an email is asked for, and the two permissions
  // come after the account because both write a row keyed by user.
  expect(stepNumber('target')).toBeLessThan(stepNumber('account'))
  expect(stepNumber('account')).toBeLessThan(stepNumber('health'))
  expect(stepNumber('health')).toBeLessThan(stepNumber('notifications'))
})

it('shows how the app works before it asks anything', () => {
  // The welcome screen promises a photo is enough; the scan showcase keeps that
  // promise before the first question rather than after the account.
  expect(ONBOARDING_STEPS[0]).toBe('how')
  expect(stepNumber('how')).toBeLessThan(stepNumber('setup'))
})

it('puts the showcases between the questions, before the plan', () => {
  expect(stepNumber('activity')).toBeLessThan(stepNumber('workouts'))
  expect(stepNumber('workouts')).toBeLessThan(stepNumber('social'))
  expect(stepNumber('social')).toBeLessThan(stepNumber('source'))
  expect(stepNumber('source')).toBeLessThan(stepNumber('calculating'))
})

/**
 * Route groups add no path segment, so an onboarding screen named like a
 * screen elsewhere in the app takes that screen's bare links. The showcase
 * named `social` did exactly that: `dismissTo('/social')` from a group, a post
 * or a deep link opened onboarding for a signed-in user. `activity` predates
 * this check and every caller of either side names its group.
 */
it('gives no onboarding screen a path another screen already answers', () => {
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs')
  const path = jest.requireActual<typeof import('node:path')>('node:path')
  const appDir = path.join(__dirname, '../../../../app')
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx$/.test(entry.name) && !entry.name.startsWith('_'))
        routes.push(path.relative(appDir, full))
    }
  }
  walk(appDir)
  const pathOf = (file: string) =>
    `/${file
      .replace(/\.tsx$/, '')
      .split(path.sep)
      .filter((part) => !/^\(.*\)$/.test(part))
      .join('/')}`.replace(/\/index$/, '') || '/'

  const onboarding = routes.filter((file) => file.startsWith('(onboarding)'))
  const elsewhere = new Set(routes.filter((file) => !file.startsWith('(onboarding)')).map(pathOf))
  const shadowed = onboarding
    .map(pathOf)
    .filter((route) => elsewhere.has(route) && route !== '/activity')

  expect(onboarding.length).toBeGreaterThan(5)
  expect(shadowed).toEqual([])
})

it('declares in the layout only screens that exist', () => {
  // A renamed screen left behind here is dropped with only a console warning,
  // and the real one loses the layout's options.
  const fs = jest.requireActual<typeof import('node:fs')>('node:fs')
  const path = jest.requireActual<typeof import('node:path')>('node:path')
  const dir = path.join(__dirname, '../../../../app/(onboarding)')
  const layout = fs.readFileSync(path.join(dir, '_layout.tsx'), 'utf8')
  const declared = [...layout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((match) => match[1])

  expect(declared.length).toBeGreaterThan(5)
  expect(declared.filter((name) => !fs.existsSync(path.join(dir, `${name}.tsx`)))).toEqual([])
})
