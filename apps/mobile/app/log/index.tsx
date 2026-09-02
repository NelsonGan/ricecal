import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type LogSnapshot,
  packetFoodId,
  snapshotFromEntry,
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
import { announceRefusal, scanLimitAhead } from '@/data/refusals'
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
import { SheetSurface, Tabs, Text, useToast } from '@/ui'

/**
 * Which of the four quick actions has its panel open below the row, if any. A
 * union rather than a flag each, because they share the space: opening the camera
 * has to put search away.
 *
 * Scanning a packet is a tab inside the camera rather than a fifth tile. It is
 * the same gesture, and a fifth tile made the row longer to answer a question the
 * user had already answered by reaching for the camera.
 */
type Panel = 'camera' | 'describe' | 'search' | 'recipes' | null

const PANELS = ['camera', 'describe', 'search', 'recipes'] as const

/** A route param is whatever was in the URL, so it is checked before it is used. */
const isPanel = (value: string | undefined): value is NonNullable<Panel> =>
  PANELS.includes(value as (typeof PANELS)[number])

/**
 * `?panel=barcode` and `?panel=label` both mean the camera, which is why this
 * mapping exists rather than a rename.
 *
 * `barcode` is "Scan again" off a lookup that could not be made, and it has to
 * land on the day with the scanner live; that link predates the tabs, so it
 * resolves to the camera opened on the barcode side. `label` is the other half
 * of the same handoff: a packet nobody has a record of sends the user here to
 * photograph the nutrition panel, which is the MEAL side of the same camera.
 */
const openingPanel = (value: string | undefined): NonNullable<Panel> =>
  value === 'barcode' || value === 'label' ? 'camera' : isPanel(value) ? value : 'camera'

const openingMode = (value: string | undefined): CaptureMode =>
  value === 'barcode' ? 'barcode' : 'meal'

/**
 * The quick selector.
 *
 * A transparent modal, so Today stays visible behind the scrim and the sheet
 * reads as attached to the day rather than replacing it.
 *
 * `SheetSurface` rather than `Sheet`: the route is the sheet, so it already has
 * everything `Sheet`'s own `Modal` provides. Nesting one meant the route
 * transition had to finish before a second window began presenting, which is why
 * tapping the log button felt slow.
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
   * Which panel to open with, for the routes that arrive knowing. The scan flow
   * needs it: "Scan again" has to mean the day with the viewfinder already open,
   * not the sheet as if the log button had been pressed.
   */
  const { panel: opening } = useLocalSearchParams<{ panel?: string }>()

  /**
   * The viewfinder, the search field and the recipe list live inside this sheet
   * rather than in screens of their own, so the day stays visible and nothing has
   * to be dismissed twice.
   *
   * Snap is the default, so the log button opens on a camera pointed at the food:
   * the other three are how you log a meal you are not looking at. Tapping Snap
   * again closes it.
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
   * The top of the logging funnel: the sheet is up and nothing has been written.
   *
   * Once per presentation, on mount, with the panel it opened on rather than on
   * every switch. Which panel a user ends up logging from is already on `Meal
   * Logged`, and tracking each toggle would add an event per undecided tap.
   *
   * The ref makes "once" true through a re-render: the route is remounted per
   * presentation, but Fast Refresh re-runs the effect.
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
   * `goal + active - eaten`, the same sum the ring on Today draws. It was `goal -
   * eaten`, and this sheet opens over that ring, so a day with a walk on it had
   * the ring reading "382 kcal left" behind a header saying "0 kcal left".
   * Movement extends the budget everywhere or nowhere.
   *
   * `activeKcal` rather than the total burn, and skipped when the user has turned
   * the extension off, for the reasons written beside the ring.
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
  const toast = useToast()

  /**
   * A dish was picked out of the inline search.
   *
   * `replace` rather than `push`: this route is a `transparentModal`, and a push
   * from inside one lands on the stack within that presentation, so the dish
   * would come up as a second modal stacked on the sheet. Replacing puts it on
   * the stack above Today, where a page belongs.
   *
   * The cost is that back from the dish lands on the day rather than the results,
   * which is the right trade for pick a dish, set the portion, done.
   */
  const openFood = (foodId: string) =>
    router.replace({ pathname: '/log/food/[id]', params: { id: foodId } })

  // Takes the snapshot rather than a food, because the three things this sheet
  // can add outright — a recipe, a catalogue dish, a meal out of this account's
  // own history — build one the same way and nothing downstream needs to know
  // which it was.
  const add = (snapshot: LogSnapshot, method: LogMethod, quantity?: number) => {
    // Not gated. A catalogue dish, a scanned packet and a saved recipe reach no
    // model and cost nothing to serve, and a free tier that could not write those
    // is a catalogue with a read-only diary attached. The scan is what is metered.
    //
    // `method` and `source` answer different questions: the column says how the
    // numbers were obtained, and `method` says which door the user came through.
    // See `LogInput` in `data/entries.ts`.
    logFood.mutate({ snapshot, quantity, logDate: selectedDate, source: 'quickAdd', method })
    goBack()
  }

  return (
    /**
     * Capped with nothing open, full height with anything open, for two separate
     * reasons.
     *
     * Search, describe and recipes raise the keyboard, and a capped sheet is
     * padded up off the bottom edge, leaving a strip that shows the scrim through
     * the keyboard's top corners. Full height keeps the panel where it is and
     * lets the body inset itself.
     *
     * Describe is also not scrollable: there is nothing to scroll, and a scroll
     * view scrolls itself to reveal the first responder when the keyboard opens,
     * overshooting on the first open before the keyboard's height is known.
     *
     * The camera raises no keyboard and is full height because it holds two tabs,
     * and a sheet that changed height between them would read as two features
     * rather than one camera doing two jobs.
     */
    <SheetSurface
      closeLabel={t('common:action.close')}
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

          {/* WHY THIS CAMERA IS OPEN, when it was not the user who opened it.
              A scanned packet nobody has a record of arrives here rather than
              stopping on a dead end, and without a line saying so the app has
              silently swapped a barcode scanner for a plate camera.

              Over the meal tab only: an instruction about the nutrition panel
              above a barcode reader is an instruction about the wrong side of
              the box. */}
          {opening === 'label' && captureMode === 'meal' ? (
            <Text variant="caption" className="text-center">
              {t('logging:barcode.labelPrompt')}
            </Text>
          ) : null}

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
              // The ceiling arriving before the request. The count is still the
              // server's and it still refuses, but the panel is already drawing
              // "0 scans left" from that figure, so sending the photograph spends
              // an upload and several seconds to be told what the screen has
              // printed on it, and leaves a failed row saying so.
              //
              // `replace` because this route is a `transparentModal`: a push from
              // inside one lands on the stack within that presentation.
              const ahead = scanLimitAhead(quota.data)
              if (ahead && announceRefusal(toast, ahead, 'camera', { navigate: 'replace' })) return
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
      {panel === 'search' ? (
        <FoodSearchPanel
          autoFocus
          onPick={(food) => openFood(food.id)}
          /* A meal out of this account's own diary is WRITTEN HERE, the way a
             recipe is, rather than opening the portion screen a catalogue dish
             opens. An entry already states its own numbers AND the size it was
             eaten at — which is what `snapshotFromEntry` copies verbatim rather
             than deriving, so "the same again" lands on the same calories to
             the digit. The quantity travels with it for the same reason: two
             plates yesterday is two plates today. */
          onPickHistory={(entry) => add(snapshotFromEntry(entry), 'history', entry.quantity)}
        />
      ) : null}
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
