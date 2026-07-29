import { subDays } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { dateKey, today, useBurnRange, useDayRings, useWorkouts } from '@/data'
import { BarChart, formatTime, ItemRow } from '@/features/shared'
import { progressOf } from '@/lib/nutrition'
import { Badge, CalorieRing, Card, EmptyState, MacroBar, Text } from '@/ui'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** P2 ACTIVITY */
export function ActivityPanel() {
  const { t } = useTranslation(['progress', 'common'])
  const router = useRouter()
  const date = today()
  const { data: rings } = useDayRings(date)
  const { data: sessions = [] } = useWorkouts(date)

  // Monday-first, the way the chart is labelled.
  const weekStart = dateKey(subDays(new Date(date), 6))
  const { data: burnByDate = {} } = useBurnRange(weekStart, date)
  const weeklyBurn = Array.from({ length: 7 }, (_, index) =>
    Math.round(burnByDate[dateKey(subDays(new Date(date), 6 - index))] ?? 0),
  )

  const burned = sessions.reduce((total, session) => total + session.kcal, 0)

  return (
    <>
      <Badge tone="hibiscus" className="self-start">
        <Text variant="caption" className="text-hibiscus-ink">
          {t('progress:activity.burned', { count: burned })}
        </Text>
      </Badge>

      {/* No row means no watch has synced this day, which is the common case
          until an integration exists. An empty state says so rather than
          drawing three rings at zero, which reads as a bad day. */}
      {rings ? (
        <Card>
          <View className="flex-row items-center gap-4">
            <CalorieRing
              value={rings.steps}
              goal={10000}
              size={110}
              thickness={14}
              tone="hibiscus"
              centerLabel={rings.steps.toLocaleString()}
              centerCaption={t('progress:activity.steps')}
            />
            <View className="flex-1 gap-2.5">
              <MacroBar
                label={t('progress:activity.move')}
                amount={t('progress:activity.moveValue', {
                  done: rings.moveKcal,
                  goal: rings.moveGoal,
                })}
                value={progressOf(rings.moveKcal, rings.moveGoal)}
                tone="hibiscus"
              />
              <MacroBar
                label={t('progress:activity.exercise')}
                amount={t('progress:activity.exerciseValue', {
                  done: rings.exerciseMin,
                  goal: rings.exerciseGoal,
                })}
                value={progressOf(rings.exerciseMin, rings.exerciseGoal)}
                tone="pandan"
              />
              <MacroBar
                label={t('progress:activity.stand')}
                amount={t('progress:activity.standValue', {
                  done: rings.standHours,
                  goal: rings.standGoal,
                })}
                value={progressOf(rings.standHours, rings.standGoal)}
                tone="water"
              />
            </View>
          </View>
        </Card>
      ) : (
        <Card>
          <EmptyState
            title={t('progress:activity.noRingsTitle')}
            description={t('progress:activity.noRingsBody')}
            icon={{ set: 'body', name: 'footprints' }}
          />
        </Card>
      )}

      <Card title={t('progress:activity.today')}>
        {sessions.length === 0 ? (
          <Text variant="meta">{t('progress:activity.noSessions')}</Text>
        ) : null}

        {sessions.map((session) => (
          <ItemRow
            key={session.id}
            title={session.title}
            icon={session.icon}
            value={session.kcal}
            unit={t('common:unit.kcal')}
            // A workout is a debit against the day, and reads in the same
            // colour the burn badge above it uses.
            valueTone="hibiscus"
            detail={[
              formatTime(session.startedAt),
              `${session.minutes} min`,
              session.distanceKm ? `${session.distanceKm} km` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => router.push(`/progress/session/${session.id}`)}
          />
        ))}
      </Card>

      <Card title={t('progress:activity.weeklyBurn')}>
        <BarChart
          tone="hibiscus"
          bars={weeklyBurn.map((value, index) => ({
            key: `day-${index}`,
            label: WEEKDAYS[index],
            value,
            highlight: index === weeklyBurn.length - 1,
          }))}
          accessibilityLabel={t('progress:activity.weeklyBurn')}
        />
      </Card>

      {rings ? (
        <Card>
          <View className="flex-row items-center gap-3">
            <View className="h-[34px] w-[34px] rounded-sm bg-pandan" />
            <Text variant="meta" className="flex-1">
              {t('progress:activity.synced', { minutes: rings.syncedMinutesAgo })}
            </Text>
          </View>
        </Card>
      ) : null}
    </>
  )
}
