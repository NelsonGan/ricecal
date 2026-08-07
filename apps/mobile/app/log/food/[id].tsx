import { Image } from 'expo-image'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, BackHandler, Platform, TextInput, View } from 'react-native'

import {
  type EntryPatch,
  type IconRef,
  removeMealPhoto,
  storedImageSource,
  uploadMealPhoto,
  useDayLog,
  useEntryIngredients,
  useFood,
  useLogFood,
  useMealPhotoUrl,
  useRefineEntry,
  useRemoveEntry,
  useRemoveIngredient,
  useSelectedDate,
  useTargets,
  useUpdateEntry,
  useUpdateIngredient,
} from '@/data'
import { FixSheet, IconPicker } from '@/features/logging'
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import { entryTotals } from '@/lib/nutrition'
import { servingUnit, titleCase } from '@/lib/portions'
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
  TextField,
  useToast,
} from '@/ui'

/**
 * Chips under the fix box for an entry the model offered none of its own for —
 * anything hand-logged, and a scan that came back without suggestions.
 *
 * The four most common corrections in any diary, and each is a sentence
 * `scan-refine` reads: "Half portion" is its quantity rung, "No sambal" its
 * adjust rung. Nothing here is special-cased on the client.
 */
const QUICK_FIXES = ['halfPortion', 'noSambal', 'addEgg', 'extraRice'] as const

/** The four figures a user can type over, in the order the card reads them. */
const FIGURES = ['kcal', 'carbs', 'protein', 'fat'] as const

/**
 * L6 FOOD DETAIL, in both of its jobs.
 *
 * With an `entryId` it edits something already logged; without one it composes
 * a new entry from the catalogue. The controls are identical either way, so the
 * difference is confined to what the button at the foot of it does.
 *
 * NOTHING HERE IS WRITTEN UNTIL SAVE. Every control stages its change in local
 * state and the footer commits the lot — the portion, the serving, the typed
 * figures, the name, the picture and each part of a scanned plate, in one
 * deliberate act. It used to write as it was edited, on a debounce, which made
 * the screen honest about the moment but impossible to think in: a plate being
 * corrected in four places was four round trips and four refetches, and there
 * was no way to change your mind about any of them except by changing them
 * back.
 */
