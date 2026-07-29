import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useLogFood } from '@/features/logging'
import { MacroBars } from '@/features/shared'
import { useBack, useDismissTo } from '@/lib/navigation'
import {
  entryMacros,
  findFood,
  getServing,
  MEALS,
  type Meal,
  useAppState,
  useDispatch,
  useStore,
} from '@/mock'
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
  const dispatch = useDispatch()
  const toast = useToast()
  const logFood = useLogFood()
  const { state } = useStore()
  const targets = useAppState((s) => s.targets)

  const params = useLocalSearchParams<{ id: string; entryId?: string; meal?: Meal }>()
  const food = findFood(params.id)

  const existing = params.entryId
    ? Object.values(state.days)
        .flatMap((day) => day.entries)
        .find((entry) => entry.id === params.entryId)
    : undefined

  const [quantity, setQuantity] = useState(existing?.quantity ?? 1)
  const [servingId, setServingId] = useState(existing?.servingId ?? food?.servings[0].id ?? '')
  const [meal, setMeal] = useState<Meal>(existing?.meal ?? params.meal ?? 'breakfast')
  const [note, setNote] = useState(existing?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!food) {
    return (
      <Screen>
        <AppBar title={t('logging:search.emptyTitle')} onBack={() => goBack()} />
      </Screen>
    )
  }

  const serving = getServing(food, servingId)
  const macros = entryMacros({
    id: 'preview',
    foodId: food.id,
    meal,
    quantity,
    servingId,
    loggedAt: new Date().toISOString(),
  })

  const save = () => {
    if (existing) {
      dispatch({
        type: 'updateEntry',
        id: existing.id,
        patch: { quantity, servingId, meal, note: note || undefined },
      })
      toast.show({ title: t('logging:detail.fixApplied'), tone: 'success' })
      goBack()
      return
    }
    logFood({ food, meal, quantity, servingId, note: note || undefined })
    finish()
  }

  const remove = () => {
    if (existing) dispatch({ type: 'removeEntry', id: existing.id })
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
      <AppBar title={food.name} onBack={() => goBack()} />

      <View className="h-[130px] items-center justify-center rounded-card border-[3px] border-line bg-track">
        <Icon {...food.icon} size={100} />
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
              selected={option.id === servingId}
              onPress={() => setServingId(option.id)}
            >
              {option.label}
            </Chip>
          ))}
        </View>
      </Card>

      <Card>
        <View className="flex-row items-baseline justify-between">
          <Text className="font-display text-[32px] leading-[39px] text-heading">
            {macros.kcal.toLocaleString()}
          </Text>
          <Text variant="overline">{t('logging:detail.total')}</Text>
        </View>
        <MacroBars eaten={macros} targets={targets} />
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
