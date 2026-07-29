import { addDays, format, startOfWeek } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { BarChart } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { dateKey, getFood, sumMacros, useAppState, useStore } from '@/mock'
import { AppBar, Badge, Button, Card, Icon, Screen, Text } from '@/ui'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** P4 WEEKLY REPORT */
export default function ReportScreen() {
  const { t } = useTranslation(['progress', 'common'])
  const router = useRouter()
  const goBack = useBack('/trends')
  const { state } = useStore()
  const targets = useAppState((s) => s.targets)

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index)
    const day = state.days[dateKey(date)]
    return { date, macros: sumMacros(day?.entries ?? []), entries: day?.entries ?? [] }
  })

  const logged = week.filter((day) => day.entries.length > 0)
  const average = logged.length
    ? Math.round(logged.reduce((sum, day) => sum + day.macros.kcal, 0) / logged.length)
    : 0
  const delta = targets.kcal - average

  const totals = week.reduce(
    (sum, day) => ({
      carbs: sum.carbs + day.macros.carbs,
      protein: sum.protein + day.macros.protein,
      fat: sum.fat + day.macros.fat,
    }),
    { carbs: 0, protein: 0, fat: 0 },
  )

  // By energy, not by weight: 100 g of fat is not 100 g of carbs on a plate.
  const energy = {
    carbs: totals.carbs * 4,
    protein: totals.protein * 4,
    fat: totals.fat * 9,
  }
  const totalEnergy = energy.carbs + energy.protein + energy.fat || 1
  const share = {
    carbs: Math.round((energy.carbs / totalEnergy) * 100),
    protein: Math.round((energy.protein / totalEnergy) * 100),
    fat: Math.round((energy.fat / totalEnergy) * 100),
  }

  const best = logged.reduce<(typeof week)[number] | undefined>(
    (top, day) => (!top || day.entries.length > top.entries.length ? day : top),
    undefined,
  )

  const counts = new Map<string, number>()
  for (const day of week) {
    for (const entry of day.entries) counts.set(entry.foodId, (counts.get(entry.foodId) ?? 0) + 1)
  }
  const [topFoodId, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []

  const waterAverage = week.length
    ? (
        week.reduce((sum, day) => sum + (state.days[dateKey(day.date)]?.waterGlasses ?? 0), 0) /
        week.length
      ).toFixed(1)
    : '0'

  return (
    <Screen
      footer={
        <Button variant="neutral" fullWidth onPress={() => router.push('/progress/nutrition')}>
          {t('progress:nutrition.title')}
        </Button>
      }
    >
      <AppBar
        title={t('progress:report.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <Text variant="caption">
        {t('progress:report.range', {
          from: format(monday, 'd MMM'),
          to: format(addDays(monday, 6), 'd MMM'),
        })}
      </Text>

      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text variant="overline">{t('progress:report.avgPerDay')}</Text>
            <Text variant="displayMd">{average.toLocaleString()}</Text>
          </View>
          <Badge tone={delta >= 0 ? 'pandan' : 'kaya'}>
            <Text
              className={`font-body-black text-[12px] leading-[15px] ${
                delta >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'
              }`}
            >
              {delta >= 0
                ? t('progress:report.underGoal', { count: delta })
                : t('progress:report.overGoal', { count: Math.abs(delta) })}
            </Text>
          </Badge>
        </View>

        <BarChart
          bars={week.map((day, index) => ({
            key: dateKey(day.date),
            label: WEEKDAYS[index],
            value: day.macros.kcal,
            highlight: dateKey(day.date) === state.todayKey,
          }))}
          accessibilityLabel={t('progress:report.avgPerDay')}
        />
      </Card>

      <Card title={t('progress:report.macroSplit')}>
        <View className="h-[22px] flex-row overflow-hidden rounded-full">
          <View className="bg-kaya" style={{ flex: Math.max(1, share.carbs) }} />
          <View className="bg-hibiscus" style={{ flex: Math.max(1, share.protein) }} />
          <View className="bg-teh" style={{ flex: Math.max(1, share.fat) }} />
        </View>

        <View className="flex-row gap-md">
          {(
            [
              {
                key: 'carbs',
                dot: 'bg-kaya',
                label: t('common:macro.carbs'),
                percent: share.carbs,
              },
              {
                key: 'protein',
                dot: 'bg-hibiscus',
                label: t('common:macro.protein'),
                percent: share.protein,
              },
              { key: 'fat', dot: 'bg-teh', label: t('common:macro.fat'), percent: share.fat },
            ] as const
          ).map((row) => (
            <View key={row.key} className="flex-1 flex-row items-center gap-2">
              <View className={`h-3 w-3 rounded ${row.dot}`} />
              <Text variant="caption" className="text-ink">
                {t('progress:report.legend', { macro: row.label, percent: row.percent })}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title={t('progress:report.highlights')}>
        <Highlight
          icon="check"
          title={t('progress:report.bestDay')}
          detail={
            best
              ? t('progress:report.bestDayValue', { day: format(best.date, 'EEEE') })
              : t('progress:report.noDays')
          }
        />
        {topFoodId ? (
          <Highlight
            icon="list-view"
            title={t('progress:report.mostEaten')}
            detail={t('progress:report.mostEatenValue', {
              food: getFood(topFoodId).name,
              count: topCount,
            })}
          />
        ) : null}
        <Highlight
          icon="progress-ring"
          title={t('progress:report.water')}
          detail={t('progress:report.waterValue', { value: waterAverage })}
        />
      </Card>
    </Screen>
  )
}

function Highlight({
  icon,
  title,
  detail,
}: {
  icon: 'check' | 'list-view' | 'progress-ring'
  title: string
  detail: string
}) {
  return (
    <View className="flex-row items-start gap-3" accessible>
      <Icon set="ui" name={icon} size={22} />
      <View className="min-w-0 flex-1">
        <Text variant="label">{title}</Text>
        <Text variant="meta">{detail}</Text>
      </View>
    </View>
  )
}
