import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type LogSnapshot,
  packetFoodId,
  snapshotFromRecipe,
  today,
  useActivityDay,
  useDayLog,
  useDescribeFood,
  useLogFood,
  useScanQuota,
  useSelectedDate,
  useSettings,
  useSnapFood,
  useTargets,
} from '@/data'
import {
  type CaptureMode,
  DescribePanel,
  FoodSearchPanel,
  InlineCamera,
  QuickAction,
} from '@/features/logging'
import { useRequirePro } from '@/features/paywall'
import { RecipePanel } from '@/features/recipes'
import { dateOffset, type LogMethod, track } from '@/lib/analytics'
import { useBack } from '@/lib/navigation'
import { sumMacros } from '@/lib/nutrition'
import { SheetSurface, Tabs, Text } from '@/ui'

/**
 * Which of the four quick actions has its panel open below the row, if any.
 *
 * A union rather than a flag each, because they share the space under the row:
 * opening the camera has to put search away, and the other way round.
 *
 * Scanning a packet is NOT one of them any more. It is a tab inside the camera,
 * because it was never a different action — it is the same gesture, pointing
 * the phone at the thing, and a fifth tile made the row of choices longer to
 * answer a question the user had already answered by reaching for the camera.
 */
type Panel = 'camera' | 'describe' | 'search' | 'recipes' | null

const PANELS = ['camera', 'describe', 'search', 'recipes'] as const

/** A route param is whatever was in the URL, so it is checked before it is used. */
const isPanel = (value: string | undefined): value is NonNullable<Panel> =>
  PANELS.includes(value as (typeof PANELS)[number])

/**
 * `?panel=barcode` still means something, and it is the reason this mapping
 * exists rather than a rename.
 *
 * A packet nothing could identify offers "Scan again", which has to land on the
 * day with the scanner live — see `reopenLog` in the food detail screen. That
 * link predates the tabs and points at a panel that is now a tab, so it resolves
 * to the camera opened on the barcode side rather than to nothing.
 */
const openingPanel = (value: string | undefined): NonNullable<Panel> =>
  value === 'barcode' ? 'camera' : isPanel(value) ? value : 'camera'

