import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, View } from 'react-native'
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import type { DayLog, Entry } from '@/data'
import { storedImageSource, useMealPhotoUrl, useRefiningEntries } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { portionLabel } from '@/lib/portions'
import { useThemeColors } from '@/theme/useTheme'
import { Card, cn, Icon, IconButton, Text } from '@/ui'
import { ItemRow, ROW_TILE, ROW_TILE_ICON } from './ItemRow'
import { MealPhoto } from './MealPhoto'
import { SwipeRow } from './SwipeRow'

export type EntryListProps = {
  day: DayLog
  /** Receives the whole entry: opening its detail needs the food id too. */
  onPressEntry?: (entry: Entry) => void
  /**
   * A snap the model could not read. Given a separate handler because the row
   * has no dish to open — the only thing to do with it is name it by hand.
   */
  onFixEntry?: (entry: Entry) => void
  /** Swiping a row left reveals this. Rows are not swipeable without it. */
  onDeleteEntry?: (entry: Entry) => void
  /**
   * A snap the scan found no food in. Nothing was logged, so there is nothing
   * to delete — the row is dismissed and goes.
   */
  onDismissEntry?: (entry: Entry) => void
}

/**
 * Everything logged today, in one list, in the order it was eaten.
 *
 * This was four cards — breakfast, lunch, dinner, snack — and the grouping cost
 * more than it explained. Three of them were usually empty and each empty one still
 * took a heading and an add button, so a day with two entries in it filled a screen
 * with furniture. A chronological list says the same thing in the order it happened,
 * and an entry no longer carries a meal at all: the column is gone, and meal TIMES
 * survive only where they mean something, as the hours a reminder fires.
 *
 * Which is why the detail line carries the time. It is the only thing saying where
 * in the day a row belongs, and it is the more useful half of what the meal headings
 * were doing.
 *
 * Nothing here looks a dish up. `food_log_details` returns each entry with its name,
 * its illustration and its macros already costed, so a row is one object and the
 * list is one loop.
 */
