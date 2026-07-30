import { useTranslation } from 'react-i18next'

import type { DayLog, Entry } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { Card } from '@/ui'
import { ItemRow } from './ItemRow'

export type EntryListProps = {
  day: DayLog
  /** Receives the whole entry: opening its detail needs the food id too. */
  onPressEntry?: (entry: Entry) => void
  /**
   * A snap the model could not read. Given a separate handler because the row
   * has no dish to open — the only thing to do with it is name it by hand.
   */
  onFixEntry?: (entry: Entry) => void
}

/**
 * Everything logged today, in one list, in the order it was eaten.
 *
 * This was four cards — breakfast, lunch, dinner, snack — and the grouping cost
 * more than it explained. Three of them were usually empty and each empty one still
 * took a heading and an add button, so a day with two entries in it filled a screen
 * with furniture. A chronological list says the same thing in the order it happened,
 * and the meal is still on every entry: it drives the reminders, it decides what the
 * quick selector suggests, and it is editable on the dish.
 *
 * Which is why the detail line carries the time. It is the only thing left saying
 * where in the day a row belongs, and it is the more useful half of what the meal
 * headings were doing.
 *
 * Nothing here looks a dish up. `food_log_details` returns each entry with its name,
 * its illustration and its macros already costed, so a row is one object and the
 * list is one loop.
 */
export function EntryList({ day, onPressEntry, onFixEntry }: EntryListProps) {
  const { t } = useTranslation(['logging', 'common'])

  // Oldest first, which is the order the day happened in. Pending snaps are
  // already merged in by time upstream.
  const entries = [...day.entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  if (entries.length === 0) return null

  return (
    <Card
      title={t('logging:today.logHeading', {
        kcal: sumMacros(entries).kcal.toLocaleString(),
      })}
    >
      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} onPress={onPressEntry} onFix={onFixEntry} />
      ))}
    </Card>
  )
}

/**
 * One logged item.
 *
 * Its own component so the photo can be resolved per row — a stored plate needs
 * a signed URL, which is a query, and a hook cannot run inside a `.map`.
 */
function EntryRow({
  entry,
  onPress,
  onFix,
}: {
  entry: Entry
  onPress?: (entry: Entry) => void
  onFix?: (entry: Entry) => void
}) {
  const { t } = useTranslation(['logging', 'common'])

  // A snap in flight has no dish yet. It still gets a row — written the moment
  // the shutter fired — so the day is complete while the model is thinking.
  if (entry.status) {
    const analysing = entry.status === 'analysing'
    return (
      <ItemRow
        title={analysing ? t('logging:today.analysing') : t('logging:today.analysisFailedTitle')}
        icon={{ set: 'system', name: 'camera' }}
        photoUri={entry.localPhotoUri}
        busy={analysing}
        value={analysing ? '' : '—'}
        detail={
          analysing ? t('logging:today.analysingHint') : t('logging:today.analysisFailedHint')
        }
        onPress={analysing || !onFix ? undefined : () => onFix(entry)}
      />
    )
  }

  const portion = `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${entry.servingLabel}`

  return (
    <ItemRow
      title={entry.foodName}
      icon={entry.icon}
      photoPath={entry.photoPath}
      value={entry.macros.kcal}
      unit="kcal"
      // When, and how much. Both fit, and each answers a question the other does
      // not — the time is where in the day this was, the portion is what the
      // calories are for.
      detail={`${formatTime(entry.loggedAt)} · ${portion}`}
      onPress={onPress ? () => onPress(entry) : undefined}
    />
  )
}

/** "8:20 am". Locale-independent on purpose: the mock data is Malaysian. */
function formatTime(iso: string): string {
  const date = new Date(iso)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const suffix = hours < 12 ? 'am' : 'pm'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${minutes} ${suffix}`
}

export { formatTime }
