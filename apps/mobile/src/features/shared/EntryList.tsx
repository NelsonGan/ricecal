import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, View } from 'react-native'

import type { DayLog, Entry } from '@/data'
import { useMealPhotoUrl, useRefiningEntries } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { portionLabel } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Card, Icon, Text } from '@/ui'
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

  // A fix-by-typing correction in flight: the entry exists but is being
  // reworked on the server, so its row shows the work instead of stale
  // numbers. Checked before everything else — a refining row is not tappable.
  const refining = useRefiningEntries()
  if (refining.ids.includes(entry.id)) {
    return <AnalysingRow entry={entry} mode="refine" />
  }

  // A snap in flight has no dish yet. It still gets a row — written the moment
  // the shutter fired — so the day is complete while the model is thinking.
  if (entry.status === 'analysing') {
    return <AnalysingRow entry={entry} />
  }
  if (entry.status === 'failed') {
    return (
      <ItemRow
        title={t('logging:today.analysisFailedTitle')}
        icon={{ set: 'system', name: 'camera' }}
        photoUri={entry.localPhotoUri}
        value="—"
        detail={t('logging:today.analysisFailedHint')}
        onPress={onFix ? () => onFix(entry) : undefined}
      />
    )
  }

  // Cleaned, because the label is whatever the catalogue import carried: half
  // of them are measurements rather than portions. See `servingUnit`.
  const portion = portionLabel(entry.quantity, entry.servingLabel, t('logging:detail.servingWord'))

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

/** How often the status line changes while a scan runs. */
const PHRASE_MS = 4200

/**
 * How long the bar takes to reach its ceiling.
 *
 * Paced for the slow end of a real scan, not the fast end. A photo is a vision
 * call, a handful of catalogue searches and often a second model call — twenty
 * seconds is ordinary and thirty happens. At eighteen seconds the bar was
 * parked at the ceiling for the half of the wait that felt longest, which is
 * the one thing a progress bar must not do.
 */
const FILL_MS = 45000

/**
 * A snap being scanned: the photo, a line of rotating status text, and a bar
 * that fills most of the way and waits.
 *
 * The progress is honest theatre. The scan is three model calls whose timing
 * this client cannot observe, so the bar eases toward — never reaches — full:
 * what it communicates is "working, not stuck", which a static spinner said
 * too weakly for something that can take ten seconds. The row is replaced
 * wholesale by the real entry when the scan lands, so the bar never has to
 * finish; the phrases rotate so the wait reads as stages rather than a hang.
 */
function AnalysingRow({ entry, mode = 'scan' }: { entry: Entry; mode?: 'scan' | 'refine' }) {
  const { t } = useTranslation(['logging'])
  const colors = useThemeColors()
  // A refining entry's photo is already in the bucket, not on disk.
  const { data: signedUrl } = useMealPhotoUrl(entry.photoPath)

  const phrases =
    mode === 'refine'
      ? [t('logging:today.refiningApply'), t('logging:today.refiningCount')]
      : [
          t('logging:today.scanningRead'),
          t('logging:today.scanningMatch'),
          t('logging:today.scanningPortion'),
          t('logging:today.scanningCount'),
        ]
  const [phrase, setPhrase] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPhrase((current) => current + 1), PHRASE_MS)
    return () => clearInterval(id)
  }, [])

  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    // Fast at first, asymptotic at the end — the shape every real download
    // bar has, which is what makes it read as progress.
    Animated.timing(progress, {
      toValue: 1,
      duration: FILL_MS,
      // Quadratic rather than cubic: cubic spent its first second covering a
      // third of the bar and then crawled, which reads as a stall.
      easing: Easing.out(Easing.quad),
      // Width in percent is a layout property, so the native driver cannot
      // animate it.
      useNativeDriver: false,
    }).start()
  }, [progress])
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['6%', '92%'] })

  const label = phrases[phrase % phrases.length]

  return (
    <View
      className="flex-row items-center gap-3 rounded-tile"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {/* Same 56pt tile as ItemRow, so the row sits flush in the list. */}
      <View className="h-[56px] w-[56px] items-center justify-center overflow-hidden rounded-tile bg-track">
        {entry.localPhotoUri || signedUrl ? (
          <Image
            source={{ uri: entry.localPhotoUri ?? signedUrl }}
            style={{ flex: 1, width: '100%', opacity: 0.55 }}
            contentFit="cover"
          />
        ) : (
          <Icon set="system" name="camera" size={40} />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-2">
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        <View className="h-[6px] overflow-hidden rounded-full bg-track">
          <Animated.View
            style={{
              width,
              height: '100%',
              borderRadius: 999,
              backgroundColor: colors.pandan,
            }}
          />
        </View>
      </View>
    </View>
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