export default function FoodDetail() {
  const { t } = useTranslation(['logging', 'common'])
  const goBack = useBack('/today')
  /**
   * Adding a dish ends the whole flow, so it unwinds to the day rather than
   * stepping back one screen.
   *
   * Still `useDismissTo` even though this screen is a page now: the quick
   * selector it came through is a transparent modal, and popping one screen would
   * land on the search page the user is finished with. It dismisses what is
   * presented and then replaces, so either shape ends up on Today.
   */
  const finish = useDismissTo('/today')
  const navigation = useNavigation()
  const colors = useThemeColors()
  const toast = useToast()
  const logFood = useLogFood()
  const updateEntry = useUpdateEntry()
  const removeEntry = useRemoveEntry()
  const { data: targets } = useTargets()
  const { selectedDate } = useSelectedDate()

  const params = useLocalSearchParams<{ id: string; entryId?: string }>()
  const { data: food, isPending } = useFood(params.id)

  // The entry being edited, if this screen was opened from a row. It is on the
  // day in view — the only day whose entries are loaded — which is also the
  // only day a row can be tapped from.
  const day = useDayLog(selectedDate)
  const existing = params.entryId
    ? day.entries.find((entry) => entry.id === params.entryId)
    : undefined

  // The plate's parts, for a scanned entry that decomposed. Everything else
  // gets an empty list and no section.
  //
  // `isLoading` rather than `isPending`: a disabled query is pending forever,
  // and every hand-logged entry disables this one. What is being asked is "is
  // there a request out for this plate's parts right now".
  const { data: ingredients = [], isLoading: partsLoading } = useEntryIngredients(
    existing?.scanId ? existing.id : undefined,
  )
  const refineEntry = useRefineEntry()
  const updateIngredient = useUpdateIngredient()
  const removeIngredient = useRemoveIngredient()

  const [quantity, setQuantity] = useState(existing?.quantity ?? 1)
  const [servingId, setServingId] = useState(existing?.servingId ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  /** Leaving with something staged, which throws it away. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [saving, setSaving] = useState(false)
  /** The fix-by-typing sheet, and the words in it. */
  const [fixing, setFixing] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState(false)
  /**
   * Which entry the controls above were filled in from.
   *
   * They are seeded in `useState`, which runs once — and on the way in from a
   * notification, or a cold start on a deep link, the day query has not
   * answered yet, so `existing` is undefined for the first render or two. The
   * screen used to keep those initial values for the rest of its life: a
   * two-portion entry editing as one, a typed correction the reset link could
   * not see. Seeding again the first time the row actually arrives is the fix,
   * and the id is what stops it happening a second time over a live edit.
   *
   * State rather than a ref, because the change detection below READS it during
   * render: `existing` lands a render before the seeding effect runs, and
   * comparing the untouched defaults against the row it has not been filled in
   * from yet makes every field look edited.
   */
  const [seededId, setSeededId] = useState<string>()
  /**
   * The illustration, only once the user has picked one.
   *
   * `undefined` means untouched, which sends no icon at all. Seeding it from
   * `existing.icon` would instead write the food's own drawing onto the entry as
   * an override the first time anything else was saved.
   */
  const [icon, setIcon] = useState<IconRef>()
  const [pickingIcon, setPickingIcon] = useState(false)
  /**
   * A drawing chosen while a photo is on the row, waiting on the confirmation.
   *
   * The warning used to sit on the way IN to the picker — tap a tile with a photo
   * in it and answer a question before seeing the choices. That was the only way
   * in when the only thing the picker offered was drawings. It offers the camera
   * now, so most trips through it are not destructive at all, and the question
   * belongs where the destructive answer is given.
   */
  const [pendingIcon, setPendingIcon] = useState<IconRef>()
  /**
   * A photo taken here, uploaded but not yet on any row.
   *
   * Two fields because they are needed at different moments: the local uri is
   * what the tile shows the instant the shot is taken, and the bucket key is what
   * Save carries.
   */
  const [shot, setShot] = useState<{ uri: string; path: string }>()
  /**
   * The same key again, as a ref, for as long as no row points at it.
   *
   * The upload cannot wait for the button — it is what turns a 4MB frame into a
   * key — so between the shutter and Save the object is real and referenced by
   * nothing. EVERY way off this screen that is not Save or Add has to take it
   * with it: backing out, the swipe, a drawing chosen over it, a deep link
   * replacing the route. An unmount effect is the only place that catches all
   * of them, and an effect cannot read state it was not told about — hence the
   * ref beside the state rather than a `shot` dependency, which would fire the
   * cleanup on every shot rather than on the last one.
   */
  const orphanShot = useRef<string | undefined>(undefined)
  const [attaching, setAttaching] = useState(false)
  // Collapsed by default. Fibre, sugar and salt are the second question about a
  // dish, and for most of the catalogue the answer is "nobody recorded it".
  const [showNutrients, setShowNutrients] = useState(false)
  /**
   * Figures typed by hand, as strings while they are being typed.
   *
   * An empty field is "nothing overridden here", not "zero" — what the app
   * worked out shows through as the placeholder, and a field pre-filled with
   * the app's own number could not tell the user whose number it was.
   */
  const [typed, setTyped] = useState<{ kcal: string; carbs: string; protein: string; fat: string }>(
    { kcal: '', carbs: '', protein: '', fat: '' },
  )
  /**
   * Which figure is being typed, if any.
   *
   * One at a time and in place: the number on screen becomes a field when it
   * is tapped and goes back to being a number when the keyboard closes. A
   * second card repeating all four figures was the other way to offer this,
   * and it asked the user to read the same numbers twice to change one.
   */
  const [editing, setEditing] = useState<'kcal' | 'carbs' | 'protein' | 'fat' | null>(null)
  /** The title, while it is being retyped. */
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  /**
   * Parts of a scanned plate that have been moved or taken off, not yet written.
   *
   * An overlay on the fetched list rather than a copy of it, so a refetch
   * landing mid-edit cannot silently drop a staged change — and so "stepped up
   * and back down again" is not a change at all. `null` is a part on its way
   * off the plate.
   */
  const [partEdits, setPartEdits] = useState<Record<string, number | null>>({})

  // `isLoading` rather than `isPending`, for the reason the ingredients query
  // above gives: an entry with no photo disables this one, and a disabled query
  // is pending forever.
  const { data: heroUrl, isLoading: signing } = useMealPhotoUrl(existing?.photoPath)

  /**
   * A typed figure as a number, and `null` for a field holding nothing.
   *
   * Null is the answer the write side wants: it clears the override and hands
   * the figure back to the catalogue. An empty field and an unreadable one
   * mean the same thing here — the user has not given a number.
   */
  const figure = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  /**
   * The plate as the screen shows it: what the scan found, with the staged
   * changes laid over it.
   *
   * Everything on a row scales with its portion, not only the calories. The
   * card's total and the entry's macros are a sum of these, so moving kcal
   * alone would show a plate that disagreed with its own total right up until
   * Save — which is the same reasoning behind the optimistic patch in
   * `useUpdateIngredient`, applied here to an edit that has not been sent yet.
   */
  const parts = ingredients.flatMap((ingredient) => {
    const staged = partEdits[ingredient.id]
    if (staged === null) return []
    if (staged === undefined || staged === ingredient.quantity) return [ingredient]
    const factor = staged / Math.max(0.01, ingredient.quantity)
    const tenth = (value: number) => Math.round(value * factor * 10) / 10
    return [
      {
        ...ingredient,
        quantity: staged,
        kcal: Math.round(ingredient.kcal * factor),
        carbs: tenth(ingredient.carbs),
        protein: tenth(ingredient.protein),
        fat: tenth(ingredient.fat),
        // The weight is a quantity like the calories are, so it has to move
        // with the stepper too — half a portion that still says 180 g is a
        // preview of a row the server will not write.
        grams: ingredient.grams === null ? null : Math.round(ingredient.grams * factor),
      },
    ]
  })

  /** The parts whose staged value actually differs from what is on the server. */
  const partChanges = ingredients.filter((ingredient) => {
    const staged = partEdits[ingredient.id]
    return staged === null || (staged !== undefined && staged !== ingredient.quantity)
  })

  /**
   * What each control would write, or `undefined` for one nobody touched.
   *
   * Computed rather than tracked, so a value edited back to what it was is not
   * a change — which is what makes the Save button an honest answer to "is
   * there anything here to save".
   *
   * All of it waits on `seeded`. Until the effect below has filled the controls
   * in from the row, they hold their defaults — one portion, no note — and
   * against a real entry every one of those reads as an edit the user did not
   * make. The Save button flashed enabled for a frame on the way in from a
   * notification for exactly this reason.
   */
  const seeded = Boolean(existing) && seededId === existing?.id
  const nameChange =
    seeded && name.trim() && name.trim() !== existing?.foodName ? name.trim() : undefined
  // Only on an entry with no breakdown. An entry with one IS its breakdown, so
  // the stepper is not on screen and the parts above are what moves.
  const quantityChange =
    seeded && !parts.length && quantity !== existing?.quantity ? quantity : undefined
  const servingChange =
    seeded && !parts.length && servingId && servingId !== existing?.servingId
      ? servingId
      : undefined
  // All four together or none: `typed` holds the user's answer for every
  // figure, and an empty field is the deliberate "use the app's number".
  const overridesChange =
    seeded && FIGURES.some((key) => figure(typed[key]) !== (existing?.overrides?.[key] ?? null))
      ? {
          kcal: figure(typed.kcal),
          carbs: figure(typed.carbs),
          protein: figure(typed.protein),
          fat: figure(typed.fat),
        }
      : undefined
  // A row carries a photo or a drawing, never both, and each of the two
  // controls clears the other — so at most one of these is ever set. Not gated
  // on `seeded`: a picture is not seeded from anything, it is only ever chosen.
  const pictureChange = existing && (shot ? { photoPath: shot.path } : icon ? { icon } : undefined)

  const dirty = Boolean(
    nameChange ||
      quantityChange !== undefined ||
      servingChange ||
      overridesChange ||
      pictureChange ||
      (seeded && partChanges.length),
  )

  // The controls, filled in from the row the first time it is actually here.
  // See `seededFrom` for why once is not the same as at mount.
  useEffect(() => {
    if (!existing || seededId === existing.id) return
    setSeededId(existing.id)
    setQuantity(existing.quantity)
    setServingId(existing.servingId)
    setName(existing.foodName)
    setPartEdits({})
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

  /**
   * The two ways off this screen that are not the chevron.
   *
   * A staged form has to ask before it throws the staging away, and the back
   * chevron is the only exit this screen owns. The swipe is turned off while
   * there is something to lose — react-navigation's own "prevent remove" is not
   * reachable through expo-router's fork — and Android's hardware back is
   * caught and turned into the same question the chevron asks.
   */
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty })
  }, [navigation, dirty])

  useEffect(() => {
    if (Platform.OS !== 'android' || !dirty) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setConfirmDiscard(true)
      return true
    })
    return () => subscription.remove()
  }, [dirty])

  if (!food) {
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
   * The drawing this tile would show, if it is showing one at all.
   *
   * A row carries a photo or an icon, never both, and the view already suppresses
   * its icon columns while a photo exists — so `existing.icon` is undefined for a
   * snapped plate. Only an unsaved choice can override that, which is exactly the
   * swap: pick a drawing and the photo is on its way out.
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
   * What this entry would count as if it were saved now.
   *
   * `entryTotals` is the client's copy of the `coalesce` in
   * `food_log_details`: typed, then parts, then portion. Read from the staged
   * values rather than from the row, which is the whole point of a form — a
   * figure typed a moment ago, a portion just stepped, an ingredient taken off
   * the plate all show here before anything is written, and the number the
   * Save button commits is the number that was on screen.
   *
   * While a scanned plate's parts are still on their way, the row's own figure
   * stands in. It is the same three-source answer, worked out by the view — so
   * the number is right from the first frame rather than being the parent's
   * portion for as long as the query takes and then jumping.
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
   * The same scaling for the nutrients that are not part of the budget.
   *
   * `undefined` survives it: these columns are null for most of the imported
   * catalogue, and null means nobody recorded the number rather than zero of it.
   * One decimal, because a tenth of a gram of fibre is the resolution the
   * database stores.
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
   * Put a photo of the actual plate on this row.
   *
   * The uri comes from the picker's own viewfinder, so by the time this runs the shot
   * has been taken and there is nothing left to present. That is what fixed the
   * camera which used to open and shut immediately: it was a native picker being
   * asked to present while this sheet was dismissing, which iOS cancels — leaving a
   * promise that never settles and a spinner that never stops.
   *
   * The upload happens here rather than at Save because a key is what the row can
   * hold; only the key waits for the button. A shot this one replaces never
   * reached a row, so it is deleted on the spot.
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
      // The photo IS the picture now, so an unsaved drawing has been answered.
      setIcon(undefined)
    } catch {
      // An upload that failed, a bucket that refused it: neither is worth a screen
      // of its own.
      toast.show({ title: t('logging:detail.photoFailed'), tone: 'error' })
    } finally {
      setAttaching(false)
    }
  }

  /**
   * A drawing wins the slot, so whatever photo was in it has to go.
   *
   * A shot staged on this screen has already been uploaded and now points at
   * nothing, so it is deleted here. The row's OWN photo is left alone — it is
   * still what the row shows until Save writes the drawing over it, and
   * `useUpdateEntry` deletes it then.
   */
  const applyIcon = (next: IconRef) => {
    setIcon(next)
    if (!shot) return
    setShot(undefined)
    if (orphanShot.current) void removeMealPhoto(orphanShot.current).catch(() => {})
    orphanShot.current = undefined
  }

  const hasPhoto = Boolean(shot ?? existing?.photoPath)

  const addToDiary = () => {
    logFood.mutate({
      foodId: food.id,
      servingId: chosen,
      quantity,
      logDate: selectedDate,
      // Only what was actually chosen. `shownIcon` would write the food's own
      // drawing onto the row as an override, which is not an override at all.
      icon,
      // And a photo taken while composing this row, which the picker offers as
      // the alternative to a drawing. Never both: taking one clears the other.
      photoPath: shot?.path,
    })
    // The insert carries it now, so it is not an orphan for the unmount effect
    // to sweep up on the way out.
    orphanShot.current = undefined
    finish()
  }

  /**
   * Everything staged, written in one go. Throws, so its callers can leave the
   * user where they are with the form still filled in.
   *
   * Parts first: `set_ingredient_quantity` recomputes the parent entry inside
   * the same transaction, and the patch that follows carries figures the user
   * typed against the plate those parts add up to.
   */
  const commit = async () => {
    if (!existing) return

    for (const ingredient of partChanges) {
      const staged = partEdits[ingredient.id]
      if (staged === null) {
        await removeIngredient.mutateAsync({
          ingredientId: ingredient.id,
          entryId: existing.id,
          logDate: selectedDate,
        })
      } else if (staged !== undefined) {
        await updateIngredient.mutateAsync({
          ingredientId: ingredient.id,
          quantity: staged,
          entryId: existing.id,
          logDate: selectedDate,
        })
      }
    }

    const patch: EntryPatch = {
      id: existing.id,
      logDate: existing.logDate,
      ...(nameChange ? { name: nameChange } : {}),
      ...(quantityChange === undefined ? {} : { quantity: quantityChange }),
      ...(servingChange ? { servingId: servingChange } : {}),
      ...(overridesChange ? { overrides: overridesChange } : {}),
      ...(pictureChange ?? {}),
      // What is on the row now, so whichever picture replaces it can delete the
      // object it leaves behind.
      ...(pictureChange ? { currentPhotoPath: existing.photoPath } : {}),
    }
    // Two keys is the empty patch: an update with nothing in it is a round trip
    // that invalidates the day for no reason.
    if (Object.keys(patch).length > 2) await updateEntry.mutateAsync(patch)
    // The row points at the photo now. Cleared only after the write, so a patch
    // that threw leaves the object for the unmount sweep rather than deleting
    // one the user is about to try saving again.
    if (patch.photoPath) orphanShot.current = undefined
  }

  const save = async () => {
    setSaving(true)
    try {
      await commit()
    } catch {
      toast.show({ title: t('logging:detail.saveFailed'), tone: 'error' })
      setSaving(false)
      return
    }
    goBack()
  }

  const leave = () => {
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    goBack()
  }

  const discard = () => {
    setConfirmDiscard(false)
    // A staged photo needs no handling here: it is still in `orphanShot`, and
    // the unmount sweep takes it whichever way this screen goes.
    goBack()
  }

  /**
   * Send the typed correction and leave.
   *
   * Whatever is staged is written FIRST. The server interprets the correction
   * against the entry as it stands there — the parts it is shown, the calories
   * it is told — so sending "and half the rice" against a plate the user has
   * already changed on screen would correct a meal neither of them is looking
   * at. After that it is fire-and-forget: the correction runs for several
   * seconds and this screen describes the entry's OLD identity the whole time,
   * so it leaves and the row on Today shows the work.
   */
  const sendFix = async () => {
    const text = instruction.trim()
    if (!existing || !text) return
    setSending(true)
    try {
      await commit()
    } catch {
      toast.show({ title: t('logging:detail.saveFailed'), tone: 'error' })
      setSending(false)
      return
    }
    refineEntry({
      entryId: existing.id,
      instruction: text,
      logDate: selectedDate,
      // Said out loud, from wherever the user has got to by then — the toast
      // provider sits above the navigator, and this screen is gone a frame
      // after the send. A row that worked and then changed nothing is
      // otherwise indistinguishable from a correction that did not matter.
      onNotApplied: () => toast.show({ title: t('logging:detail.fixNotApplied'), tone: 'warning' }),
    })
    finish()
  }

  const commitName = () => {
    setRenaming(false)
    // A name emptied is not a rename, and the title falls back to the row's.
    if (!name.trim()) setName(existing?.foodName ?? '')
  }

  const remove = () => {
    if (existing) {
      removeEntry.mutate({
        id: existing.id,
        logDate: existing.logDate,
        photoPath: existing.photoPath,
      })
    }
    setConfirmDelete(false)
    goBack()
  }

  return (
    <Screen
      footer={
        existing ? (
          /* Two buttons, and the split is what they cost. Save writes what is
             on screen and stays in the diary; Fix it hands the entry back to
             the model, which can return a different meal — so it is the
             secondary, and it is the one that opens a question first. */
          <View className="flex-row gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              leftIcon={<Icon set="system" name="sparkle" size={20} />}
              onPress={() => setFixing(true)}
            >
              {t('logging:detail.fixAction')}
            </Button>
            <Button
              className="flex-1"
              loading={saving}
              disabled={!dirty}
              onPress={() => void save()}
            >
              {t('logging:detail.save')}
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
      {/* A chevron, not a cross: this is a full page now, pushed from search or
          from a row on the day, so there is always a screen behind it. `useBack`
          falls back to Today for the one route that arrives with no history —
          a deep link straight to a dish. */}
      <AppBar
        /* The name the row wears, which for a scanned plate is the model's
           ("Korean fried chicken with rice and sides") rather than the matched
           catalogue row's ("MEAL KIT, KOREAN FRIED CHICKEN WITH SWEET
           GOCHUJANG SAUCE"). Everything else on this screen is the catalogue
           row's; the title is what the user just tapped. */
        title={name.trim() || existing?.foodName || food.name}
        // Tapping the title renames THIS entry — the model's guess at a dish
        // is right about the food and wrong about the words often enough that
        // correcting it should not require re-describing the meal. It stages
        // `display_label`, so the catalogue row underneath is untouched and
        // every other log of the same dish keeps its own name.
        onPressTitle={existing ? () => setRenaming(true) : undefined}
        onBack={leave}
        backLabel={t('common:a11y.back')}
        /* Delete lives up here rather than in a card at the foot of the screen.
           It was the last thing on a page that scrolls, so removing a row meant
           scrolling past every control for editing it first — and it read as one
           more editing step rather than as the way out.

           Icon only, and the label is the copy the row used to carry, so a screen
           reader still says "Delete this entry" rather than naming a picture. The
           press only opens the confirmation, which is what makes a one-tap
           destructive control in the chrome safe.

           Absent while composing a new entry: there is nothing logged to delete
           yet, and the slot falls back to the spacer that keeps the title from
           drifting right. */
        action={
          existing ? (
            <IconButton
              size="sm"
              accessibilityLabel={t('logging:detail.deleteEntry')}
              onPress={() => setConfirmDelete(true)}
            >
              {/* Tinted rather than left in the illustration's own palette, the
                  way the back chevron is — except to hibiscus rather than to
                  muted, because this one is not neutral chrome. */}
              <Icon set="ui" name="delete" size={20} tintColor={colors.hibiscusInk} />
            </IconButton>
          ) : undefined
        }
      />

      {renaming ? (
        <Card>
          {/* Closed on the way out, whichever way out that is — but nothing is
              written here either way: the name is staged like everything else,
              and Save is what commits it. */}
          <TextField
            label={t('logging:detail.nameField')}
            value={name}
            onChangeText={setName}
            maxLength={120}
            autoFocus
            returnKeyType="done"
            onBlur={commitName}
            onSubmitEditing={commitName}
          />
        </Card>
      ) : null}

      {/* Always live, including before the entry exists. Most of the catalogue
          has no drawing, so a dish being added from the list arrives blank — and
          picking one then is the natural moment, not after saving and coming back.

          Straight into the picker whether or not there is a photo. Replacing one
          photo with another is not something to warn about, and the picker's first
          offer is the camera; the warning is on the drawing, which is the answer
          that discards a picture of the real plate. */}
      <Tappable
        className={cn(
          'items-center justify-center overflow-hidden rounded-card border-[3px] bg-track',
          // Tall enough for the whole plate when a real photo is in the slot —
          // 130px was sized for an icon and cropped the meal to a letterbox
          // strip. Icons and the empty state keep the short box.
          //
          // `signing` counts as having one, because it means the entry HAS a
          // photograph and we are waiting on a URL for it. Left out, the box
          // opened short and grew by 130px under the reader a moment later.
          (hero || signing) && !icon ? 'h-[260px]' : 'h-[130px]',
          // Dashed while there is nothing in it: a solid frame around an empty
          // box reads as a picture that failed to load.
          hero || signing || shownIcon ? 'border-line' : 'border-line border-dashed',
        )}
        onPress={() => setPickingIcon(true)}
        accessibilityRole="button"
        accessibilityLabel={
          hero ? t('logging:detail.replacePhoto') : t('logging:detail.choosePicture')
        }
      >
        {attaching ? (
          // The upload resizes and encodes a 3–6MB frame before it sends it, so
          // this is a second or two on a real photo — long enough that a tile which
          // did not change would read as the camera having done nothing.
          <ActivityIndicator />
        ) : hero && !icon ? (
          <Image
            source={hero}
            style={{ flex: 1, width: '100%' }}
            contentFit="cover"
            accessibilityLabel={t('logging:camera.photoOf', { food: food.name })}
            // See `ItemRow`: the bucket is private, so a stored plate is always
            // one signing request behind the screen it belongs to.
            transition={180}
          />
        ) : signing && !icon ? (
          /* This entry HAS a photograph and it is still being signed for.
             Without this the box drew the dish's illustration first and then
             replaced it with the photograph — the largest thing on the screen
             changing into something else while being looked at. */
          <Skeleton width="100%" height={260} rounded={false} className="bg-line" />
        ) : shownIcon ? (
          <Icon {...shownIcon} size={100} />
        ) : (
          // Empty, and only a line of copy to say what the box is for. There was
          // a camera illustration here, and at a glance in a list of dishes that
          // read as this dish's picture — which is exactly what a row with no
          // picture must not have.
          <Text variant="meta">{t('logging:detail.addPicture')}</Text>
        )}
      </Tappable>

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
        tone="danger"
      />

      {/* Absent for a plate the scan broke down. An entry with a breakdown IS
          its breakdown — `food_log_details` reads the sum of the parts and
          never the parent's portion — so this stepper moved a number on screen
          and nothing in the diary. The ingredient list below is where that
          plate's amounts are edited, one part at a time, which is the whole
          reason the breakdown exists. */}
      {parts.length ? null : (
        <Card>
          <Stepper
            value={quantity}
            onChange={setQuantity}
            // Quarters, matching the parts below — a portion is the same kind
            // of quantity whether the plate came apart or not, and two controls
            // on one screen that move by different amounts is a thing to
            // discover rather than a thing to use. `Stepper` renders 1.25 as
            // "1¼", so a quarter is as readable as a half.
            min={0.25}
            max={20}
            step={0.25}
            // And for the amounts halves cannot express — 0.3 of a tub — the
            // number itself is a field.
            editable
            editLabel={t('logging:detail.typeServings')}
            accessibilityLabel={t('logging:detail.servings')}
            decrementLabel={t('common:a11y.decrease')}
            incrementLabel={t('common:a11y.increase')}
            // The unit is the serving the user picked below, not a generic
            // "pieces" — a plate and a piece are different amounts of food.
            // Cleaned of the count and the import's measurement detail, which
            // the number to its left is already saying.
            unit={servingUnit(serving.label) ?? t('logging:detail.servingWord')}
          />

          <View className="flex-row flex-wrap gap-2">
            {food.servings.map((option) => (
              <Chip
                key={option.id}
                selected={option.id === chosen}
                onPress={() => setServingId(option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </View>
        </Card>
      )}

      <Card>
        {/* Centred rather than on a shared baseline: while the number is a
            field it is a box, and a box aligned by its text baseline sits
            visibly low against the caption beside it.

            The height is pinned so the two states are the same size. A
            `TextInput` needs more room than the `Text` it stands in for — see
            the field below — and without this the card grew by a few points
            the moment the number was tapped. */}
        <View className="min-h-[44px] flex-row items-center justify-between">
          {/* Tap the number to type your own. An entry the app got close but
              not right is corrected here, on the figure being read, rather
              than in a form underneath that repeats all four of them. */}
          {editing === 'kcal' ? (
            // The number's own face and place, with a caret in it. A bordered
            // field here made a tap on the total look like a form had opened
            // over the card.
            <TextInput
              value={typed.kcal}
              onChangeText={(value) => setTyped((current) => ({ ...current, kcal: value }))}
              onBlur={() => setEditing(null)}
              onSubmitEditing={() => setEditing(null)}
              placeholder={String(macros.kcal)}
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              accessibilityLabel={t('logging:detail.editKcal')}
              /* No `leading-*` here, unlike the `Text` this replaces.
                 `displayMd` sets a 39pt line on a 32pt Baloo ExtraBold, which
                 `Text` renders happily because it never clips — a glyph taller
                 than its line box simply overflows it. A `TextInput` is a
                 native field that crops to its line box instead, so the same
                 39 sliced the tops off the digits and left the caret hanging
                 below them. Letting the font choose its own line box is the
                 fix; the row's pinned height is what keeps the two states the
                 same size. */
              className="min-w-[120px] font-display text-[32px] text-heading"
              /* And the padding UIKit gives a text field by default, which is
                 space the `Text` does not take. */
              style={{ paddingVertical: 0, paddingHorizontal: 0 }}
              cursorColor={colors.pandan}
              selectionColor={colors.pandan}
            />
          ) : (
            <Tappable
              onPress={existing ? () => setEditing('kcal') : undefined}
              accessibilityRole={existing ? 'button' : undefined}
              accessibilityLabel={existing ? t('logging:detail.editKcal') : undefined}
            >
              <Text variant="displayMd">{macros.kcal.toLocaleString()}</Text>
            </Tappable>
          )}
          <Text variant="overline">{t('logging:detail.total')}</Text>
        </View>

        {targets ? (
          <MacroBars
            eaten={macros}
            targets={targets}
            onEdit={existing ? (macro) => setEditing(macro) : undefined}
            editing={editing === 'kcal' ? null : editing}
            editingValue={editing && editing !== 'kcal' ? typed[editing] : ''}
            onChangeAmount={(value) =>
              setTyped((current) =>
                editing && editing !== 'kcal' ? { ...current, [editing]: value } : current,
              )
            }
            onDoneAmount={() => setEditing(null)}
          />
        ) : null}

        {existing && (typed.kcal || typed.carbs || typed.protein || typed.fat) ? (
          <Tappable
            onPress={() => setTyped({ kcal: '', carbs: '', protein: '', fat: '' })}
            accessibilityRole="button"
            accessibilityLabel={t('logging:detail.numbersReset')}
          >
            <Text variant="meta" className="text-pandan-ink">
              {t('logging:detail.numbersReset')}
            </Text>
          </Tappable>
        ) : null}

        <Divider />

        {/* Only when there is something under it. This used to be shown for
            every dish so that "nobody recorded it" was still an answer — but
            most of the catalogue has none of these columns, so most rows grew
            a control that opened three dashes. */}
        {extras.some((row) => row.value !== undefined) ? (
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
            <Text variant="meta">
              {extras.every((row) => row.value === undefined)
                ? t('logging:detail.nutrientsUnknown')
                : t('logging:detail.nutrientsNote')}
            </Text>
          </View>
        ) : null}
      </Card>

      {/* What the scan decided the plate was made of, each part with its own
          portion stepper. The edits stage: the card's total and the entry's
          calories above both follow them straight away, and Save sends each one
          through set_ingredient_quantity — which recomputes the entry's own
          quantity in the same transaction, so the plate total always equals the
          sum of parts and the shared parent row's macros are never touched. */}
      {parts.length ? (
        <Card title={t('logging:detail.plateTitle')}>
          {parts.map((ingredient) => {
            // Quarters, whatever the part is sitting at.
            //
            // This used to step in whole units for a counted part and quarters
            // only below one, on the reasoning that a quarter of a satay skewer
            // is not a thing anyone put on a plate. True of skewers, and wrong
            // about everything else the scan decomposes: a scoop of rice, a
            // ladle of curry and a piece of fried chicken are all "× 1" and all
            // routinely eaten by half. Under the old rule the only way down from
            // 1 was to 0.25, and there was no way at all to say "a bit more than
            // one" — the step you needed depended on where you already were,
            // which is not something a pair of buttons can explain.
            const size = 0.25
            // At the smallest portion the minus takes the whole thing off the
            // plate. A quarter of a thing and "there wasn't any" are different
            // answers, and only one of them was reachable — the stepper simply
            // stopped, with nothing to say the row could go.
            const atFloor = ingredient.quantity <= 0.25
            const step = (direction: 1 | -1) => {
              if (direction === -1 && atFloor) {
                setPartEdits((current) => ({ ...current, [ingredient.id]: null }))
                return
              }
              const next = Math.min(10, Math.max(0.25, ingredient.quantity + direction * size))
              if (next === ingredient.quantity) return
              setPartEdits((current) => ({ ...current, [ingredient.id]: next }))
            }
            return (
              <View key={ingredient.id} className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text variant="body" numberOfLines={1}>
                    {titleCase(ingredient.name)}
                  </Text>
                  {/* The multiplier alone. The catalogue's own serving label
                      belongs to whatever row the part matched — "1 medium
                      paper (8-5/8" dia)" for a spoon of rice — and printing it
                      here described the import rather than the plate. How many
                      of it there are is the only part of that the user is
                      changing, and the calories beside it say the rest. */}
                  {/* The count and what it weighs. Its macros were under here
                      for a while and made every row two lines of small figures
                      — the plate's totals are the sum of them and are already
                      on the card above — but the weight is not more of that. It
                      is the amount itself: "× 6" is six of something whose size
                      nobody stated, and the scan now knows the size. Absent
                      where the scan did not weigh the part, since "0 g" would
                      be a claim about the food rather than about the answer. */}
                  <Text variant="meta">
                    {ingredient.grams
                      ? t('logging:detail.timesWeight', {
                          amount: ingredient.quantity,
                          grams: Math.round(ingredient.grams).toLocaleString(),
                        })
                      : t('logging:detail.times', { amount: ingredient.quantity })}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="w-[72px] flex-row items-baseline justify-end gap-1">
                    <Text variant="numeric">{ingredient.kcal.toLocaleString()}</Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
                  <IconButton
                    size="sm"
                    variant="neutral"
                    accessibilityLabel={t(
                      atFloor ? 'logging:detail.removeOf' : 'logging:detail.lessOf',
                      { name: ingredient.name },
                    )}
                    onPress={() => step(-1)}
                  >
                    <Icon
                      set="ui"
                      name={atFloor ? 'delete' : 'minus'}
                      size={16}
                      tintColor={atFloor ? colors.hibiscusInk : colors.ink}
                    />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="neutral"
                    accessibilityLabel={t('logging:detail.moreOf', { name: ingredient.name })}
                    disabled={ingredient.quantity >= 10}
                    onPress={() => step(1)}
                  >
                    <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                  </IconButton>
                </View>
              </View>
            )
          })}
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
          suggestions={
            existing.suggestedEdits?.length
              ? existing.suggestedEdits
              : QUICK_FIXES.map((fix) => t(`logging:detail.quickFix.${fix}`))
          }
          onSubmit={() => void sendFix()}
          submitting={sending}
        />
      ) : null}

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('logging:detail.deleteTitle')}
        description={t('logging:detail.deleteBody')}
        confirmLabel={t('common:action.delete')}
        tone="danger"
      />

      <ConfirmSheet
        visible={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={discard}
        title={t('logging:detail.discardTitle')}
        description={t('logging:detail.discardBody')}
        confirmLabel={t('logging:detail.discardConfirm')}
        tone="danger"
      />
    </Screen>
  )
}
