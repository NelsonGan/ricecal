import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
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
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  Icon,
  Screen,
  SegmentedControl,
  Stepper,
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
  // Logging can be three modals deep. Finishing returns to the day, not to
  // the picker the user opened two steps ago.
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

  const { data: heroUrl } = useMealPhotoUrl(existing?.photoPath)

  if (!food) {
    return (
      <Screen>
        <AppBar
          title={isPending ? '' : t('logging:search.emptyTitle')}
          onBack={() => goBack()}
          backLabel={t('common:a11y.close')}
          leading="dismiss"
        />
      </Screen>
    )
  }

  // The photo of this plate if there is one, otherwise the dish's own picture.
  // An entry logged from a snap is about that plate, not about the catalogue.
  const hero = heroUrl

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

  const save = () => {
    if (existing) {
      updateEntry.mutate({
        id: existing.id,
        logDate: existing.logDate,
        quantity,
        servingId: chosen,
        meal,
        note: note || null,
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
            {existing ? t('common:action.save') : t('logging:detail.addToDiary')}
          </Button>
        </View>
      }
    >
      {/* A cross, not a chevron: this arrives as a modal over whatever
          opened it — search, the diary, a quick-add — so there is no single
          screen "up" from here. */}
      <AppBar
        title={food.name}
        onBack={() => goBack()}
        backLabel={t('common:a11y.close')}
        leading="dismiss"
      />

      <View className="h-[130px] items-center justify-center overflow-hidden rounded-card border-[3px] border-line bg-track">
        {hero ? (
          <Image
            source={{ uri: hero }}
            style={{ flex: 1, width: '100%' }}
            contentFit="cover"
            accessibilityLabel={t('logging:camera.photoOf', { food: food.name })}
          />
        ) : (
          <Icon {...food.icon} size={100} />
        )}
      </View>

      <Card>
        <Stepper
          value={quantity}
          onChange={setQuantity}
          min={1}
          max={20}
          step={1}
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
      </Card>

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
