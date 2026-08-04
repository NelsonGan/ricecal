import { subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  dateKey,
  useDay,
  useDayLog,
  useDescribeFood,
  useLogFood,
  useRecentFoods,
  useSelectedDate,
  useSnapFood,
  useTargets,
} from '@/data'
import { DescribePanel, FoodSearchPanel, InlineCamera, QuickAction } from '@/features/logging'
import { ItemRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { sumMacros } from '@/lib/nutrition'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, SheetSurface, Tappable, Text } from '@/ui'

/**
 * L2 QUICK SELECTOR, and L3's backdrop.
 *
 * Presented as a transparent modal so Today stays visible behind the scrim,
 * which is what the design shows and what makes the sheet feel attached to the
 * day rather than replacing it.
 *
 * `SheetSurface`, not `Sheet`: the route IS the sheet, so it already has
 * everything `Sheet`'s own native `Modal` would provide. Nesting one inside it
 * meant the route transition had to finish before a second window began
 * presenting, and only then did the panel start its slide — which is why tapping
 * the log button felt slow.
 */
export default function LogSheet() {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const logFood = useLogFood()
  const snapFood = useSnapFood()
  const describeFood = useDescribeFood()
  const { selectedDate } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets } = useTargets()
  const colors = useThemeColors()
  /**
   * Which of the quick actions has its panel open below the row, if any.
   *
   * One value rather than a flag each, because they share the space under the
   * row: opening the camera has to put search away, and the other way round. The
   * viewfinder and the search field both live inside this sheet rather than in a
   * screen of their own, so the day stays visible behind them and nothing has to
   * be dismissed twice.
   */
  const [panel, setPanel] = useState<'camera' | 'describe' | 'search' | null>(null)
  const toggle = (next: 'camera' | 'describe' | 'search') =>
    setPanel((current) => (current === next ? null : next))

  const left = (targets?.kcal ?? 0) - sumMacros(day.entries).kcal

  // The last three dishes logged at this meal, newest first. Recency rather than
  // frequency: what someone had for breakfast this week is a better guess at
  // what is on the plate than what they have had most often since installing.
  const { data: recent = [] } = useRecentFoods()

  // Yesterday is a second day query. Cheap, cached, and the only way to offer
  // "repeat" without keeping every day in memory the way the mock store did.
  const yesterdayKey = dateKey(subDays(new Date(selectedDate), 1))
  const { data: yesterday } = useDay(yesterdayKey)
  const yesterdayEntries = yesterday?.entries ?? []

  /**
   * A dish was picked out of the inline search.
   *
   * `replace`, not `push`. This route is a `transparentModal`, and a push from
   * inside one lands on the stack that lives WITHIN that presentation — the dish
   * would come up as a second modal stacked on the sheet, which is the same
   * mistake search itself used to make. Replacing this entry puts the dish on the
   * stack above Today, where a page belongs.
   *
   * The cost is that back from the dish lands on the day rather than on the
   * results. That is the right trade for the common path — pick a dish, set the
   * portion, done — and the alternative was the flash the user saw: the sheet
   * dismissing before a search screen pushed in behind it.
   */
  const openFood = (foodId: string) =>
    router.replace({ pathname: '/log/food/[id]', params: { id: foodId } })

  const add = (foodId: string, servingId: string) => {
    logFood.mutate({ foodId, servingId, logDate: selectedDate, source: 'quickAdd' })
    goBack()
  }

  const repeatYesterday = () => {
    for (const entry of yesterdayEntries) {
      logFood.mutate({
        foodId: entry.foodId,
        servingId: entry.servingId,
        quantity: entry.quantity,
        logDate: selectedDate,
        source: 'quickAdd',
      })
    }
    goBack()
  }

  return (
    // Full height while search is open: the results are a list, and four rows
    // above a keyboard is not one. The sheet is otherwise unchanged, so the
    // transition is the panel growing rather than a screen arriving.
    <SheetSurface onClose={() => goBack()} scrollable fullHeight={panel === 'search'}>
      {/* The heading is rendered here rather than through `title` so the
          remaining count can sit on the same line, right aligned, the way the
          design puts it. */}
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>
          {t('logging:selector.title')}
        </Text>
        <Text variant="caption">
          {t('logging:selector.remaining', { count: Math.max(0, left) })}
        </Text>
      </View>

      <View className="flex-row gap-2.5">
        <QuickAction
          label={t('logging:selector.snap')}
          icon={{ set: 'system', name: 'camera' }}
          tone="pandan"
          selected={panel === 'camera'}
          onPress={() => toggle('camera')}
        />
        {/* No "Say". Dictation is off until it does something — `log/voice` is
            still routable, and nothing points at it. Typing, though, is the
            same recognition without the microphone, so it is here. */}
        <QuickAction
          label={t('logging:selector.describe')}
          icon={{ set: 'system', name: 'sparkle' }}
          tone="kaya"
          selected={panel === 'describe'}
          onPress={() => toggle('describe')}
        />
        <QuickAction
          label={t('logging:selector.search')}
          icon={{ set: 'ui', name: 'search' }}
          selected={panel === 'search'}
          onPress={() => toggle('search')}
        />
      </View>

      {panel === 'camera' ? (
        // The shutter does not wait for recognition. It writes the row and closes:
        // the waiting happens on the row itself, where the user can watch it or
        // ignore it. See `useSnapFood`.
        <InlineCamera
          onCapture={(photoUri) => {
            snapFood({ photoUri, logDate: selectedDate })
            goBack()
          }}
        />
      ) : null}
      {panel === 'describe' ? (
        // Same contract as the shutter: the row is written now and the sheet
        // closes, because the cascade takes several seconds and the day is a
        // better place to wait than a sheet.
        <DescribePanel
          autoFocus
          onSubmit={(text) => {
            describeFood({ text, logDate: selectedDate })
            goBack()
          }}
        />
      ) : null}
      {panel === 'search' ? <FoodSearchPanel autoFocus onPick={openFood} /> : null}

      {/* Both suggestion blocks are put away while search is open — they are for
          someone who has not decided yet, and the results under the field are the
          answer to someone who has — and each one is absent entirely when it has
          nothing in it. A heading over an empty space and a line saying nothing
          has been logged are both the sheet taking up room to tell the user it
          cannot help; the three buttons above already say what to do next. */}
      {panel === 'search' || panel === 'describe' ? null : (
        <>
          {recent.length ? (
            <View className="gap-3 pt-1">
              <Text variant="overline">{t('logging:selector.recent')}</Text>

              {recent.map((food) => (
                <ItemRow
                  key={food.id}
                  title={food.name}
                  icon={food.icon}
                  value={food.macros.kcal}
                  unit="kcal"
                  // The portion, not a count of how often it has been logged:
                  // this list is ordered by when, and "3 times" answered a
                  // question it is no longer sorted by.
                  detail={food.servingLabel}
                  trailing={
                    <IconButton
                      size="sm"
                      variant="primary"
                      accessibilityLabel={t('common:action.add')}
                      onPress={() => add(food.id, food.servings[0]?.id ?? '')}
                    >
                      {/* Tinted to the role: the plus illustration carries its
                          own gold, which on a pandan button reads as a third
                          colour. */}
                      <Icon set="ui" name="plus" size={18} tintColor={colors.onPandan} />
                    </IconButton>
                  }
                />
              ))}
            </View>
          ) : null}

          {yesterdayEntries.length ? (
            <Tappable
              onPress={repeatYesterday}
              className="flex-row items-center justify-center gap-2 rounded-tile border-[3px] border-line border-dashed p-3"
              accessibilityRole="button"
              accessibilityLabel={`${t('logging:selector.repeatYesterday')}, ${
                sumMacros(yesterdayEntries).kcal
              } ${t('common:unit.kcal')}`}
            >
              <Icon set="ui" name="refresh" size={20} />
              <Text variant="label" className="text-muted">
                {t('logging:selector.repeatYesterday')}
              </Text>
            </Tappable>
          ) : null}
        </>
      )}
    </SheetSurface>
  )
}
