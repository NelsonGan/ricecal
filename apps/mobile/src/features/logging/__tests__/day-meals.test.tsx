import '@/i18n'
import type { Entry } from '@/data'
import { render, screen, userEvent } from '@/test-utils'
import { DayMeals } from '../DayMeals'

jest.mock('@/data', () => ({
  useMealPhotoUrl: () => ({ data: undefined, isLoading: false }),
  storedImageSource: () => undefined,
}))

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: '97b426c6-43f8-4e30-a79f-39f7867de63c',
  quantity: 1,
  loggedAt: '2026-09-15T08:30:00+08:00',
  logDate: '2026-09-15',
  source: 'text',
  foodName: 'Nasi lemak',
  place: 'home',
  servingLabel: 'plate',
  servingFactor: 1,
  macros: { kcal: 550, carbs: 70, protein: 18, fat: 22 },
  base: { kcal: 550, carbs: 70, protein: 18, fat: 22 },
  ...over,
})

it('opens a database entry from the calendar day', async () => {
  const onPress = jest.fn()
  const meal = entry()
  await render(<DayMeals date="2026-09-15" entries={[meal]} onPressEntry={onPress} />)

  await userEvent.press(screen.getByRole('button', { name: /Nasi lemak/ }))

  expect(onPress).toHaveBeenCalledWith(meal)
})

it('does not open a client-only pending scan as a database entry', async () => {
  const onPress = jest.fn()
  await render(
    <DayMeals
      date="2026-09-15"
      entries={[
        entry({
          id: 'snap-1789433092152-271044',
          foodName: 'What I wrote',
          status: 'waiting',
          macros: { kcal: 0, carbs: 0, protein: 0, fat: 0 },
        }),
      ]}
      onPressEntry={onPress}
    />,
  )

  expect(screen.queryByRole('button', { name: /What I wrote/ })).not.toBeOnTheScreen()
  expect(onPress).not.toHaveBeenCalled()
})