const openingMode = (value: string | undefined): CaptureMode =>
  value === 'barcode' ? 'barcode' : 'meal'

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
  const { t } = useTranslation(['logging', 'recipes', 'common'])
  const router = useRouter()
  const goBack = useBack('/today')
  const logFood = useLogFood()
  const snapFood = useSnapFood()
  const describeFood = useDescribeFood()
  const { selectedDate } = useSelectedDate()
  const day = useDayLog(selectedDate)
  const { data: targets } = useTargets()
  const { data: activity } = useActivityDay(selectedDate)
  const { data: settings } = useSettings()
  /**
   * Which panel to open with, for the routes that arrive knowing.
   *
   * The scan flow is the one that needs it: a packet nothing could identify
   * offers "Scan again", and what that has to mean is the day with the
   * viewfinder already open on it — not the sheet as if the user had just
   * pressed the log button and had to find Scan for themselves.
   */
  const { panel: opening } = useLocalSearchParams<{ panel?: string }>()

  /**
   * The viewfinder, the search field and the recipe list all live inside this
   * sheet rather than in a screen of their own, so the day stays visible behind
   * them and nothing has to be dismissed twice. See the `Panel` union above.
   *
   * Snap is the default, so the log button opens on a camera pointed at the
   * food. It is what people came to do — the other three are how you log a meal
   * you are not looking at — and an extra tap to reach it was a tap spent on the
   * common case. Tapping Snap again closes it.
   */
  const [panel, setPanel] = useState<Panel>(() => openingPanel(opening))
  /**
   * Meal or barcode, within the camera. Seeded from the route so "Scan again"
   * lands on the scanner, and kept while the panel is closed and reopened so
   * somebody who came to scan does not have to say so twice.
   */
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => openingMode(opening))
  // Memoised because this screen holds a live camera preview, and a new array
  // on every render is a new prop on the strip above it.
  const captureTabs = useMemo(
    () => [
      { value: 'meal' as const, label: t('logging:capture.meal') },
      { value: 'barcode' as const, label: t('logging:capture.barcode') },
    ],
    [t],
  )
  const toggle = (next: NonNullable<Panel>) =>
    setPanel((current) => (current === next ? null : next))

  /**
   * The top of the logging funnel: the sheet is up, and nothing has been
   * written yet.
   *
   * ONCE PER PRESENTATION, on mount, with the panel it OPENED on — not on every
   * switch between the four. Which panel a user ends up logging from is already
   * on `Meal Logged`; tracking each toggle would add an event per undecided tap
   * and answer the same question worse.
   *
   * The ref is what makes "once" true through a re-render: this route is
   * remounted per presentation, so a plain effect with an empty dependency list
   * would already be right — but Fast Refresh re-runs it, and a funnel is not
   * worth debugging twice.
   */
  const announced = useRef(false)
  useEffect(() => {
    if (announced.current) return
    announced.current = true
    track('Log Sheet Opened', {
      panel: openingPanel(opening),
      date_offset: dateOffset(selectedDate, today()),
    })
  }, [opening, selectedDate])

  /**
   * `goal + active - eaten`, the same sum the ring on Today draws.
   *
   * IT USED TO BE `goal - eaten`, and this sheet opens over that ring. A day
   * with a walk on it therefore had two figures for one number on screen at
   * once — the ring reading "382 kcal left" behind a sheet whose header said
   * "0 kcal left" — which is the disagreement the invariant exists to stop.
   * Movement extends the budget everywhere or it extends it nowhere.
   *
   * `activeKcal` rather than the total burn, and skipped when the user has
   * turned the extension off, for the reasons written out beside the ring.
   */
  const burned = settings?.activity_extends_budget === false ? 0 : (activity?.activeKcal ?? 0)
  const left = (targets?.kcal ?? 0) + burned - sumMacros(day.entries).kcal

  // `replace`, for the same reason `openFood` below does it: this route is a
  // transparentModal, and a paywall pushed from inside one comes up stacked on
  // the sheet rather than over the app.
  const requirePro = useRequirePro({ navigate: 'replace' })
  // Only ever rendered under the viewfinder, so it is fetched with the sheet
  // rather than with the tab behind it.
  const quota = useScanQuota()

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

  // Takes the snapshot rather than a food, because one of the two things this
  // sheet adds is a recipe and the other is a catalogue dish. They build one
  // the same way and nothing downstream needs to know which it was.
  const add = (snapshot: LogSnapshot, method: LogMethod) => {
    // NOT GATED. Adding a dish from the catalogue, a scanned packet or a saved
    // recipe reaches no model and costs nothing to serve, and a free tier that
    // could not write those is a catalogue with a read-only diary attached.
    // What is metered is the SCAN — see the shutter below.
    //
    // `method` and `source` are two different questions and both are answered.
    // The column says how the numbers were obtained; `method` says which door
    // the user came through, which `entry_source` has no value for. See
    // `LogInput` in `data/entries.ts`.
    logFood.mutate({ snapshot, logDate: selectedDate, source: 'quickAdd', method })
    goBack()
  }

  return (
    /**
     * Capped with nothing open, full height with anything open. Two separate
     * reasons land on the same rule.
     *
     * Search, describe and recipes RAISE THE KEYBOARD. A capped sheet is padded
     * up off the bottom edge by `KeyboardAvoidingView`, and the strip left
     * behind shows the scrim through the curve of the keyboard's top corners —
     * the panel stops reading as attached to the bottom of the screen. Full
     * height keeps it where it is and lets the body inset itself instead.
     *
     * And describe is not scrollable. Its content is a field, a hint and a
     * button, so there is nothing to scroll — but a scroll view scrolls ITSELF
     * to reveal the first responder when the keyboard opens, and on the first
     * open, before the keyboard's real height is known, it overshoots and
     * carries the field off the top of the panel. With nothing to scroll there
     * is no scroll to get wrong.
     *
     * The camera raises no keyboard at all, and is full height for a different
     * reason: it now holds two tabs, and a sheet that changed height when you
     * moved between them would read as two features rather than one camera
     * doing two jobs. That was the argument for the scanner matching the
     * viewfinder's height back when they were separate panels; keeping the
     * sheet one size is the same argument, one level up.
     */
    <SheetSurface
      onClose={() => goBack()}
      scrollable={panel !== 'describe'}
      fullHeight={panel !== null}
    >
      {/* The heading is rendered here rather than through `title` so the
          remaining count can sit on the same line, right aligned, the way the
          design puts it.

          NO SUGGESTION GLYPH BESIDE IT ANY MORE. "I do not know what to eat"
          was here for a while, on the argument that somebody who opens this
          sheet has not decided what the meal is — which is true and was not
          enough. It was two taps deep, inside a sheet whose four tiles all
          assume the meal IS decided, so an account that never pressed the log
          button never learnt the feature existed. It is a row on Today now,
          under the week strip. See `SuggestAction`. */}
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="subtitle" className="shrink" numberOfLines={1}>
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
        {/* No "Say". Dictation would be typing without the keyboard, and typing
            already reaches the same cascade. */}
        <QuickAction
          label={t('logging:selector.describe')}
          icon={{ set: 'system', name: 'sparkle' }}
          tone="kaya"
          selected={panel === 'describe'}
          onPress={() => {
            // Gated at the TAP, unlike the shutter beside it. The camera is
            // free and framing a plate is most of what makes it legible, so
            // that panel opens for everybody; this one is Pro outright, and
            // opening it would have somebody type out a meal before being told
            // the sentence has nowhere to go.
            if (panel !== 'describe' && !requirePro('describe')) return
            toggle('describe')
          }}
        />
        <QuickAction
          label={t('logging:selector.search')}
          icon={{ set: 'ui', name: 'search' }}
          selected={panel === 'search'}
          onPress={() => toggle('search')}
        />
        {/* Something you cooked. The fourth way in, and the only one that logs a
            dish the user wrote themselves — everything to its left resolves to
            the shared catalogue one way or another. */}
        <QuickAction
          label={t('recipes:log.action')}
          icon={{ set: 'food', name: 'cooking-pot' }}
          tone="water"
          selected={panel === 'recipes'}
          onPress={() => toggle('recipes')}
        />
      </View>

      {panel === 'camera' ? (
        <View className="gap-3">
          {/* Two views of one camera, so the tabs sit ON the panel rather than
              in the row of actions above it. Meal first because it is what the
              log button is for; a packet is the exception you reach for. */}
          <Tabs
            align="center"
            options={captureTabs}
            value={captureMode}
            onChange={setCaptureMode}
            accessibilityLabel={t('logging:capture.tabs')}
          />

          {/* The shutter does not wait for recognition. It writes the row and
              closes: the waiting happens on the row itself, where the user can
              watch it or ignore it. See `useSnapFood`.

              Scanning does NOT close the sheet and write a row. A scanned
              packet is a catalogue row with portions on it — "1 sachet", "half
              the packet" — and how much was eaten is the question the detail
              screen exists to ask. Snapping a plate has already answered that
              by photographing one plate. It also leaves on the CODE, before
              anything is looked up: the packet travels as an id of its own
              (`packetFoodId`) and the detail screen resolves it, which is what
              took the waiting off the viewfinder. */}
          <InlineCamera
            mode={captureMode}
            onCapture={(photoUri) => {
              // NO GATE HERE ANY MORE, and that is the whole freemium change.
              // The shutter used to be the paywall's front door; a free account
              // now photographs three plates a day, which is what makes the
              // free tier a diary somebody can actually keep rather than a
              // demonstration of one.
              //
              // The ceiling is claimed on the SERVER, one unit per scan, and
              // the fourth plate comes back refused — `announceRefusal` in
              // `data/refusals.ts` says so and opens the paywall. Checked here
              // as well it would be a second copy of the count, wrong whenever
              // the phone had been offline or another device had scanned.
              snapFood({ photoUri, logDate: selectedDate })
              goBack()
            }}
            onScanned={(code) => openFood(packetFoodId(code))}
          />

          {/* WHAT IS LEFT, and only on a free account with a meal in the
              viewfinder. A ceiling nobody can see is a ceiling that arrives as a
              surprise, and it arrives on the one screen where a surprise costs a
              photograph somebody has already framed and taken.

              Not shown to a subscriber, whose ceiling is fifty and is not a
              number they are meant to be counting against — printing it would
              turn the thing they paid for into a quota. Not shown over the
              barcode tab either: a packet spends nothing. And nothing at all
              until the count has landed, since a line that says "3 left" and
              then corrects itself is worse than a beat of silence. */}
          {quota.data && !quota.data.entitled && captureMode === 'meal' ? (
            <Text variant="caption" className="text-center">
              {t('logging:capture.scansLeft', { count: quota.data.remaining })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {panel === 'describe' ? (
        // Same contract as the shutter: the row is written now and the sheet
        // closes, because the cascade takes several seconds and the day is a
        // better place to wait than a sheet.
        <DescribePanel
          autoFocus
          onSubmit={(text) => {
            // The same guard again, and not redundant: the panel can be opened
            // by a ROUTE PARAM (`/log?panel=describe`) without going through the
            // action above it. Cheap, and the alternative is a hole in the gate
            // that only a deep link finds. The server refuses it a third time,
            // for anybody not running this build at all.
            if (!requirePro('describe')) return
            describeFood({ text, logDate: selectedDate })
            goBack()
          }}
        />
      ) : null}
      {panel === 'search' ? <FoodSearchPanel autoFocus onPick={openFood} /> : null}
      {panel === 'recipes' ? (
        // `replace` for the same reason `openFood` does it: a push from inside a
        // transparent modal lands on the stack WITHIN that presentation, so the
        // recipe would come up as a second modal stacked on this sheet.
        <RecipePanel
          autoFocus
          onLog={(recipe) => add(snapshotFromRecipe(recipe), 'recipe')}
          onOpen={(recipe) =>
            router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } })
          }
        />
      ) : null}
    </SheetSurface>
  )
}