export function EntryList({
  day,
  onPressEntry,
  onFixEntry,
  onDeleteEntry,
  onDismissEntry,
}: EntryListProps) {
  const { t } = useTranslation(['logging', 'common'])

  // Newest first. The day used to read in the order it happened, which put the
  // meal just logged at the bottom of a growing list — and the thing a user
  // looks at right after logging is the thing they just logged. By evening it
  // was a scroll away, under breakfast.
  const entries = [...day.entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
  if (entries.length === 0) return null

  return (
    <Card
      title={t('logging:today.logHeading', {
        kcal: sumMacros(entries).kcal.toLocaleString(),
      })}
    >
      {entries.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          onPress={onPressEntry}
          onFix={onFixEntry}
          onDelete={onDeleteEntry}
          onDismiss={onDismissEntry}
        />
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
  onDelete,
  onDismiss,
}: {
  entry: Entry
  onPress?: (entry: Entry) => void
  onFix?: (entry: Entry) => void
  onDelete?: (entry: Entry) => void
  onDismiss?: (entry: Entry) => void
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
  if (entry.status === 'analysing' || entry.status === 'waiting') {
    // A row read back from storage — or one whose request timed out — is still
    // working, but its progress bar would be starting over for a scan that
    // began before the app did. `resumed` is the honest spinner for both: the
    // work is real and its progress is not something this process can know.
    return (
      <AnalysingRow
        entry={entry}
        mode={
          entry.restored || entry.status === 'waiting'
            ? 'resumed'
            : entry.source === 'text'
              ? 'describe'
              : 'scan'
        }
      />
    )
  }
  if (entry.status === 'nofood') {
    return (
      <ItemRow
        title={
          entry.source === 'text'
            ? t('logging:today.noFoodTypedTitle')
            : t('logging:today.noFoodTitle')
        }
        icon={{ set: 'system', name: entry.source === 'text' ? 'sparkle' : 'camera' }}
        photoUri={entry.localPhotoUri}
        value=""
        detail={t('logging:today.noFoodHint')}
        trailing={
          <IconButton
            size="sm"
            variant="neutral"
            accessibilityLabel={t('logging:today.noFoodDismiss')}
            onPress={() => onDismiss?.(entry)}
          >
            <Icon set="ui" name="close" size={16} />
          </IconButton>
        }
      />
    )
  }
  if (entry.status === 'failed') {
    return (
      <ItemRow
        title={t('logging:today.analysisFailedTitle')}
        icon={{ set: 'system', name: entry.source === 'text' ? 'sparkle' : 'camera' }}
        photoUri={entry.localPhotoUri}
        value="—"
        // A failed typed meal still has the sentence on it, which is the one
        // thing worth showing: it is what the user would have to type again.
        detail={entry.foodName || t('logging:today.analysisFailedHint')}
        onPress={onFix ? () => onFix(entry) : undefined}
      />
    )
  }

  // Cleaned, because the label is whatever the catalogue import carried: half
  // of them are measurements rather than portions. See `servingUnit`.
  const portion = portionLabel(entry.quantity, entry.servingLabel, t('logging:detail.servingWord'))

  const row = (open?: () => void) => (
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
      onPress={open}
    />
  )

  // Swiping is the shortcut, not the only way: the detail screen still has a
  // delete, which is where a screen reader user (and anyone who wants to look
  // before removing) goes.
  // A swipeable row hands its tap to `SwipeRow` and renders as a plain view,
  // so one gesture decides between the press and the drag — see the note there.
  if (!onDelete) return row(onPress ? () => onPress(entry) : undefined)
  return (
    <SwipeRow
      onDelete={() => onDelete(entry)}
      onPress={onPress ? () => onPress(entry) : undefined}
      deleteLabel={t('logging:today.deleteEntry')}
    >
      {row()}
    </SwipeRow>
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
function AnalysingRow({
  entry,
  mode = 'scan',
}: {
  entry: Entry
  mode?: 'scan' | 'refine' | 'resumed' | 'describe'
}) {
  const { t } = useTranslation(['logging'])
  const colors = useThemeColors()
  // A refining entry's photo is already in the bucket, not on disk.
  const { data: photoUrl } = useMealPhotoUrl(entry.photoPath)
  const photo = storedImageSource(entry.photoPath, photoUrl, entry.localPhotoUri)

  /**
   * Whether this row is a typed meal, asked of the ENTRY and not of `mode`.
   *
   * `mode` is about the progress bar — which stages to name, and whether to
   * draw a bar at all — and `resumed` answers that for a row read back from
   * storage whichever way it was logged. Asking it what the row IS put a
   * camera and "Reading your plate" over a sentence somebody typed, every time
   * the app restarted mid-scan.
   */
  const typed = entry.source === 'text'

  const phrases =
    mode === 'refine'
      ? [t('logging:today.refiningApply'), t('logging:today.refiningCount')]
      : mode === 'resumed'
        ? [typed ? t('logging:today.describing') : t('logging:today.analysing')]
        : mode === 'describe'
          ? [
              // The same cascade, so the same three stages after the first —
              // only the reading is of words rather than of a photograph.
              t('logging:today.describingRead'),
              t('logging:today.scanningMatch'),
              t('logging:today.scanningPortion'),
              t('logging:today.scanningCount'),
            ]
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
      {/* ItemRow's own tile, so this row sits flush with the ones around it. */}
      <View
        className={cn(
          ROW_TILE,
          'items-center justify-center overflow-hidden rounded-tile bg-track',
        )}
      >
        {photo ? (
          // Dimmed the whole time rather than only while busy: this row IS the
          // busy one, and the plate under it has no dish yet.
          <MealPhoto source={photo} dimmed />
        ) : (
          <Icon set="system" name={typed ? 'sparkle' : 'camera'} size={ROW_TILE_ICON} />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-2">
        {/* Shimmering rather than merely swapping. The line changes every few
            seconds and a hard cut between two sentences reads as a glitch; a
            slow breath through it says the same thing as "still working" that
            the bar underneath does, in the one place the eye already is. */}
        <Shimmer>
          <Text variant="bodyStrong" numberOfLines={1}>
            {label}
          </Text>
        </Shimmer>
        {/* What the user typed, while it is being read. A snapped plate has
            its photograph in the tile to the left and needs no caption; a
            typed one has nothing on the row at all until the dish lands, and
            a spinner over an empty line reads as the app having lost it. A
            resumed row needs it most of all — it has no progress bar either. */}
        {typed && entry.foodName ? (
          <Text variant="meta" numberOfLines={1}>
            {entry.foodName}
          </Text>
        ) : null}
        {/* A resumed row has no bar. The bar is timed from the shutter, and
            this scan started before the app did — restarting it at zero would
            be a progress indicator that is certainly wrong. */}
        {mode === 'resumed' ? null : (
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
        )}
      </View>
    </View>
  )
}

/**
 * A slow pulse over whatever is inside it.
 *
 * Reanimated rather than the `Animated` above it because this repeats forever
 * and belongs on the UI thread — the bar next to it is a one-shot and can
 * afford the bridge. Opacity rather than a gradient sweep, for the same reason
 * `Skeleton` uses opacity: a sweep needs a mask per element, and this is one
 * line of text.
 */
function Shimmer({ children }: { children: ReactNode }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 1100, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
      -1,
      true,
    )
  }, [pulse])
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }))
  return <Reanimated.View style={style}>{children}</Reanimated.View>
}

/** "8:20 am". Locale-independent on purpose: the interface is English. */
function formatTime(iso: string): string {
  const date = new Date(iso)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const suffix = hours < 12 ? 'am' : 'pm'
  const twelve = hours % 12 === 0 ? 12 : hours % 12
  return `${twelve}:${minutes} ${suffix}`
}

export { formatTime }
