import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { today, useDayLog, useTargets, useWorkouts } from '@/data'
import { BarChart, StatRow } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { sumMacros } from '@/lib/nutrition'
import { AppBar, Button, Card, Divider, EmptyState, Icon, Screen, Text } from '@/ui'

/** P3 SPORT SESSION */
export default function SessionScreen() {
  const { t } = useTranslation(['progress', 'common'])
  const goBack = useBack('/trends')
  const params = useLocalSearchParams<{ id: string }>()
  const date = today()
  const day = useDayLog(date)
  const { data: sessions = [] } = useWorkouts(date)
  const { data: targets } = useTargets()

  const session = sessions.find((entry) => entry.id === params.id)

  if (!session) {
    return (
      <Screen>
        <AppBar
          title={t('progress:tabs.activity')}
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
        />
        <EmptyState
          title={t('progress:activity.noSessions')}
          icon={{ set: 'body', name: 'running-shoe' }}
        />
      </Screen>
    )
  }

  // A workout is a credit against the day, so the budget it leaves behind is the
  // number worth showing — not the burn on its own.
  const budget = (targets?.kcal ?? 0) + session.kcal - sumMacros(day.entries).kcal

  const pace = session.distanceKm
    ? formatPace((session.minutes * 60) / session.distanceKm)
    : undefined

  return (
    <Screen
      footer={
        <Button fullWidth onPress={() => goBack()}>
          {t('common:action.done')}
        </Button>
      }
    >
      <AppBar title={session.title} onBack={() => goBack()} backLabel={t('common:a11y.back')} />

      <View className="h-[140px] items-center justify-center rounded-card border-[3px] border-line bg-track">
        <Icon set="body" name="route-pin" size={96} />
      </View>

      <Card>
        <StatRow
          size="md"
          stats={[
            {
              key: 'distance',
              label: t('progress:session.distance'),
              value: session.distanceKm
                ? t('progress:session.kmValue', { value: session.distanceKm })
                : '—',
            },
            {
              key: 'time',
              label: t('progress:session.time'),
              value: `${session.minutes}:00`,
            },
            { key: 'pace', label: t('progress:session.pace'), value: pace ?? '—' },
          ]}
        />

        <Divider />

        <StatRow
          size="md"
          stats={[
            {
              key: 'burned',
              label: t('progress:session.burned'),
              value: t('progress:session.kcalValue', { value: session.kcal }),
            },
            {
              key: 'hr',
              label: t('progress:session.avgHr'),
              value: session.avgHr ? t('progress:session.bpmValue', { value: session.avgHr }) : '—',
            },
            {
              key: 'elev',
              label: t('progress:session.elevation'),
              value: session.elevationM
                ? t('progress:session.metresValue', { value: session.elevationM })
                : '—',
            },
          ]}
        />
      </Card>

      {session.splitSeconds?.length ? (
        <Card title={t('progress:session.splits')}>
          <BarChart
            tone="hibiscus"
            // Splits cluster within a few seconds of each other, so from zero
            // every kilometre looks identical — the difference is the point.
            scale="range"
            bars={session.splitSeconds.map((seconds, index, all) => ({
              key: `split-${index}`,
              label: String(index + 1),
              value: seconds,
              highlight: index === all.length - 1,
            }))}
            accessibilityLabel={t('progress:session.splits')}
          />
        </Card>
      ) : null}

      <Card tone="pandan">
        <Text variant="meta">
          {t('progress:session.creditNote', {
            kcal: session.kcal,
            budget: Math.max(0, budget).toLocaleString(),
          })}
        </Text>
      </Card>
    </Screen>
  )
}

/** Seconds per km as m:ss. */
function formatPace(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = Math.round(secondsPerKm % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
