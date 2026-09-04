import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  ENTRY_FOOD_ID,
  type EntryPatch,
  foodFromEntry,
  type IconRef,
  keys,
  packetCode,
  type RefineDeclined,
  removeMealPhoto,
  snapshotFromFood,
  storedImageSource,
  uploadMealPhoto,
  useDayLog,
  useEntryIngredients,
  useFood,
  useLogFood,
  useMealPhotoUrl,
  useRefineEntry,
  useRemoveEntry,
  useSelectedDate,
  useTargets,
  useUpdateEntry,
  withCataloguePortions,
} from '@/data'
import {
  type Clock,
  clockOf,
  DetailsSheet,
  dayLabel,
  type EntryDetails,
  FixSheet,
  IconPicker,
  instantOn,
  MealShareCard,
  NO_FIGURES,
  NutritionSheet,
  PartLine,
  ScannedPacket,
  sameClock,
  type TypedFigures,
  useMealShare,
} from '@/features/logging'
import { useRequirePro } from '@/features/paywall'
import { formatTime, MacroBars, MealPhoto } from '@/features/shared'
import { track } from '@/lib/analytics'
import { useBack, useDismissTo } from '@/lib/navigation'
import { entryTotals } from '@/lib/nutrition'
import { servingUnit } from '@/lib/portions'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  cn,
  Divider,
  Icon,
  IconButton,
  Screen,
  Skeleton,
  Stepper,
  Tappable,
  Text,
  useToast,
} from '@/ui'

/**
 * Chips under the fix box for an entry the model offered none of its own for:
 * anything hand-logged, and a scan that came back without suggestions.
 *
 * The four most common corrections in any diary, and each is a sentence
 * `scan-refine` reads. "Half portion" is its quantity rung, "No sambal" its
 * adjust rung. Nothing here is special-cased on the client.
 */
const QUICK_FIXES = ['halfPortion', 'noSambal', 'addEgg', 'extraRice'] as const

/** The four figures a user can type over, in the order the card reads them. */
const FIGURES = ['kcal', 'carbs', 'protein', 'fat'] as const

/**
 * How far the content rides up over the photograph. Read twice, and it has to
 * be: the wrapper lifts by it and the picture grows by it, so the overlap covers
 * a strip of the frame rather than cropping the meal out of it.
 */
const CONTENT_LIFT = 22

/**
 * How long the portion stepper waits after the last tap before it writes. Long
 * enough that "tap tap tap" is one write, short enough that letting go does not
 * feel like waiting. See `savePortion` for why this alone is debounced.
 */
const PORTION_DEBOUNCE_MS = 500

/**
 * What the user is told when a correction changed nothing. A table rather than a
 * chain of ternaries, because the five are a closed set the server names and
 * each has to leave somebody with a different next move.
 */
const FIX_DECLINED = {
  not_a_correction: 'logging:detail.fixNoCalories',
  not_understood: 'logging:detail.fixNotUnderstood',
  no_match: 'logging:detail.fixNoMatch',
  no_change: 'logging:detail.fixNoChange',
  failed: 'logging:detail.fixFailed',
  unknown: 'logging:detail.fixNotApplied',
} as const satisfies Record<RefineDeclined, string>

/**
 * The edit control in a card's own header, which is how every editable group on
 * this screen is opened.
 *
 * The pencil alone, with no "Edit" beside it: three of these sit one under
 * another, so the word was printed three times to say what the icon says. The
 * words went into `accessibilityLabel`, and they are specific ("Edit the
 * ingredients") because three buttons announcing "Edit" tell a reader nothing.
 */
function CardEdit({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tappable
      /* Padded for a thumb and pulled back out again with a negative margin, so
         the touch area is bigger than the glyph without the card's header row
         growing taller than the title beside it. */
      className="-m-2.5 p-2.5"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {/* NOT TINTED, unlike the chrome either side of it. Tinting is right for a
          chevron or a bin, whose SILHOUETTE is the icon — flatten one of those to
          a single colour and it still reads. This one is a yellow pencil with a
          red eraser and every bit of its meaning is in the colour: tinted pandan
          at 20pt it came out as a plain green lozenge, which is the worst thing
          an unlabelled control can be. */}
      <Icon set="ui" name="edit" size={20} />
    </Tappable>
  )
}

/**
 * The food detail screen, in both of its jobs.
 *
 * With an `entryId` it edits something already logged; without one it composes a
 * new entry from the catalogue. The controls are identical either way, so the
 * difference is confined to what the button at the foot does.
 *
 * On the edit path each section saves itself through the sheet that opens it.
 * The add path is still a staged form, because there is nothing to write until
 * Add.
 */
