import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Meal, useMealTimes, useUpdateMealTime } from '@/data'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Divider,
  Screen,
  Sheet,
  Skeleton,
  Stepper,
  Tappable,
  Text,
} from '@/ui'

/**
 * The order they happen in, which is not the order the table returns.
 *
 * SNACK IS NOT HERE, and it is a row in `meal_times` like the other three.
 * The reminders screen offers a toggle for breakfast, lunch and dinner alone
 * (`REMINDER_MEALS`), and `meal_times.reminder_enabled` defaults to false — so
 * nothing in the app can ever turn a snack reminder on, and the note under this
 * card says these times are what the reminders go off at. Listed here it was a
 * control that changed nothing: somebody could set "Snack 15:00" as carefully
 * as they liked and no notification would ever come of it.
 *
 * The row itself stays in the table and `rescheduleReminders` still reads every
 * meal generically, so adding the fourth reminder later is a line on the
 * reminders screen and a line here.
 */
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner']

/** Five-minute steps. Nobody eats at 08:07, and 288 stops is a nicer stepper. */
const MINUTE_STEP = 5

/**
 * SETTINGS / PERSONALISATION.
 *
 * When the user's meals are. One screen, because the times belong to the
 * person rather than to the reminders that read them: the same three rows
 * decide when a reminder fires and, on a phone whose owner eats dinner at ten,
 * what "dinner" means at all.
 *
 * Editing is two steppers in a sheet rather than the platform time picker. The
 * picker is a scrolling drum that reports a Date, which then has to be turned
 * back into the `time` this column stores, in the user's timezone, on both
 * platforms — for a value that is an hour and a minute.
 */
export default function PersonalisationScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/(tabs)/me')

  const { data: mealTimes = [], isPending } = useMealTimes()
  const updateMealTime = useUpdateMealTime()

  /** The meal being retimed, if any. */
  const [editing, setEditing] = useState<Meal | null>(null)
  const [hour, setHour] = useState(8)
  const [minute, setMinute] = useState(0)

  const timeFor = (meal: Meal) => mealTimes.find((row) => row.meal === meal)?.at ?? '08:00:00'

  const open = (meal: Meal) => {
    const [rawHour = '8', rawMinute = '0'] = timeFor(meal).split(':')
    setHour(Number(rawHour))
    // Snapped, so a seeded 08:07 does not make the stepper start off-grid.
    setMinute(Math.round(Number(rawMinute) / MINUTE_STEP) * MINUTE_STEP)
    setEditing(meal)
  }

  /**
   * Written on the way out, whichever way out that is — the button, the
   * handle, a tap on the scrim. A sheet with a Cancel would be asking whether
   * the user meant the number they just dialled in.
   */
  const apply = () => {
    if (!editing) return
    const at = `${String(hour).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`
    if (at !== timeFor(editing)) updateMealTime.mutate({ meal: editing, at })
    setEditing(null)
  }

  return (
    <Screen>
      <AppBar
        title={t('profile:personalisation.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Card title={t('profile:personalisation.mealsTitle')} contentClassName="gap-0">
        {/* A rule between rows, not around them: the card draws its own edges,
            so a divider above the first row or below the last would be a second
            line against the border. */}
        {isPending ? (
          // `timeFor` falls back to 08:00 so a row always has something to
          // print, which is the right default for a stepper being opened and
          // the wrong one for the list: four meals all claiming eight in the
          // morning, one of which then jumps. Four rows at 56.
          <Skeleton className="h-[224px] w-full" />
        ) : (
          MEALS.map((meal, index) => (
            <Fragment key={meal}>
              {index === 0 ? null : <Divider />}
              <Tappable
                className="min-h-[56px] flex-row items-center justify-between gap-3"
                onPress={() => open(meal)}
                accessibilityRole="button"
                accessibilityLabel={t('profile:personalisation.editMeal', {
                  meal: t(`common:meal.${meal}`),
                })}
              >
                <Text variant="body">{t(`common:meal.${meal}`)}</Text>
                <Text variant="label" className="text-pandan-ink">
                  {formatTime(timeFor(meal))}
                </Text>
              </Tappable>
            </Fragment>
          ))
        )}
      </Card>

      <Text variant="meta" className="px-1">
        {t('profile:personalisation.mealsNote')}
      </Text>

      <Sheet
        closeLabel={t('common:action.close')}
        visible={editing !== null}
        onClose={apply}
        title={editing ? t(`common:meal.${editing}`) : ''}
        footer={
          <Button fullWidth onPress={apply}>
            {t('common:action.done')}
          </Button>
        }
      >
        <View className="gap-4">
          <Stepper
            value={hour}
            onChange={(next) => setHour((next + 24) % 24)}
            min={-1}
            max={24}
            step={1}
            accessibilityLabel={t('profile:personalisation.hour')}
            decrementLabel={t('common:a11y.decrease')}
            incrementLabel={t('common:a11y.increase')}
            unit={t('profile:personalisation.hour')}
          />
          <Stepper
            value={minute}
            onChange={(next) => setMinute((next + 60) % 60)}
            min={-MINUTE_STEP}
            max={60}
            step={MINUTE_STEP}
            accessibilityLabel={t('profile:personalisation.minute')}
            decrementLabel={t('common:a11y.decrease')}
            incrementLabel={t('common:a11y.increase')}
            unit={t('profile:personalisation.minute')}
          />

          <Text variant="meta">
            {t('profile:personalisation.preview', {
              time: formatTime(
                `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
              ),
            })}
          </Text>
        </View>
      </Sheet>
    </Screen>
  )
}

/** "08:00:00" → "8:00 am". Postgres `time` carries seconds nobody wants to read. */
function formatTime(at: string): string {
  const [rawHour = '0', minute = '00'] = at.split(':')
  const hour = Number(rawHour)
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${minute} ${suffix}`
}
