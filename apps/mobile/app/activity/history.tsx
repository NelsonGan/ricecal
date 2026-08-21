import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { today as todayKey, useActivitySessions, useActivitySummary } from '@/data'
import { count, duration, SessionRow } from '@/features/activity'
import { type Stat, StatRow } from '@/features/shared'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { AppBar, Card, EmptyState, Screen, Skeleton } from '@/ui'

/**
 * A6: every workout, newest first.
 *
 * The week's three figures at the top come from `activity_summary` rather than
 * from counting the list below, and that is not a micro-optimisation — the list
 * is capped at a hundred rows and the summary is over the range, so counting
 * the list would quietly under-report a heavy month.
 */
export default function HistoryScreen() {
  const { t } = useTranslation(['activity', 'common'])
  const goBack = useBack('/(tabs)/activity')
  const router = useRouter()

  const sessions = useActivitySessions(null)
  const summary = useActivitySummary('7d')

  const stats: Stat[] = [
    {
      key: 'sessions',
      label: t('activity:history.sessions'),
      value: String(summary.data?.sessions ?? 0),
    },
    {
      key: 'time',
      label: t('activity:history.time'),
      value: duration((summary.data?.sessionMinutes ?? 0) * 60),
    },
    {
      key: 'burned',
      label: t('activity:history.burned'),
      // With its unit. The two tiles beside it carry theirs — "6" is a count and
      // "4h 48m" says what it is — and this one read as a bare "1,420" next to a
      // column of session rows that each say "kcal" under their number.
      value: t('activity:unit.kcal', { value: count(summary.data?.sessionKcal ?? 0) }),
    },
  ]

  const rows = sessions.data ?? []

  return (
    <Screen>
      <AppBar
        title={t('activity:history.title')}
        onBack={goBack}
        backLabel={t('common:action.back')}
      />

      <Card title={t('activity:history.weekTitle')}>
        {summary.isPending ? <Skeleton className="h-[52px] w-full" /> : <StatRow stats={stats} />}
      </Card>

      {sessions.isPending ? (
        <Card>
          <Skeleton className="h-[220px] w-full" />
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('activity:history.empty')}
          description={t('activity:history.emptyBody')}
          icon={{ set: 'body', name: 'running-shoe' }}
        />
      ) : (
        <Card title={t('activity:history.allTitle')} flush>
          <View className="px-7">
            {rows.map((session, index) => (
              <SessionRow
                key={session.id}
                session={session}
                dayLabel={dayLabel(session.date, {
                  today: t('common:date.today'),
                  yesterday: t('common:date.yesterday'),
                })}
                divider={index < rows.length - 1}
                onPress={() =>
                  router.push({
                    pathname: '/activity/workout/[id]',
                    params: { id: session.id },
                  })
                }
              />
            ))}
          </View>
        </Card>
      )}
    </Screen>
  )
}

/**
 * "Today", "Yesterday", "Wed", "12 Mar".
 *
 * Named days for the two everyone thinks of by name, a weekday inside the last
 * week, a date beyond it. A list that says "Mon" for two different Mondays is a
 * list you have to count backwards through.
 *
 * The two translated words are passed in rather than `t` itself. `t` from a
 * typed bundle is not assignable to `(key: string) => string` — the key union is
 * the whole point of the typing — and widening the parameter to take it would
 * give up key checking inside this function.
 */
function dayLabel(date: string, named: { today: string; yesterday: string }): string {
  const days = differenceInCalendarDays(parseISO(todayKey()), parseISO(date))
  if (days === 0) return named.today
  if (days === 1) return named.yesterday
  if (days < 7) return format(parseISO(date), 'EEE')
  return format(parseISO(date), datePattern('dayMonth'))
}