export default function FoodDetail() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  /**
   * Adding a dish ends the whole flow, so it unwinds to the day rather than
   * stepping back one screen. Still `useDismissTo` even though this is a page:
   * the quick selector it came through is a transparent modal, and popping one
   * screen would land on the search page the user is finished with.
   */
  const finish = useDismissTo('/today')
  const router = useRouter()
  const queryClient = useQueryClient()
  const colors = useThemeColors()
  // For the strip that keeps the photograph out from under the status bar as the
  // page scrolls. See `overlay` below.
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const logFood = useLogFood()
  const requirePro = useRequirePro()
  const updateEntry = useUpdateEntry()
  const removeEntry = useRemoveEntry()
  const { data: targets } = useTargets()
  const { selectedDate, todayKey } = useSelectedDate()
  // The card this sends is drawn off to the side of the page — see `MealShareCard`
  // at the foot of the content, and the button on the photograph.
  const shareMeal = useMealShare()

  const params = useLocalSearchParams<{ id: string; entryId?: string }>()
  // `ENTRY_FOOD_ID` is the placeholder a row with no catalogue food behind it
  // travels under, so there is nothing to ask the catalogue for.
  const catalogueId = params.id === ENTRY_FOOD_ID ? undefined : params.id
  const { data: catalogueFood, isPending, isError } = useFood(catalogueId)
  /**
   * The code, when this screen was arrived at by scanning a packet. The scanner
   * navigates here the moment it reads one, before any lookup, so unlike every
   * other way in this screen can be showing a food that does not exist yet, or
   * one that turns out not to exist at all.
   */
  const packet = packetCode(params.id)

  /**
   * How the scan turned out, recorded once per packet. Here rather than in
   * `lookupPacket`, which the query retries: this reads the settled state, so a
   * retry that succeeds is one `found` and nothing else.
   *
   * `not_found` is the number this event exists for: the live measurement of how
   * thin the Malaysian shelf is, at 4,333 GS1 Malaysia rows out of 3.2 million.
   */
  const scanRecorded = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!packet || isPending || scanRecorded.current === packet) return
    scanRecorded.current = packet
    track('Barcode Scanned', {
      outcome: isError ? 'error' : catalogueFood ? 'found' : 'not_found',
    })
  }, [packet, isPending, isError, catalogueFood])

  // The entry being edited, if this screen was opened from a row. It is on the
  // day in view — the only day whose entries are loaded — which is also the
  // only day a row can be tapped from.
  const day = useDayLog(selectedDate)
  const existing = params.entryId
    ? day.entries.find((entry) => entry.id === params.entryId)
    : undefined

  /**
   * The plate's parts, asked for on every entry rather than only a scanned one.
   * Gating on `scanId` stopped being right the moment a user could put an
   * ingredient on a plate by hand.
   *
   * `isLoading` rather than `isPending`: a disabled query is pending forever,
   * and this one is disabled while the day is still loading.
   */
  const { data: ingredients = [], isLoading: partsLoading } = useEntryIngredients(existing?.id)

  /**
   * The food this screen is about, and which one depends on why we are here.
   *
   * Adding: the catalogue row, since there is no entry yet and its numbers are
   * what the new row will snapshot.
   *
   * Editing: the entry, always. It states its own numbers, and a `food_id` where
   * it is set is provenance rather than a live reference; the catalogue row is
   * still fetched, but only for the other portions it can offer.
   *
   * Letting the catalogue win here showed a 108 kcal soy milk as 511.
   */
  const food = existing
    ? withCataloguePortions(foodFromEntry(existing), catalogueFood)
    : (catalogueFood ?? null)
  const refineEntry = useRefineEntry()

  const [quantity, setQuantity] = useState(existing?.quantity ?? 1)
  const [servingId, setServingId] = useState(existing?.servingId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** The fix-by-typing sheet, and the words in it. */
  const [fixing, setFixing] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState(false)
  /**
   * Which entry the controls above were filled in from.
   *
   * They are seeded in `useState`, which runs once, and on a cold start from a
   * deep link the day query has not answered for the first render or two, so the
   * screen used to keep those defaults for the rest of its life. Seeding again
   * when the row arrives is the fix, and the id stops it happening twice.
   *
   * State rather than a ref, because the change detection below reads it during
   * render, and comparing untouched defaults against an unseeded row makes every
   * field look edited.
   */
  const [seededId, setSeededId] = useState<string>()
  /**
   * The illustration, only once the user has picked one. `undefined` is
   * untouched and sends no icon; seeding it from `existing.icon` would write the
   * food's own drawing onto the entry as an override on the next save.
   */
  const [icon, setIcon] = useState<IconRef>()
  const [pickingIcon, setPickingIcon] = useState(false)
  /**
   * A drawing chosen while a photo is on the row, waiting on the confirmation.
   */
  const [pendingIcon, setPendingIcon] = useState<IconRef>()
  /**
   * A photo taken here, uploaded but not yet on any row. Two fields for two
   * moments: the local uri is what the tile shows the instant the shot is taken,
   * and the bucket key is what Save carries.
   */
  const [shot, setShot] = useState<{ uri: string; path: string }>()
  /**
   * The same key as a ref, for as long as no row points at it.
   *
   * The upload cannot wait for the button, so between the shutter and Save the
   * object is real and referenced by nothing. Every way off this screen that is
   * not Save has to take it: backing out, the swipe, a drawing chosen over it, a
   * deep link. An unmount effect is the only place that catches all of them, and
   * it cannot read state, hence the ref.
   */
  const orphanShot = useRef<string | undefined>(undefined)
  /**
   * A portion edit waiting for the taps to stop, and the timer that will send it.
   *
   * Refs rather than state, since the stepper already shows the new portion.
   * `flushRef` is how the unmount cleanup reaches the current flush: a cleanup
   * closing over the function directly would capture the first render's, whose
   * `existing` was undefined.
   *
   * Up here with the other hooks rather than beside their functions, which live
   * below the `if (!food)` return.
   *
   * The last field is set when the details sheet moves this entry to another day,
   * so the screen knows to leave. Read once, in the sheet's `onClose`.
   */
  const movedAway = useRef(false)
  const pendingPortion = useRef<{ quantity: number; servingId: string }>(undefined)
  const portionTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flushRef = useRef<() => void>(() => {})
  const [attaching, setAttaching] = useState(false)
  // Collapsed by default. Fibre, sugar and salt are the second question about a
  // dish, and for most of the catalogue the answer is "nobody recorded it".
  const [showNutrients, setShowNutrients] = useState(false)
  /**
   * Figures typed by hand, as strings while they are being typed. An empty field
   * is "nothing overridden here" rather than zero: the app's own answer shows
   * through as the placeholder, so it is clear whose number it is. Typed in
   * `NutritionSheet`, all four at once, and staged here.
   */
  const [typed, setTyped] = useState<TypedFigures>(NO_FIGURES)
  /** Which of the two sheets is open, if any. */
  const [editingFigures, setEditingFigures] = useState(false)
  /**
   * The entry's own details — the name and the when — behind the pencil on the
   * line under the title. One flag, because they are one sheet: an entry's
   * identity was edited in two unrelated places before this.
   */
  const [editingDetails, setEditingDetails] = useState(false)

  /** What this entry is called, staged. Written to `display_label`. */
  const [name, setName] = useState('')
  /**
   * When this was eaten, staged as the two things the user is shown: the day it
   * counts towards, off `log_date`, and the time on the row, off `logged_at`.
   * `null` means the row has not arrived yet.
   */
  const [whenDate, setWhenDate] = useState('')
  const [clock, setClock] = useState<Clock | null>(null)

  // `isLoading` rather than `isPending`, for the reason the ingredients query
  // above gives: an entry with no photo disables this one, and a disabled query
  // is pending forever.
  const { data: heroUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(existing?.photoPath)

  /**
   * A typed figure as a number, and `null` for a field holding nothing, which is
   * what clears the override and hands the figure back to the catalogue. An
   * empty field and an unreadable one mean the same thing.
   */
  const figure = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  /**
   * The plate as the screen shows it, which is what the server has. It used to
   * be an overlay of staged edits, because the plate editor lived on this screen
   * and its draft had to be previewed. The editor is a page of its own now and
   * writes before it comes back.
   */
  const parts = ingredients

  /**
   * Whether the controls have been filled in from the row yet. They are seeded
   * in an effect, and on a cold deep link the day query has not answered for the
   * first render or two, so anything reading the staged values has to wait or it
   * reads the defaults.
   */
  const seeded = Boolean(existing) && seededId === existing?.id

  // The controls, filled in from the row the first time it is actually here.
  // See `seededFrom` for why once is not the same as at mount.
  useEffect(() => {
    if (!existing || seededId === existing.id) return
    setSeededId(existing.id)
    setQuantity(existing.quantity)
    // Empty rather than undefined: this drives a controlled selection and
    // `chosen` falls back to the base serving. An entry whose portion was never
    // a catalogue row has no `servingId`, which is not a reason to leave the
    // picker holding the previous entry's choice.
    setServingId(existing.servingId ?? '')
    setName(existing.foodName)
    setWhenDate(existing.logDate)
    setClock(clockOf(existing.loggedAt))
    setTyped({
      kcal: existing.overrides?.kcal?.toString() ?? '',
      carbs: existing.overrides?.carbs?.toString() ?? '',
      protein: existing.overrides?.protein?.toString() ?? '',
      fat: existing.overrides?.fat?.toString() ?? '',
    })
  }, [existing, seededId])

  // The uploaded-but-unreferenced photo, on every exit at once. See `orphanShot`.
  useEffect(
    () => () => {
      if (orphanShot.current) void removeMealPhoto(orphanShot.current).catch(() => {})
    },
    [],
  )

  // And a portion edit whose debounce had not fired yet, on the same exits. See
  // `flushRef` for why the cleanup goes through a ref rather than closing over the
  // function.
  useEffect(() => () => flushRef.current(), [])

  // No discard prompt, and no `gestureEnabled: false` behind it. This screen
  // used to hold every edit until one Save button wrote the lot, so every way
  // back was a way to throw work away. Each section saves itself now, so leaving
  // loses nothing.

  /**
   * Back to the day with the log sheet open on the panel that answers this.
   * "Scan again" cannot mean "back to where you were", since that was a
   * viewfinder inside a sheet this screen replaced.
   *
   * The packet's own answer is dropped on the way out: a miss caches like
   * anything else, so a rescan would otherwise show the cached "we do not have
   * this one" without asking anybody.
   */
  const reopenLog = (which: 'barcode' | 'label') => {
    queryClient.removeQueries({ queryKey: keys.food(params.id) })
    finish()
    router.push({ pathname: '/log', params: { panel: which } })
  }
  const rescan = () => reopenLog('barcode')
  /** The camera, pointed at the panel on the back of the packet. */
  const photographLabel = () => reopenLog('label')

  /**
   * A packet nobody has a record of hands straight over to that camera.
   *
   * This used to stop on a screen whose primary button was "Describe instead",
   * which asks somebody holding the packet to type out what is printed on the
   * back of it. `scan-meal` reads a photographed nutrition panel and logs it
   * exactly — `resolveByLabel`, no guessing and no cascade — so the answer to a
   * miss is to turn the camera around, not to open a text box.
   *
   * Once per packet, and only for a MISS: a lookup that could not be made is a
   * job for the network, and scanning the same box again is likely to just work.
   *
   * No dependency array, because the ref is the guard and not the list: every
   * value below is derived per render, so a list would either re-run this on
   * every one of them or go stale. The ref makes "once" true either way.
   */
  const handedOff = useRef(false)
  useEffect(() => {
    if (!packet || isPending || isError || catalogueFood || handedOff.current) return
    handedOff.current = true
    photographLabel()
  })

  if (!food) {
    /**
     * A scanned packet, before the answer and when the answer is nothing.
     * Everything else reaching this screen was picked off a list, so the food is
     * already in hand and this branch is a blank frame nobody sees.
     *
     * A MISS never lands here: `missing` is handed to the camera above, and the
     * skeleton stands in for the frame between deciding that and arriving. What
     * is left is the wait itself and a lookup that could not be made, which is
     * the one outcome worth scanning the same box again for.
     */
    if (packet) {
      return (
        <ScannedPacket
          state={isError ? 'failed' : 'looking'}
          onRetry={rescan}
          onPhotographLabel={photographLabel}
          onBack={() => goBack()}
        />
      )
    }

    return (
      <Screen>
        <AppBar
          title={isPending ? '' : t('logging:search.emptyTitle')}
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
        />
      </Screen>
    )
  }

  // A shot taken on this screen wins over the stored one: it is the newer answer,
  // and on the add screen it is the only one there is.
  const hero = storedImageSource(existing?.photoPath, heroUrl, shot?.uri)

  /**
   * How tall the picture at the top of the page is: a base that is taller for a
   * photograph than a drawing, plus `CONTENT_LIFT` so the box grows by exactly
   * what the curve covers, plus the top inset so it reaches behind the status
   * bar.
   *
   * `resolvingPhoto` counts as having a photo, since it means the entry has one
   * and we are waiting on a URL. Left out, the box opened short and grew under
   * the reader a moment later.
   */
  const heroHeight = ((hero || resolvingPhoto) && !icon ? 298 : 198) + CONTENT_LIFT + insets.top

  /**
   * The drawing this tile would show, if any. Not what it shows: a photograph
   * wins over it in the box below, and this is what is left when there is none
   * or when the object has gone. A snapped plate has one too — the food's own
   * drawing, which the entry carries beside its photograph. Only an unsaved
   * choice overrides all of it, which is exactly the swap.
   */
  const shownIcon = icon ?? existing?.icon ?? food.icon

  // Defaults to the dish's base portion, which is the one its macros describe.
  const chosen = servingId || food.servings[0]?.id || ''
  const serving = food.servings.find((option) => option.id === chosen) ?? food.servings[0]
  const factor = (serving?.factor ?? 1) * quantity
  // What this much of the catalogue row costs. The same arithmetic the view
  // does for a saved entry, so the preview while composing and the row that
  // results from it agree.
  const computed = {
    kcal: Math.round(food.macros.kcal * factor),
    carbs: Math.round(food.macros.carbs * factor),
    protein: Math.round(food.macros.protein * factor),
    fat: Math.round(food.macros.fat * factor),
  }

  /**
   * What this entry would count as if it were saved now. `entryTotals` is the
   * client's copy of the `coalesce` in `food_log_details`: typed, then parts,
   * then portion. Read from the staged values rather than the row.
   *
   * While a scanned plate's parts are on their way, the row's own figure stands
   * in. It is the same three-source answer, so the number is right from the
   * first frame rather than jumping when the query lands.
   */
  const macros = existing
    ? partsLoading
      ? existing.macros
      : entryTotals({
          typed: {
            kcal: figure(typed.kcal) ?? undefined,
            carbs: figure(typed.carbs) ?? undefined,
            protein: figure(typed.protein) ?? undefined,
            fat: figure(typed.fat) ?? undefined,
          },
          parts,
          portion: computed,
        })
    : computed

  /**
   * What the app works out for this entry with nothing typed over it: the
   * placeholders in `NutritionSheet`. It cannot be `macros`, which has the typed
   * figures folded in, so an entry carrying a hand-typed 400 would offer 400 as
   * the number to go back to.
   */
  const appFigures = existing ? entryTotals({ parts, portion: computed }) : computed

  /**
   * The same scaling for the nutrients that are not part of the budget.
   * `undefined` survives it, because these columns are null for most of the
   * imported catalogue and null means nobody recorded the number. One decimal,
   * which is what the database stores.
   */
  const scale = (value: number | undefined, dp = 1) =>
    value === undefined ? undefined : Math.round(value * factor * 10 ** dp) / 10 ** dp

  const grams = (value: number | undefined) =>
    value === undefined ? undefined : t('common:unit.grams', { value })

  const sodium = scale(food.extras.sodium, 0)
  const extras = [
    { key: 'fibre', label: t('logging:detail.fibre'), value: grams(scale(food.extras.fibre)) },
    { key: 'sugar', label: t('logging:detail.sugar'), value: grams(scale(food.extras.sugar)) },
    {
      key: 'sodium',
      label: t('logging:detail.sodium'),
      value: sodium === undefined ? undefined : t('logging:detail.milligrams', { value: sodium }),
    },
  ] as const

  /**
   * Whether there is a "More nutrients" section at all. Read by the control and
   * by the rule above it, because a divider with nothing beyond it is a line
   * across the bottom of the card, and most of the catalogue has none of these
   * columns.
   */
  const hasExtras = extras.some((row) => row.value !== undefined)

  /**
   * Put a photo of the actual plate on this row.
   *
   * The uri comes from the picker's own viewfinder, so by the time this runs the
   * shot is taken and there is nothing left to present. That is what fixed the
   * camera that used to open and shut immediately: a native picker asked to
   * present while this sheet was dismissing, which iOS cancels.
   *
   * The upload happens here whatever else does, since turning a 4MB frame into a
   * key is the slow part. A shot this one replaces never reached a row, so it is
   * deleted on the spot.
   *
   * Written to the entry immediately when there is one, because the picker has
   * no Save of its own. On the add path it stages as it always did.
   */
  const attachPhoto = async (uri: string) => {
    setPickingIcon(false)
    setAttaching(true)
    try {
      const path = await uploadMealPhoto(uri)
      // A shot this one replaces never reached a row either.
      if (orphanShot.current) void removeMealPhoto(orphanShot.current).catch(() => {})
      orphanShot.current = path
      setShot({ uri, path })
      // The photo IS the picture now, so a drawing has been answered.
      setIcon(undefined)
      if (existing) {
        // `currentPhotoPath` is what lets the write delete the object it replaces.
        await patchEntry({ photoPath: path, currentPhotoPath: existing.photoPath })
        // The row points at it, so it is no longer an orphan for the unmount sweep.
        orphanShot.current = undefined
      }
    } catch {
      // An upload that failed, a bucket that refused it, a patch the server
      // would not take: none is worth a screen of its own.
      //
      // The tile goes back, or the screen disagrees with itself and with Today.
      // The object stays in `orphanShot` for the unmount sweep.
      setShot(undefined)
      toast.show({ title: t('logging:detail.photoFailed'), tone: 'error' })
    } finally {
      setAttaching(false)
    }
  }

  /**
   * A drawing wins the slot, so whatever photo was in it has to go. A shot taken
   * on this screen is already uploaded and now points at nothing, so it is
   * deleted here. The row's own photo is the write's business: `useUpdateEntry`
   * deletes it once the icon has landed.
   */
  const applyIcon = (next: IconRef) => {
    setIcon(next)
    if (shot) {
      setShot(undefined)
      if (orphanShot.current) void removeMealPhoto(orphanShot.current).catch(() => {})
      orphanShot.current = undefined
    }
    if (existing) {
      // Reverted on failure, for the reason `attachPhoto` gives: a drawing left on
      // screen over a row that never took it is a screen lying about the diary.
      void patchEntry({ icon: next, currentPhotoPath: existing.photoPath }).catch(() => {
        setIcon(undefined)
        saveFailed()
      })
    }
  }

  const hasPhoto = Boolean(shot ?? existing?.photoPath)

  const addToDiary = () => {
    // Not gated, though it used to be the app's main paywall. A catalogue dish
    // and a barcoded packet are exact answers costing one index probe, so the
    // free tier is a diary you can keep by searching and scanning, with the
    // model behind the wall. Editing was never gated either: a lapsed
    // subscription must not lock somebody out of their own diary.
    logFood.mutate({
      snapshot: snapshotFromFood(food, chosen),
      quantity,
      logDate: selectedDate,
      // Only what was actually chosen. `shownIcon` would write the food's own
      // drawing onto the row as an override, which is not an override at all.
      icon,
      // And a photo taken while composing this row, which the picker offers as
      // the alternative to a drawing. Never both: taking one clears the other.
      photoPath: shot?.path,
      // Two doors lead here and `entry_source` calls both `search`: a packet
      // held up to the camera, and a dish picked out of the list. This branch
      // only runs with no `existing` entry, so there is no third case.
      method: packet ? 'barcode' : 'search',
    })
    // The insert carries it now, so it is not an orphan for the unmount effect
    // to sweep up on the way out.
    orphanShot.current = undefined
    finish()
  }

  /**
   * One save per section, and no Save button on the page. Each throws on
   * failure, so the sheet can stay open with the draft in it, and each stages
   * the value locally as the preview while the refetch catches up.
   *
   * The add path is untouched: composing a row genuinely is a staged form.
   */
  const saveFailed = () => toast.show({ title: t('logging:detail.saveFailed'), tone: 'error' })

  const patchEntry = async (patch: Omit<EntryPatch, 'id' | 'logDate'>) => {
    if (!existing) return
    /**
     * An empty patch is not a write. Every `save*` builds its columns
     * conditionally, so each can come out empty: the details sheet saved with
     * nothing touched, or a portion stepped up and back down inside the debounce.
     * PostgREST answers an empty update with a 400, which would surface as "could
     * not save those changes" for an edit nobody made.
     */
    if (Object.keys(patch).length === 0) return
    await updateEntry.mutateAsync({ id: existing.id, logDate: existing.logDate, ...patch })
  }

  const saveDetails = async (next: EntryDetails) => {
    if (!existing || !clock) return
    const named = next.name.trim() || existing.foodName
    /**
     * The day and the instant together, or neither. Compared as a day and a
     * clock face rather than two ISO strings: `instantOn` writes whole seconds
     * while Postgres hands back microseconds, so an untouched `logged_at` would
     * read as an edit and every save would shift the row inside its own day.
     */
    const moved =
      next.date !== existing.logDate || !sameClock(next.clock, clockOf(existing.loggedAt))
    await patchEntry({
      ...(named === existing.foodName ? {} : { name: named }),
      ...(moved
        ? { when: { logDate: next.date, loggedAt: instantOn(next.date, next.clock) } }
        : {}),
    })
    setName(named)
    setWhenDate(next.date)
    setClock(next.clock)
    /**
     * And off the screen, when the entry has left the day this screen reads.
     *
     * `existing` is found in the day query for `selectedDate`, so a row filed on
     * another day is gone from under the screen: `food` falls back to the
     * catalogue row and the page becomes the compose-a-new-entry version of
     * itself, or nothing at all for a scanned plate.
     *
     * The toast says where the meal went, without which a meal moved to yesterday
     * is indistinguishable from a meal deleted. The selected day is left alone:
     * the strip on Today is where the user says which day they are working on.
     */
    if (moved && next.date !== selectedDate) {
      toast.show({
        title: t('logging:detail.movedTo', {
          day: dayLabel(next.date, todayKey, {
            today: t('common:date.today'),
            yesterday: t('common:date.yesterday'),
          }),
        }),
      })
      // Not `goBack()`: this runs inside the sheet's own save, which closes
      // itself only after awaiting it, so popping here unwinds the navigator
      // while a native modal is still mounted over it. The flag is read by the
      // sheet's `onClose`, once the modal has gone.
      movedAway.current = true
    }
  }

  /**
   * The four figures, and the job here is deciding which of them are the user's.
   *
   * The sheet's boxes are pre-filled with the current figure, so a field holding
   * the app's own answer looks exactly like one somebody typed. Taken as it
   * arrives, opening the sheet and pressing Save would write all four as
   * overrides, which sit above the portion in `food_log_details`, so the next
   * portion change would move the serving and not the calories.
   *
   * So each figure is compared against what the app worked out, and an
   * unreadable or empty box means the same as an unchanged one.
   *
   * All four every time rather than only the changed ones: a field cleared has
   * to be written null, and omitting it would leave the old override in place.
   */
  const saveFigures = async (next: TypedFigures) => {
    const own = (field: (typeof FIGURES)[number]) => {
      const parsed = figure(next[field])
      return parsed === null || parsed === appFigures[field] ? null : parsed
    }
    const overrides = {
      kcal: own('kcal'),
      carbs: own('carbs'),
      protein: own('protein'),
      fat: own('fat'),
    }
    await patchEntry({ overrides })
    // Staged as what was WRITTEN, not as what the boxes held: the card's "your own
    // figures" line reads this, and a figure equal to the app's own must not make
    // it claim otherwise.
    setTyped({
      kcal: overrides.kcal === null ? '' : String(overrides.kcal),
      carbs: overrides.carbs === null ? '' : String(overrides.carbs),
      protein: overrides.protein === null ? '' : String(overrides.protein),
      fat: overrides.fat === null ? '' : String(overrides.fat),
    })
  }

  /**
   * The portion is the one section that saves itself on a debounce. Everything
   * else here is a sheet with a Save button; a stepper is a pair of buttons
   * tapped three times to get from one plate to two and a half, with nowhere to
   * put a Save. Written per tap it is three round trips for one decision.
   */
  const savePortion = async (next: { quantity: number; servingId: string }) => {
    if (!existing) return
    const option = food.servings.find((one) => one.id === next.servingId)
    await patchEntry({
      ...(next.quantity === existing.quantity ? {} : { quantity: next.quantity }),
      /**
       * The portion's own numbers travel with its id. `serving_id` alone was
       * enough while the catalogue was in Postgres and `food_log_details` joined
       * to it; an entry now carries its own `serving_factor` and `serving_label`,
       * so an id written by itself changes nothing about what the row counts.
       * Switching a nasi lemak to Large previewed 975 kcal and saved a row still
       * labelled "1 serving" and still counting 650.
       */
      ...(next.servingId && next.servingId !== existing.servingId
        ? {
            servingId: next.servingId,
            servingLabel: option?.label ?? existing.servingLabel,
            servingFactor: option?.factor ?? existing.servingFactor,
          }
        : {}),
    })
    // Nothing staged afterwards, unlike the other three: the stepper and the chips
    // already hold the user's answer, which is what scheduled this write.
  }

  /**
   * Send a waiting portion edit now, and hand back the write so a caller can
   * wait for it. `sendFix` needs the promise: `scan-refine` rescales the entry
   * as it finds it on the server, so a correction sent over a pending portion
   * patch is applied to the wrong amount, and the patch then overwrites the row
   * the model rebuilt. Every other caller fires and forgets.
   */
  const flushPortion = () => {
    if (portionTimer.current) clearTimeout(portionTimer.current)
    portionTimer.current = undefined
    const next = pendingPortion.current
    pendingPortion.current = undefined
    if (!next) return Promise.resolve()
    return savePortion(next).catch(saveFailed)
  }
  flushRef.current = () => void flushPortion()

  const schedulePortion = (next: { quantity: number; servingId: string }) => {
    // Only for an entry that exists, and only once the controls have been filled
    // in from it. Composing one is a staged form — there is nothing to write until
    // Add — and a write before the seeding would send the default of one portion.
    if (!existing || !seeded) return
    pendingPortion.current = next
    if (portionTimer.current) clearTimeout(portionTimer.current)
    portionTimer.current = setTimeout(() => flushRef.current(), PORTION_DEBOUNCE_MS)
  }

  /**
   * The chips under the fix box: the vision model's own suggestions when it
   * offered any, and a generic four when it did not. Hoisted out of the JSX
   * because `sendFix` reads it too.
   */
  const fixSuggestions = existing?.suggestedEdits?.length
    ? existing.suggestedEdits
    : QUICK_FIXES.map((fix) => t(`logging:detail.quickFix.${fix}`))

  /**
   * Send the typed correction and leave. Nothing is staged across sections, so
   * the entry on the server is the one the user is reading. Fire and forget: the
   * correction runs for several seconds while this screen would be describing
   * the entry's old identity, so it leaves and the row on Today shows the work.
   */
  const sendFix = async () => {
    const text = instruction.trim()
    if (!existing || !text) return
    // Correcting by describing it is Pro: the entry already has numbers on it,
    // and every figure this would change is editable by hand on this screen for
    // nothing. The server refuses it independently; this makes the button
    // honest.
    if (!requirePro('refine')) return
    setSending(true)
    /**
     * The pending portion goes first. The server interprets the words against
     * the entry as it stands there, so a portion still sitting in the debounce
     * would have the correction applied to the amount before it, and would then
     * land on top of the meal the model rebuilt. This is the one edit that can
     * still be in the air.
     */
    await flushPortion()
    refineEntry({
      entryId: existing.id,
      instruction: text,
      logDate: selectedDate,
      // Derived rather than plumbed through the sheet: a chip sets the field to
      // exactly its own words, so an instruction that is one of the offered
      // sentences came from a chip.
      fromChip: fixSuggestions.includes(text),
      // Said from wherever the user has got to by then: the toast provider sits
      // above the navigator, and this screen is gone a frame after the send.
      //
      // Which kind, rather than one apology for all five. "Could not apply that,
      // try rewording it" was shown for "extra spicy", where rewording will not
      // help, and for a model that answered in the wrong shape, where the words
      // were fine. `unknown` keeps the old sentence for an older function.
      onNotApplied: (reason) => toast.show({ title: t(FIX_DECLINED[reason]), tone: 'warning' }),
    })
    finish()
  }

  /**
   * The dish, as the entry itself names it. The staged name first, then the
   * row's, then the catalogue's, which is the order the heading under the
   * photograph reads in. The catalogue's is last because it is the one that says
   * "MEAL KIT, KOREAN FRIED CHICKEN WITH SWEET GOCHUJANG SAUCE".
   */
  const dishName = name.trim() || existing?.foodName || food.name

  /**
   * The photograph the shared card carries, which is the one on screen or none.
   * `hero` alone is not that condition: choosing a drawing leaves the photo in
   * place until the write lands, and read separately in two places this drifted,
   * so the card drew the drawing while the event said "photo".
   */
  const sharePhoto = hero && !icon ? hero : null

  /**
   * Send this meal as a picture. The card is already drawn off to the side of
   * the page, so this is a capture and a share sheet and nothing else.
   *
   * The picture goes out on its own. The sentence below is the Android fallback,
   * because that platform's share intent cannot carry a file; iOS never sends
   * it, since the card already says the dish and the total.
   */
  const sendMeal = async () => {
    const outcome = await shareMeal.share(
      t('logging:share.text', { food: dishName, kcal: Math.round(macros.kcal).toLocaleString() }),
    )
    if (outcome === 'sent') track('Meal Shared', { picture: sharePhoto ? 'photo' : 'drawing' })
    if (outcome === 'failed') toast.show({ title: t('logging:share.failed'), tone: 'error' })
  }

  const remove = () => {
    if (existing) {
      removeEntry.mutate({
        id: existing.id,
        logDate: existing.logDate,
        photoPath: existing.photoPath,
        source: existing.source,
      })
    }
    setConfirmDelete(false)
    goBack()
  }

  return (
    <Screen
      /* NO GUTTER, so the photograph at the top can reach both edges. Everything
         under it is wrapped in a view that puts the gutter back — see there. The
         top inset is still applied, which is what keeps the picture out from
         under the status bar. */
      flush
      footer={
        existing ? (
          /* ONE BUTTON, and it is not a save. Save used to sit here beside it,
             writing everything the page had staged — and once every section moved
             into a sheet with a save of its own there was nothing left for a
             footer button to write. What remains is the thing that is not a
             section of this entry: handing the whole meal back to the model, which
             can return a different one, which is why it opens a question first
             rather than doing anything. */
          <View>
            <Button
              variant="secondary"
              fullWidth
              leftIcon={<Icon set="system" name="sparkle" size={20} />}
              onPress={() => setFixing(true)}
            >
              {t('logging:detail.fixAction')}
            </Button>
          </View>
        ) : (
          <View>
            <Button fullWidth onPress={addToDiary}>
              {t('common:action.add')}
            </Button>
          </View>
        )
      }
    >
      {/* THE PLATE, FULL WIDTH, WITH THE CHROME FLOATING ON IT.
          It was a padded tile under an `AppBar`, and the bar and the tile were
          two boxes doing one job: the bar held the way out and the way to delete,
          the tile held the picture, and between them they spent about a fifth of
          the screen on things that are not the meal. The photograph is the first
          thing anybody is here to look at, so it goes edge to edge at the top and
          the two controls sit over it — the shape a listing takes in every app
          that leads with a picture.

          Square at the top and rounded at the bottom: it is flush to the screen's
          edges, so a rounded top corner would leave a triangle of canvas at the
          edge, while the bottom is where the content begins and wants the card's
          own radius.

          BELOW the status bar rather than under it. Running the photo up behind
          the clock is the last few points of the effect and it costs the one thing
          that cannot be recovered: the status bar draws in the theme's colour, and
          over an arbitrary photograph of somebody's lunch it is illegible about as
          often as not. `Screen`'s `flush` already leaves the top inset alone,
          which is exactly this decision made once.

          Still the way in to the picture picker, and still live before the entry
          exists: most of the catalogue has no drawing, so a dish added from the
          list arrives blank and picking one then is the natural moment. Straight
          into the picker whether or not there is a photo — replacing one photo
          with another is not something to warn about, and the picker leads with
          the camera; the warning is on the DRAWING, which is the answer that
          discards a picture of the real plate. */}
      {/* BEHIND THE STATUS BAR, not below it.
          `Screen`'s `flush` drops the gutter and keeps the top inset as padding,
          which is right for content and wrong for a picture that is meant to be
          the top of the page: it left a band of canvas above the plate at rest and
          let the plate slide under the clock as soon as the page moved, so the
          photograph was cut around the notch either way. The negative margin
          cancels that padding and the height takes it back, so the picture reaches
          the top of the window and everything below it stays exactly where it was.

          The trade is the status bar, which draws in the theme's colour over
          whatever is up there — legible on most plates, not on all of them. The
          alternative was cropping every photograph to clear a notch. */}
      <View
        className={cn(
          // Square on every edge: this is where the screen starts rather than a
          // card hanging off the top, and the curve at the bottom belongs to the
          // content sliding over it. See the wrapper below.
          'overflow-hidden bg-track',
        )}
        style={{ marginTop: -insets.top, height: heroHeight }}
      >
        <Tappable
          className="flex-1 items-center justify-center"
          onPress={() => setPickingIcon(true)}
          accessibilityRole="button"
          accessibilityLabel={
            hero ? t('logging:detail.replacePhoto') : t('logging:detail.choosePicture')
          }
        >
          {attaching ? (
            // The upload resizes and encodes a 3–6MB frame before it sends it, so
            // this is a second or two on a real photo — long enough that a tile
            // which did not change would read as the camera having done nothing.
            <ActivityIndicator />
          ) : hero && !icon ? (
            <MealPhoto
              source={hero}
              accessibilityLabel={t('logging:camera.photoOf', { food: food.name })}
            />
          ) : resolvingPhoto && !icon ? (
            /* This entry HAS a photograph and it is still being signed for.
               Without this the box drew the dish's illustration first and then
               replaced it with the photograph — the largest thing on the screen
               changing into something else while being looked at. */
            <Skeleton width="100%" height={heroHeight} rounded={false} className="bg-line" />
          ) : shownIcon ? (
            <Icon {...shownIcon} size={100} />
          ) : (
            // Empty, with only a line of copy to say what the box is for. A
            // camera illustration read, at a glance, as this dish's picture.
            <Text variant="meta">{t('logging:detail.addPicture')}</Text>
          )}
        </Tappable>

        {/* Over the picture, and AFTER it in the tree so they are on top of it and
            take the touch before the tile behind them does. A gutter in from each
            corner, so they sit where a thumb reaches on either side.

            The white surface is what keeps them readable: `IconButton`'s neutral
            variant is a raised white square, which reads as a control against a
            photograph of anything. A scrim under them would darken the plate to
            make the app's own chrome legible, which is the wrong way round. */}
        {/* Padded down past the status bar, which the box no longer does for them:
            a back chevron under the notch is a control nobody can reach. */}
        <View
          className="absolute inset-x-0 top-0 flex-row justify-between px-3"
          style={{ paddingTop: insets.top + spacing.sm, paddingBottom: spacing.sm }}
        >
          <IconButton size="sm" accessibilityLabel={t('common:a11y.back')} onPress={() => goBack()}>
            {/* Tinted: chrome is monochrome, and the illustration's own palette
                reads as a stray accent. */}
            <Icon set="ui" name="chevron-left" size={20} tintColor={colors.muted} />
          </IconButton>

          {/* THE THINGS YOU CAN DO TO THE WHOLE ENTRY, together, in the order of
              least to most destructive: send a picture of it, correct it, throw
              it away.

              Share is first because it changes nothing at all — it is the one
              control up here that only reads. It also puts the most destructive
              button furthest from the one somebody reaches for casually, which
              is the reason this row is ordered rather than grouped.

              The pencil was on the line under the title and it did not belong
              there — that line is the entry's date, and a control at the end of it
              read as "edit the date" when what it opens is the name and the when.
              Up here it sits beside the bin, which is the other thing that acts on
              the entry as a whole, and the date line goes back to being a fact.

              Delete lives up here rather than in a card at the foot of the screen.
              It was the last thing on a page that scrolls, so removing a row meant
              scrolling past every control for editing it first, and it read as one
              more editing step rather than as the way out. The press only opens
              the confirmation, which is what makes a one-tap destructive control
              in the chrome safe.

              All three are absent while composing a new entry: there is nothing
              logged to send, nothing to delete, and nothing whose name and time
              can be corrected. */}
          <View className="flex-row gap-2">
            {existing ? (
              <IconButton
                size="sm"
                accessibilityLabel={t('logging:detail.shareEntry')}
                disabled={shareMeal.sharing}
                onPress={() => void sendMeal()}
              >
                {/* Tinted, like the chevron and the bin: the way out, the way to
                    share and the way to delete are chrome, and the pencil between
                    them is the one glyph whose colour carries its meaning. */}
                <Icon set="ui" name="share" size={20} tintColor={colors.muted} />
              </IconButton>
            ) : null}

            {existing && clock ? (
              <IconButton
                size="sm"
                accessibilityLabel={t('logging:detail.editDetails')}
                onPress={() => setEditingDetails(true)}
              >
                {/* Untinted, unlike the two chrome icons either side of it: this is
                    a yellow pencil with a red eraser and all of its meaning is the
                    colour. See `CardEdit`. */}
                <Icon set="ui" name="edit" size={20} />
              </IconButton>
            ) : null}

            {existing ? (
              <IconButton
                size="sm"
                accessibilityLabel={t('logging:detail.deleteEntry')}
                onPress={() => setConfirmDelete(true)}
              >
                {/* Tinted to hibiscus rather than to muted, because this one is not
                    neutral chrome. */}
                <Icon set="ui" name="delete" size={20} tintColor={colors.hibiscusInk} />
              </IconButton>
            ) : null}
          </View>
        </View>
      </View>

      {/* Everything else, ON A CURVE THAT RIDES OVER THE PICTURE.
          A straight cut between the photograph and the content reads as two
          stacked blocks. Lifting the content by `CONTENT_LIFT` and rounding its
          top corners leaves the picture showing behind the curve at both edges, so
          the page reads as one surface sliding up over the plate — which is also
          why the box above got taller by the same amount: the overlap covers a
          strip of it rather than cropping the meal.

          `bg-canvas`, not a card fill. It is the screen's own background carrying
          on, and a surface colour here would make the whole lower half of the
          screen look like one enormous card with cards inside it.

          It also carries the gutter, which `Screen`'s `flush` dropped for the
          whole scroll view so the photograph could reach the edges — this wrapper
          is the one place that puts it back.

          The negative margin has to clear the shell's own stack gap BEFORE it can
          overlap anything, hence the sum rather than a bare offset; and the top
          padding is that same lift plus the gap, so the title still sits its usual
          distance below the picture rather than up against the curve. */}
      <View
        className="gap-stack rounded-t-card bg-canvas px-gutter"
        style={{
          marginTop: -(spacing.stack + CONTENT_LIFT),
          paddingTop: CONTENT_LIFT + spacing.stack,
        }}
      >
        {/* THE NAME AND THE TIME AS ONE BLOCK, which is what "gap-1" is doing:
            they are a heading and its subtitle, and separated by the stack gap
            every card gets they read as two unrelated lines with the date
            floating between the title and the first card.

            The name is the page's own heading now that there is no bar to carry
            it. Two lines, and this is the one screen that asks for them: a dish
            name here is whatever the model or the user wrote — "Nasi Lemak with
            Fried Chicken with pineapple juice" — and on one line that truncates to
            three words and an ellipsis, which is a meal nobody can recognise on
            the screen for checking it. `dishName` is where the fallback order
            lives, because the shared card reads the same name.

            The time under it is the same pair of facts the diary row prints under
            a dish name — the day off `log_date`, the time off `logged_at` — and it
            is a FACT now rather than a row: it carried the entry's edit control at
            its end, which read as "edit the date" when what it opens is the name
            and the when. That pencil is up on the picture beside the bin.

            No icon in front of it either. A clock pictogram before a time says
            what the time already says, and `system/clock` tinted flat at 16pt is a
            grey dot.

            Only for an entry that has a timestamp. A row being composed has none,
            and its day is whatever the strip on Today has selected — a question
            that screen has already asked. */}
        <View className="gap-1">
          <Text variant="title" numberOfLines={2}>
            {dishName}
          </Text>
          {existing && clock ? (
            <Text variant="meta">
              {t('logging:detail.whenValue', {
                day: dayLabel(whenDate, todayKey, {
                  today: t('common:date.today'),
                  yesterday: t('common:date.yesterday'),
                }),
                time: formatTime(instantOn(whenDate, clock)),
              })}
            </Text>
          ) : null}
        </View>

        <IconPicker
          visible={pickingIcon}
          onClose={() => setPickingIcon(false)}
          selected={shownIcon}
          // Held back for the confirmation below when there is a photo to lose.
          onSelect={(next) => (hasPhoto ? setPendingIcon(next) : applyIcon(next))}
          // The other way to answer the same question, in the same sheet.
          onPickPhoto={(uri) => void attachPhoto(uri)}
        />

        {/* Fires when a drawing is chosen over a photo, which is the one choice in
          this flow that throws something away. A photo replacing a photo does not
          come through here. */}
        <ConfirmSheet
          visible={pendingIcon !== undefined}
          onClose={() => setPendingIcon(undefined)}
          onConfirm={() => {
            if (pendingIcon) applyIcon(pendingIcon)
            setPendingIcon(undefined)
          }}
          title={t('logging:detail.replacePhotoTitle')}
          description={t('logging:detail.replacePhotoBody')}
          confirmLabel={t('logging:detail.replacePhotoConfirm')}
          cancelLabel={t('common:action.keep')}
          tone="danger"
        />

        {/* THE PORTION: the stepper and the chips, on the page, on both paths.

          It spent a moment as a card with a pencil to a sheet, for consistency
          with the figures and the plate — and a plus and a minus do not want a
          form around them. What they want is somewhere to save, which is what a
          SHORT DEBOUNCE is: three taps to reach two and a half plates is one
          write. See `savePortion`.

          Absent for a plate the scan broke down. An entry with a breakdown IS its
          breakdown — `food_log_details` reads the sum of the parts and never the
          parent's portion — so this stepper moved a number on screen and nothing
          in the diary. The ingredient card below is where that plate's amounts are
          edited, one part at a time, which is the whole reason the breakdown
          exists.

          `serving?.label`, not `serving.label`. `find(...) ?? servings[0]` is
          `Serving` to the compiler and `undefined` at runtime when the list is
          empty, because `noUncheckedIndexedAccess` is off — and reading `.label`
          off it crashed the whole screen. `toFood` guarantees a portion now, so
          this is the belt to that braces. */}
        {parts.length ? null : (
          <Card>
            <Stepper
              value={quantity}
              onChange={(next) => {
                setQuantity(next)
                schedulePortion({ quantity: next, servingId: chosen })
              }}
              // Quarters, matching the parts of a broken-down plate: a portion
              // is the same kind of quantity either way, and two controls moving
              // by different amounts is a thing to discover rather than use.
              min={0.25}
              max={20}
              step={0.25}
              // And for the amounts quarters cannot express — 0.3 of a tub — the
              // number itself is a field.
              editable
              editLabel={t('logging:detail.typeServings')}
              accessibilityLabel={t('logging:detail.servings')}
              decrementLabel={t('common:a11y.decrease')}
              incrementLabel={t('common:a11y.increase')}
              // The unit is the serving the user picked below, not a generic
              // "pieces" — a plate and a piece are different amounts of food.
              unit={servingUnit(serving?.label) ?? t('logging:detail.servingWord')}
            />

            <View className="flex-row flex-wrap gap-2">
              {food.servings.map((option) => (
                <Chip
                  key={option.id}
                  selected={option.id === chosen}
                  onPress={() => {
                    setServingId(option.id)
                    schedulePortion({ quantity, servingId: option.id })
                  }}
                >
                  {option.label}
                </Chip>
              ))}
            </View>
          </Card>
        )}

        {/* THE FIGURES, read here and edited in a sheet. The title is the card's
          own now rather than a caption beside the number, because the header row
          is what carries the way in — see `CardEdit`. */}
        <Card
          title={t('logging:detail.total')}
          action={
            existing ? (
              <CardEdit
                label={t('logging:detail.editFigures')}
                onPress={() => setEditingFigures(true)}
              />
            ) : undefined
          }
        >
          {/* The figure alone. The card's own title already says KCAL TOTAL, and a
            "kcal" caption beside the number said it a second time. */}
          <Text variant="displayMd">{macros.kcal.toLocaleString()}</Text>

          {targets ? <MacroBars eaten={macros} targets={targets} /> : null}

          {/* Whose numbers these are, which the reset link used to say by being
            there. Without it a typed figure and the app's own answer look the
            same on the card, and the only way to find out was to open the sheet. */}
          {existing && FIGURES.some((key) => typed[key].trim()) ? (
            <Text variant="meta">{t('logging:detail.yourFigures')}</Text>
          ) : null}

          {/* The rule goes with the section it introduces. See `hasExtras`. */}
          {hasExtras ? <Divider /> : null}

          {/* Only when there is something under it. This used to be shown for
            every dish so that "nobody recorded it" was still an answer — but
            most of the catalogue has none of these columns, so most rows grew
            a control that opened three dashes. */}
          {hasExtras ? (
            <Tappable
              className="flex-row items-center justify-between"
              onPress={() => setShowNutrients((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showNutrients }}
              accessibilityLabel={t('logging:detail.moreNutrients')}
            >
              <Text variant="label">{t('logging:detail.moreNutrients')}</Text>
              <Icon set="ui" name={showNutrients ? 'chevron-up' : 'chevron-down'} size={20} />
            </Tappable>
          ) : null}

          {showNutrients ? (
            <View className="gap-2">
              {extras.map((row) => (
                <View key={row.key} className="flex-row items-baseline justify-between gap-3">
                  <Text variant="body">{row.label}</Text>
                  <Text variant="label" className={row.value ? undefined : 'text-faint'}>
                    {/* An em dash rather than "0 g". Null in these columns means
                      nobody recorded the number, and zero is a claim. */}
                    {row.value ?? '—'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* What the plate is made of. Read here, edited on `log/ingredients`,
          and each part written through `set_ingredient_quantity`.

          That function deliberately does NOT touch the parent row — see the note in
          `34_food_log_ingredients.sql`, which used to rescale the entry's own
          `quantity` and stopped because scaling a parent moves all four of its
          macros at once. The totals follow because `food_log_details` SUMS the
          parts whenever there are any, so the plate and the entry cannot disagree
          without one of them being wrong about arithmetic.

          IT IS HERE FOR EVERY ENTRY NOW, not only a scanned one that decomposed.
          The card used to be the scan's own account of a photograph and appeared
          nowhere else, which meant the one thing a user could not do to a plate
          was put something on it: a dish logged from search that turned out to
          have come with a fried egg had to be renamed, re-costed by hand, or
          handed to the model. With nothing broken down the card is one line and
          a plus, and adding the first part seeds the entry as its own — see
          `add_ingredient`.

          Not while the parts are still being fetched, though. An empty card that
          fills in a moment later reads as a plate that lost its ingredients. */}
        {existing && !partsLoading ? (
          <Card
            title={t('logging:detail.plateTitle')}
            action={
              /* One glyph, for both halves of the job. The plus used to sit
                 beside this pencil, which made the header ask two questions
                 about one thing — resizing a part and putting one on are the
                 same edit, and both are behind here now. It is offered on an
                 entry with NO breakdown too: adding the first part is what that
                 page is for there.

                 It PUSHES, unlike the other two pencils on this screen, which
                 open sheets. The plate is the one of the three that leads
                 somewhere else — the catalogue search that adds a part — and a
                 sheet cannot host a second sheet without one of them having to
                 close, which is what dropped the user two panels back when they
                 dismissed the search. See `log/ingredients`. */
              <CardEdit
                label={t('logging:detail.editPlate')}
                onPress={() =>
                  router.push({
                    pathname: '/log/ingredients',
                    params: { entryId: existing.id, logDate: existing.logDate },
                  })
                }
              />
            }
          >
            {parts.map((ingredient) => (
              <View key={ingredient.id} className="flex-row items-start justify-between gap-3">
                {/* HOW MANY, THEN WHAT, THEN WHAT IT WEIGHS — a cart line, of
                    which `PartLine` is the first two thirds.

                    The weight used to sit on a second line behind a multiplier —
                    "× 0.75 · 165 g" — which led with the number nobody can act
                    on: the multiplier is how the row STORES an amount, and 165 g
                    is the amount. So the weight moved into a bracket after the
                    name, and the count came back in front of it.

                    The two numbers answer different questions and the row needs
                    both. 480 g is what to check against the plate in front of
                    you; "1 ×" is what to check against yourself. The count is
                    rounded to a quarter and the weight is not, which is why the
                    two can disagree and why a "~" appears when they do.

                    NO `numberOfLines`. A part's name is what this card exists to
                    show — the model's own account of what was on the plate — and
                    truncated to one line "Stir fried pork belly with green
                    peppers" came out as three words and an ellipsis on the one
                    screen somebody opens to check exactly that. The bracket wraps
                    with it, being part of the same run of text. */}
                <PartLine
                  quantity={ingredient.quantity}
                  name={ingredient.name}
                  className="min-w-0 flex-1"
                >
                  {ingredient.grams ? (
                    <Text variant="meta">
                      {` ${t('logging:detail.grams', {
                        grams: Math.round(ingredient.grams).toLocaleString(),
                      })}`}
                    </Text>
                  ) : null}
                </PartLine>
                <View className="flex-row items-baseline gap-1">
                  <Text variant="numeric">{ingredient.kcal.toLocaleString()}</Text>
                  <Text variant="caption">{t('common:unit.kcal')}</Text>
                </View>
              </View>
            ))}
            {/* One line and the plus above it, for an entry nothing has broken
                down. Said rather than left blank, because an INGREDIENTS card
                with nothing under it reads as a plate whose parts went missing
                rather than as one that never had any. */}
            {parts.length ? (
              <>
                <Divider />
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
                  <View className="flex-row items-baseline gap-1">
                    <Text variant="numeric">
                      {parts.reduce((sum, item) => sum + item.kcal, 0).toLocaleString()}
                    </Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text variant="meta">{t('logging:detail.plateNone')}</Text>
            )}
          </Card>
        ) : null}

        {/* Correcting a dish by describing it belongs to an entry that already
          exists: "no sambal" is a fix to something logged, and on the way IN the
          serving chips and the stepper above say the same thing more precisely.

          The chips are the vision model's, when it offered any — what people
          most often vary about this exact dish — and a generic four when it did
          not. Either way they are instructions to the model rather than text
          the app acts on: "Half portion" reaches scan-refine's quantity rung,
          which rescales the entry and every part under it, and does it better
          than the serving swap this screen used to do by hand. */}
        {existing ? (
          <FixSheet
            visible={fixing}
            onClose={() => setFixing(false)}
            value={instruction}
            onChangeText={setInstruction}
            placeholder={t('logging:detail.fixPlaceholder')}
            suggestions={fixSuggestions}
            onSubmit={() => void sendFix()}
            submitting={sending}
          />
        ) : null}

        {/* The three sheets the cards above open. Each one drafts and hands the
          draft back; the footer's Save is still the only thing that writes.

          `computed` rather than `macros` for the placeholders: what a field
          shows through is the app's OWN answer for this portion, and `macros`
          already has the typed figures folded into it — so an entry with 400
          typed over it would offer 400 as the number to go back to. */}
        {existing ? (
          <NutritionSheet
            visible={editingFigures}
            onClose={() => setEditingFigures(false)}
            value={typed}
            computed={appFigures}
            onSave={saveFigures}
            onError={saveFailed}
          />
        ) : null}

        {existing && clock ? (
          <DetailsSheet
            visible={editingDetails}
            onClose={() => {
              setEditingDetails(false)
              // The entry has been filed on another day, so it is no longer in the
              // day query this screen reads — see `saveDetails` for what the page
              // turns into if it stays.
              if (movedAway.current) {
                movedAway.current = false
                goBack()
              }
            }}
            details={{ name: name.trim(), date: whenDate, clock }}
            // What the name falls back to when the field is emptied, and what the
            // sheet hands back in that case: the row's own name, never blank.
            namePlaceholder={existing.foodName}
            today={todayKey}
            onSave={saveDetails}
            onError={saveFailed}
          />
        ) : null}

        <ConfirmSheet
          visible={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={remove}
          title={t('logging:detail.deleteTitle')}
          description={t('logging:detail.deleteBody')}
          confirmLabel={t('common:action.delete')}
          cancelLabel={t('common:action.keep')}
          tone="danger"
        />

        {/* WHAT THE SHARE BUTTON SENDS. It draws itself where nobody can see it
            — see the root view in `MealShareCard` — and is mounted for as long
            as the entry is, so a tap is a capture rather than a mount, a layout,
            a photograph and a share sheet in sequence.

            It reads the same values this screen reads, from the same variables,
            so a portion stepped or a macro typed a moment ago is on the picture,
            and the plate somebody is looking at is the plate that gets sent. */}
        {existing ? (
          <MealShareCard
            ref={shareMeal.card}
            name={dishName}
            macros={macros}
            photo={sharePhoto}
            icon={shownIcon}
          />
        ) : null}
      </View>
    </Screen>
  )
}
