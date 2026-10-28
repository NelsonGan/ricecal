import { FREE_PHOTO_RETENTION_DAYS } from '@ricecal/shared'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type PhotoRemoval,
  storedImageSource,
  useEntitlement,
  useMealPhotoUrl,
  usePhotoRemovals,
} from '@/data'
import { useRequirePro } from '@/features/paywall'
import { MealPhoto } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Card, EmptyState, Screen, Skeleton, Text } from '@/ui'

/** Photos to a row. Small, since this is a list of what goes rather than an album. */
const PER_ROW = 4

/**
 * The meal photos a free account is about to lose, by the day each goes, with
 * the one thing that keeps them. Reached from the notice on Today and from the
 * push (`kind: 'photos'`).
 *
 * The meals themselves stay, and the screen says so: losing the picture is
 * the whole of it, and an account that thought its diary was going would
 * reasonably panic.
 */
export default function PhotoRemovalsScreen() {
  const { t } = useTranslation(['logging', 'common'])
  const back = useBack('/today')
  const { entitled, loading: checking, unknown } = useEntitlement()
  const removals = usePhotoRemovals({ fresh: true })
  const requirePro = useRequirePro()
  const rows = entitled ? [] : (removals.data ?? [])
  const days = byDay(rows)

  return (
    <Screen
      header={
        <AppBar title={t('photoRemovals.title')} onBack={back} backLabel={t('common:a11y.back')} />
      }
      footer={
        rows.length > 0 ? (
          <Button fullWidth onPress={() => requirePro('photo_retention')}>
            {t('photoRemovals.keep')}
          </Button>
        ) : undefined
      }
    >
      <View className="gap-lg pb-xl">
        {/* The free window, which a Pro account (here from an older push) does
            not have, so it is not told about it. */}
        {entitled ? null : (
          <Text variant="meta">
            {t('photoRemovals.intro', { days: FREE_PHOTO_RETENTION_DAYS })}
          </Text>
        )}
        {/* Whether the account is free decides whether there is a list at all,
            so until that is known this waits rather than saying nothing goes. */}
        {!entitled && unknown && !removals.data ? (
          <QueryNotice error={false} paused retry={() => removals.refetch()} />
        ) : !entitled && (checking || removals.isPending) ? (
          <View className="flex-row gap-2">
            {Array.from({ length: PER_ROW }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders
              <Skeleton key={index} className="aspect-square flex-1 rounded-tile" />
            ))}
          </View>
        ) : !removals.data && (removals.isError || removals.fetchStatus === 'paused') ? (
          <QueryNotice
            error={removals.isError}
            paused={removals.fetchStatus === 'paused'}
            retry={() => removals.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('photoRemovals.empty')} icon={{ set: 'food', name: 'lunch-box' }} />
        ) : (
          days.map((day) => (
            <Card key={day.key}>
              <View className="flex-row items-center justify-between">
                <Text variant="label">{format(day.date, datePattern('weekdayDayMonthLong'))}</Text>
                <Text variant="meta">{day.rows.length}</Text>
              </View>
              {chunk(day.rows, PER_ROW).map((row) => (
                <View key={row[0].id} className="flex-row gap-2">
                  {row.map((photo) => (
                    <Thumb key={photo.id} photo={photo} />
                  ))}
                  {Array.from({ length: PER_ROW - row.length }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: spacers that never reorder
                    <View key={index} className="flex-1" />
                  ))}
                </View>
              ))}
            </Card>
          ))
        )}
      </View>
    </Screen>
  )
}

function Thumb({ photo }: { photo: PhotoRemoval }) {
  const url = useMealPhotoUrl(photo.photo_path)
  const source = storedImageSource(photo.photo_path, url.data)
  return (
    <View className="aspect-square flex-1 overflow-hidden rounded-sm border border-line bg-surface-alt">
      {source ? <MealPhoto source={source} accessibilityLabel={photo.item_name ?? ''} /> : null}
    </View>
  )
}

/** Grouped by the calendar day each photo goes, on this phone's clock. */
function byDay(rows: readonly PhotoRemoval[]) {
  const days: { key: string; date: Date; rows: PhotoRemoval[] }[] = []
  const now = new Date()
  for (const row of rows) {
    // One already past due goes within the hour, so it is listed under today.
    const due = parseISO(row.removes_at)
    const date = due < now ? now : due
    const key = format(date, 'yyyy-MM-dd')
    const last = days.at(-1)
    if (last?.key === key) last.rows.push(row)
    else days.push({ key, date, rows: [row] })
  }
  return days
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
