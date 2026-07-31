import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, View } from 'react-native'

import {
  type IconRef,
  MEALS,
  type Meal,
  removeMealPhoto,
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
  useUserId,
} from '@/data'
import { IconPicker } from '@/features/logging'
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import { servingUnit } from '@/lib/portions'
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
  SegmentedControl,
  Stepper,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'

/**
 * Chips over the note field for a hand-logged entry. A SCANNED entry gets its
 * chips from the vision model instead — food-specific, carried on the row —
 * and its box applies the correction through scan-refine rather than saving a
 * note.
 */
const QUICK_FIXES = ['halfPortion', 'noSambal', 'addEgg', 'extraRice'] as const

/**
 * L6 FOOD DETAIL, in both of its jobs.
 *
 * With an `entryId` it edits something already logged; without one it composes
 * a new entry from the catalogue. The controls are identical either way, so the
 * difference is confined to what the save button does.
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
  const colors = useThemeColors()
  const toast = useToast()
  const logFood = useLogFood()
  const updateEntry = useUpdateEntry()
  const removeEntry = useRemoveEntry()
  const { data: targets } = useTargets()
  const { selectedDate } = useSelectedDate()
  // For the upload's object key, which the bucket's insert policy checks against
  // `auth.uid()` — a file written under anyone else's folder is refused.
  const userId = useUserId()

  const params = useLocalSearchParams<{ id: string; entryId?: string; meal?: Meal }>()
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
  const { data: ingredients = [] } = useEntryIngredients(existing?.scanId ? existing.id : undefined)
  const refineEntry = useRefineEntry()
  const updateIngredient = useUpdateIngredient()
  const removeIngredient = useRemoveIngredient()
  const [instruction, setInstruction] = useState('')

  const [quantity, setQuantity] = useState(existing?.quantity ?? 1)
  const [servingId, setServingId] = useState(existing?.servingId ?? '')
  const [meal, setMeal] = useState<Meal>(existing?.meal ?? params.meal ?? 'breakfast')
  const [note, setNote] = useState(existing?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
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
   * A photo taken here, before there is a row to hang it on.
   *
   * Two fields because they are needed at different moments: the local uri is
   * what the tile shows the instant the shot is taken, and the bucket key is what
   * the insert carries. An entry that already exists skips both — its photo is
   * written straight to the row, and the day query brings it back.
   */
  const [shot, setShot] = useState<{ uri: string; path: string }>()
  const [attaching, setAttaching] = useState(false)
  // Collapsed by default. Fibre, sugar and salt are the second question about a
  // dish, and for most of the catalogue the answer is "nobody recorded it".
  const [showNutrients, setShowNutrients] = useState(false)
  /**
   * Figures typed by hand, as strings while they are being typed.
   *
   * Seeded EMPTY rather than from the entry: a field showing the app's own
   * number cannot tell the user whether it is their figure or the app's, and
   * blank is the honest reading of "nothing overridden". What is on the row
   * shows through as the placeholder.
   */
  const [typed, setTyped] = useState<{ kcal: string; carbs: string; protein: string; fat: string }>(
    {
      kcal: existing?.overrides?.kcal?.toString() ?? '',
      carbs: existing?.overrides?.carbs?.toString() ?? '',
      protein: existing?.overrides?.protein?.toString() ?? '',
      fat: existing?.overrides?.fat?.toString() ?? '',
    },
  )

  const { data: heroUrl } = useMealPhotoUrl(existing?.photoPath)

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
  const hero = shot?.uri ?? heroUrl

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
  // The view does this arithmetic for saved entries; this is the same sum for
  // a portion that has not been saved yet, so the preview and the row agree.
  const macros = {
    kcal: Math.round(food.macros.kcal * factor),
    carbs: Math.round(food.macros.carbs * factor),
    protein: Math.round(food.macros.protein * factor),
    fat: Math.round(food.macros.fat * factor),
  }

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
   * An existing entry is written straight away rather than at save: the upload has
   * already happened, so holding the key in state until the save button would mean
   * an object in the bucket that a cancelled edit orphans. A row being composed
   * has nowhere to write to yet, so its key waits for the insert.
   */
  const attachPhoto = async (uri: string) => {
    setPickingIcon(false)
    setAttaching(true)
    try {
      const path = await uploadMealPhoto(userId, uri)

      if (existing) {
        updateEntry.mutate({
          id: existing.id,
          logDate: existing.logDate,
          photoPath: path,
          currentPhotoPath: existing.photoPath,
        })
      }
      // Shown either way: for an existing row it is what the tile draws until the
      // day query comes back with a signed URL for the same photo.
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
   * The upload has already happened by the time this runs, so a shot taken on the
   * add screen and then overruled here is an object nothing points at — deleted on
   * the spot. An existing row's photo is left alone: it is still what the row
   * shows, and `save` deletes it when the icon is actually written.
   */
  const applyIcon = (next: IconRef) => {
    setIcon(next)
    if (!shot) return
    const orphan = shot.path
    setShot(undefined)
    if (!existing) void removeMealPhoto(orphan).catch(() => {})
  }

  const hasPhoto = Boolean(shot ?? existing?.photoPath)

  const save = () => {
    if (existing) {
      // A blank field clears the override rather than leaving the last one
      // stored: blank is what "use the app's figure" looks like on screen, and
      // it has to mean that when saved too.
      const figure = (value: string) => {
        const trimmed = value.trim()
        if (!trimmed) return null
        const parsed = Number(trimmed)
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
      }

      updateEntry.mutate({
        id: existing.id,
        logDate: existing.logDate,
        quantity,
        servingId: chosen,
        meal,
        note: note || null,
        overrides: {
          kcal: figure(typed.kcal),
          carbs: figure(typed.carbs),
          protein: figure(typed.protein),
          fat: figure(typed.fat),
        },
        ...(icon === undefined ? {} : { icon, currentPhotoPath: existing.photoPath }),
      })
      // `fixApplied` reads "Updated from your note", which belongs to the
      // free-text correction below — it was showing for a plain quantity or
      // serving change too, crediting a note the user never wrote.
      toast.show({
        title: note ? t('logging:detail.fixApplied') : t('logging:detail.updated'),
        tone: 'success',
      })
      goBack()
      return
    }
    logFood.mutate({
      foodId: food.id,
      servingId: chosen,
      meal,
      quantity,
      note: note || undefined,
      logDate: selectedDate,
      // Only what was actually chosen. `shownIcon` would write the food's own
      // drawing onto the row as an override, which is not an override at all.
      icon,
      // And a photo taken while composing this row, which the picker offers as
      // the alternative to a drawing. Never both: taking one clears the other.
      photoPath: shot?.path,
    })
    finish()
  }

  /**
   * Send the typed correction and leave. Nothing is awaited here on purpose —
   * see the field it belongs to, below.
   */
  const applyFix = () => {
    const text = instruction.trim()
    if (!existing || !text) return
    refineEntry({ entryId: existing.id, instruction: text, logDate: selectedDate })
    finish()
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
        <View>
          <Button fullWidth onPress={save}>
            {existing ? t('common:action.save') : t('common:action.add')}
          </Button>
        </View>
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
        title={existing?.foodName ?? food.name}
        onBack={() => goBack()}
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
          hero && !icon ? 'h-[260px]' : 'h-[130px]',
          // Dashed while there is nothing in it: a solid frame around an empty
          // box reads as a picture that failed to load.
          hero || shownIcon ? 'border-line' : 'border-line border-dashed',
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
            source={{ uri: hero }}
            style={{ flex: 1, width: '100%' }}
            contentFit="cover"
            accessibilityLabel={t('logging:camera.photoOf', { food: food.name })}
          />
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

      <Card>
        <Stepper
          value={quantity}
          onChange={setQuantity}
          // Half a plate is an ordinary portion and used to be unreachable here:
          // the steps were whole servings, so "half" could only be had by picking
          // a serving that happened to be one. `Stepper` renders 1.5 as "1½".
          min={0.5}
          max={20}
          step={0.5}
          // And for the amounts halves cannot express — 0.3 of a tub — the number
          // itself is a field.
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

      <Card>
        <View className="flex-row items-baseline justify-between">
          <Text variant="displayMd">{macros.kcal.toLocaleString()}</Text>
          <Text variant="overline">{t('logging:detail.total')}</Text>
        </View>
        {targets ? <MacroBars eaten={macros} targets={targets} /> : null}

        <Divider />

        {/* Collapsed, and shown for every dish including the ones with nothing to
            report. Hiding the row when the columns are null would leave the
            question unanswered — "does this app not know, or does this dish have
            no sugar in it" — and the answer is worth one line of copy. */}
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

      {/* The numbers, typed. Only for an entry that exists: on the way IN the
          portion and the serving say the same thing more precisely, and there
          is nothing yet to attach a correction to.

          Each field stands alone and blank means "use the app's figure", so
          the placeholder is what the app currently says — a field seeded with
          that number could not tell the user whose number it was. */}
      {existing ? (
        <Card title={t('logging:detail.numbersTitle')}>
          <View className="flex-row gap-3">
            <TextField
              containerClassName="flex-1"
              label={t('logging:detail.kcalField')}
              value={typed.kcal}
              onChangeText={(value) => setTyped((current) => ({ ...current, kcal: value }))}
              placeholder={String(macros.kcal)}
              keyboardType="number-pad"
            />
            <TextField
              containerClassName="flex-1"
              label={t('logging:detail.carbsField')}
              value={typed.carbs}
              onChangeText={(value) => setTyped((current) => ({ ...current, carbs: value }))}
              placeholder={String(macros.carbs)}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-row gap-3">
            <TextField
              containerClassName="flex-1"
              label={t('logging:detail.proteinField')}
              value={typed.protein}
              onChangeText={(value) => setTyped((current) => ({ ...current, protein: value }))}
              placeholder={String(macros.protein)}
              keyboardType="decimal-pad"
            />
            <TextField
              containerClassName="flex-1"
              label={t('logging:detail.fatField')}
              value={typed.fat}
              onChangeText={(value) => setTyped((current) => ({ ...current, fat: value }))}
              placeholder={String(macros.fat)}
              keyboardType="decimal-pad"
            />
          </View>
          <Text variant="meta">{t('logging:detail.numbersNote')}</Text>
          {typed.kcal || typed.carbs || typed.protein || typed.fat ? (
            <Tappable
              onPress={() => setTyped({ kcal: '', carbs: '', protein: '', fat: '' })}
              accessibilityRole="button"
              accessibilityLabel={t('logging:detail.numbersReset')}
            >
              <Text variant="label" className="text-pandan-ink">
                {t('logging:detail.numbersReset')}
              </Text>
            </Tappable>
          ) : null}
        </Card>
      ) : null}

      {/* What the scan decided the plate was made of, each part with its own
          portion stepper. Edits go through set_ingredient_quantity, which
          recomputes the entry's quantity in the same transaction — so the
          plate total always equals the sum of parts, and the shared parent
          row's macros are never touched. */}
      {ingredients.length ? (
        <Card title={t('logging:detail.plateTitle')}>
          {ingredients.map((ingredient) => {
            // Whole steps for a counted part, quarters for a measured one.
            // Eight satay skewers step to seven, not to 7.75 — the row says
            // "× 8" because the scan counted eight of them, and a quarter of a
            // skewer is not a thing anyone put on a plate. A part already
            // sitting at a fraction keeps quarter steps so it can be walked
            // back to a whole number.
            const size =
              Number.isInteger(ingredient.quantity) && ingredient.quantity >= 1 ? 1 : 0.25
            // At the smallest portion the minus takes the whole thing off the
            // plate. A quarter of a thing and "there wasn't any" are different
            // answers, and only one of them was reachable — the stepper simply
            // stopped, with nothing to say the row could go.
            const atFloor = ingredient.quantity <= 0.25
            const step = (direction: 1 | -1) => {
              if (direction === -1 && atFloor) {
                removeIngredient.mutate({
                  ingredientId: ingredient.id,
                  entryId: existing?.id ?? '',
                  logDate: selectedDate,
                })
                return
              }
              const next = Math.min(10, Math.max(0.25, ingredient.quantity + direction * size))
              if (next === ingredient.quantity) return
              updateIngredient.mutate({
                ingredientId: ingredient.id,
                quantity: next,
                entryId: existing?.id ?? '',
                logDate: selectedDate,
              })
            }
            return (
              <View key={ingredient.id} className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text variant="body" numberOfLines={1}>
                    {ingredient.name}
                  </Text>
                  {/* The multiplier alone. The catalogue's own serving label
                      belongs to whatever row the part matched — "1 medium
                      paper (8-5/8" dia)" for a spoon of rice — and printing it
                      here described the import rather than the plate. How many
                      of it there are is the only part of that the user is
                      changing, and the calories beside it say the rest. */}
                  {ingredient.quantity !== 1 ? (
                    <Text variant="meta">
                      {t('logging:detail.times', { amount: ingredient.quantity })}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="w-[72px] flex-row items-baseline justify-end gap-1">
                    <Text variant="numeric">{ingredient.kcal.toLocaleString()}</Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
                  {/* Only the range disables them. Disabling every button on
                      every row while a write was in flight made one tap blink
                      the whole card grey and back — and there was nothing to
                      wait for: the list updates optimistically, and the
                      database clamps the range it accepts anyway. */}
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
                {ingredients.reduce((sum, item) => sum + item.kcal, 0).toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* Correcting a dish by describing it belongs to an entry that already
          exists: "no sambal" is a fix to something logged, and on the way IN the
          serving chips and the stepper above say the same thing more precisely. */}
      {existing?.scanId ? (
        // A scanned entry: the box APPLIES the correction. The chips come from
        // the vision model — what people most often vary about this exact dish
        // — and the text goes to scan-refine, which rescales the quantity or
        // re-resolves the food through the same cascade the scan used.
        <Card>
          <View className="flex-row items-center gap-2">
            <Icon set="system" name="sparkle" size={20} />
            <Text variant="caption" className="text-pandan-ink">
              {t('logging:detail.fixTitle')}
            </Text>
          </View>

          {/* A message box, not a form: the send button lives in the field and
              the keyboard's return key does the same thing. The correction runs
              for several seconds on the server and this screen describes the
              entry's OLD identity the whole time — so it fires and leaves, and
              the wait happens on Today where the row shows the work and then
              becomes its corrected self. */}
          <TextField
            value={instruction}
            onChangeText={setInstruction}
            placeholder={t('logging:detail.fixPlaceholder')}
            returnKeyType="send"
            onSubmitEditing={applyFix}
            // Less room on the right than the field's own padding: the button
            // is the edge now, and five points of gutter past it reads as a
            // control that missed its corner.
            className="pr-2"
            rightSlot={
              <IconButton
                size="sm"
                variant="primary"
                className="self-center"
                accessibilityLabel={t('logging:detail.fixSend')}
                disabled={!instruction.trim()}
                onPress={applyFix}
              >
                <Icon set="ui" name="arrow-up" size={20} tintColor={colors.onPandan} />
              </IconButton>
            }
          />

          {existing.suggestedEdits?.length ? (
            <View className="flex-row flex-wrap gap-2">
              {existing.suggestedEdits.map((edit) => (
                <Chip
                  key={edit}
                  selected={instruction === edit}
                  onPress={() => setInstruction(edit)}
                >
                  {edit}
                </Chip>
              ))}
            </View>
          ) : null}
        </Card>
      ) : existing ? (
        // A hand-logged entry keeps the note box: the text is saved on the row,
        // and the chips are generic fillers.
        <Card>
          <View className="flex-row items-center gap-2">
            <Icon set="system" name="sparkle" size={20} />
            <Text variant="caption" className="text-pandan-ink">
              {t('logging:detail.fixTitle')}
            </Text>
          </View>

          <TextField
            value={note}
            onChangeText={setNote}
            placeholder={t('logging:detail.fixPlaceholder')}
            returnKeyType="done"
          />

          <View className="flex-row flex-wrap gap-2">
            {QUICK_FIXES.map((fix) => (
              <Chip
                key={fix}
                selected={note === t(`logging:detail.quickFix.${fix}`)}
                onPress={() => {
                  const label = t(`logging:detail.quickFix.${fix}`)
                  setNote(label)
                  // "Half portion" is not just a note, it is a serving. Applying
                  // it silently as text would leave the calories wrong.
                  if (fix === 'halfPortion') {
                    const half = food.servings.find((option) => option.factor === 0.5)
                    if (half) setServingId(half.id)
                  }
                }}
              >
                {t(`logging:detail.quickFix.${fix}`)}
              </Chip>
            ))}
          </View>
        </Card>
      ) : null}

      <Card title={t('logging:detail.mealLabel')}>
        <SegmentedControl
          options={MEALS.map((option) => ({ value: option, label: t(`common:meal.${option}`) }))}
          value={meal}
          onChange={setMeal}
          accessibilityLabel={t('logging:detail.mealLabel')}
        />
      </Card>

      <ConfirmSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title={t('logging:detail.deleteTitle')}
        description={t('logging:detail.deleteBody')}
        confirmLabel={t('common:action.delete')}
        tone="danger"
      />
    </Screen>
  )
}
