import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  type IconRef,
  MEALS,
  type Meal,
  useDayLog,
  useFood,
  useLogFood,
  useMealPhotoUrl,
  useRemoveEntry,
  useSelectedDate,
  useTargets,
  useUpdateEntry,
} from '@/data'
import { IconPicker } from '@/features/logging'
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  cn,
  Divider,
  Icon,
  Screen,
  SegmentedControl,
  Stepper,
  Tappable,
  Text,
  TextField,
  useToast,
} from '@/ui'

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
  const toast = useToast()
  const logFood = useLogFood()
  const updateEntry = useUpdateEntry()
  const removeEntry = useRemoveEntry()
  const { data: targets } = useTargets()
  const { selectedDate } = useSelectedDate()

  const params = useLocalSearchParams<{ id: string; entryId?: string; meal?: Meal }>()
  const { data: food, isPending } = useFood(params.id)

  // The entry being edited, if this screen was opened from a row. It is on the
  // day in view — the only day whose entries are loaded — which is also the
  // only day a row can be tapped from.
  const day = useDayLog(selectedDate)
  const existing = params.entryId
    ? day.entries.find((entry) => entry.id === params.entryId)
    : undefined

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
  const [confirmReplacePhoto, setConfirmReplacePhoto] = useState(false)
  // Collapsed by default. Fibre, sugar and salt are the second question about a
  // dish, and for most of the catalogue the answer is "nobody recorded it".
  const [showNutrients, setShowNutrients] = useState(false)

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

  // The photo of this plate if there is one, otherwise the dish's own picture.
  // An entry logged from a snap is about that plate, not about the catalogue.
  const hero = heroUrl

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

  const save = () => {
    if (existing) {
      updateEntry.mutate({
        id: existing.id,
        logDate: existing.logDate,
        quantity,
        servingId: chosen,
        meal,
        note: note || null,
        ...(icon === undefined ? {} : { icon, photoPath: existing.photoPath }),
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
    })
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
      <AppBar title={food.name} onBack={() => goBack()} backLabel={t('common:a11y.back')} />

      {/* Always live, including before the entry exists. Most of the catalogue
          has no drawing, so a dish being added from the list arrives blank — and
          picking one then is the natural moment, not after saving and coming back.

          A photo opens the picker too, but by way of a confirmation: choosing a
          drawing throws the photo of the real plate away, and the row cannot hold
          both. That is not something to discover after the fact. */}
      <Tappable
        className={cn(
          'h-[130px] items-center justify-center overflow-hidden rounded-card border-[3px] bg-track',
          // Dashed while there is nothing in it: a solid frame around an empty
          // box reads as a picture that failed to load.
          hero || shownIcon ? 'border-line' : 'border-line border-dashed',
        )}
        onPress={() => (hero ? setConfirmReplacePhoto(true) : setPickingIcon(true))}
        accessibilityRole="button"
        accessibilityLabel={
          hero ? t('logging:detail.replacePhoto') : t('logging:detail.choosePicture')
        }
      >
        {hero && !icon ? (
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
        onSelect={setIcon}
      />

      {/* Only an existing entry can have a photo to lose. */}
      {existing ? (
        <ConfirmSheet
          visible={confirmReplacePhoto}
          onClose={() => setConfirmReplacePhoto(false)}
          onConfirm={() => {
            setConfirmReplacePhoto(false)
            setPickingIcon(true)
          }}
          title={t('logging:detail.replacePhotoTitle')}
          description={t('logging:detail.replacePhotoBody')}
          confirmLabel={t('logging:detail.replacePhotoConfirm')}
          tone="danger"
        />
      ) : null}

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
          unit={serving.label}
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

      {/* Correcting a dish by describing it belongs to an entry that already
          exists: "no sambal" is a fix to something logged, and on the way IN the
          serving chips and the stepper above say the same thing more precisely.
          It also credits a note on save, which would be a lie about a row being
          created for the first time. */}
      {existing ? (
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

      {existing ? (
        <Card>
          <Button
            variant="ghost"
            fullWidth
            contentClassName="justify-start"
            leftIcon={<Icon set="ui" name="delete" size={22} />}
            labelClassName="text-hibiscus-ink"
            onPress={() => setConfirmDelete(true)}
          >
            {t('logging:detail.deleteEntry')}
          </Button>
        </Card>
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
    </Screen>
  )
}
