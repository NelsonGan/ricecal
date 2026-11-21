import { useKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { useLogFood, useRecipe, useRecipeIngredients, useSelectedDate } from '@/data'
import {
  IngredientChecklist,
  ingredientsInStep,
  recipeLog,
  scaleIngredient,
  splitSteps,
  useIngredientMeasure,
  useTickedIngredients,
} from '@/features/recipes'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Sheet,
  Skeleton,
  StepProgress,
  Text,
  useToast,
} from '@/ui'

/**
 * Cook mode: the method one step at a time, large enough to read from a step
 * away with the phone propped against the tiles, and the screen kept awake so
 * it does not lock between stirring and the next instruction.
 *
 * Under each step, the ingredients it names at tonight's amounts (the detail
 * screen passes how many it is being cooked for), and the whole list one tap
 * away. The last step offers to log a serving, which is the moment the meal
 * actually happens.
 */
export default function CookModeScreen() {
  useKeepAwake('recipe-cook')
  const { t } = useTranslation(['recipes', 'common'])
  const toast = useToast()
  const params = useLocalSearchParams<{ id: string; servings?: string }>()
  const goBack = useBack(params.id ? `/recipe/${params.id}` : '/recipes')
  const measure = useIngredientMeasure()

  const { data: recipe, isPending } = useRecipe(params.id)
  const { data: ingredients = [] } = useRecipeIngredients(params.id)
  const { selectedDate } = useSelectedDate()
  const logFood = useLogFood()

  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
  const [ticked, toggleTick] = useTickedIngredients(params.id ?? '')

  const header = (
    <AppBar
      title={recipe?.name ?? ''}
      leading="dismiss"
      onBack={() => goBack()}
      backLabel={t('recipes:cook.close')}
      action={
        ingredients.length > 0 ? (
          <IconButton
            size="sm"
            variant="neutral"
            accessibilityLabel={t('recipes:cook.ingredients')}
            onPress={() => setShowIngredients(true)}
          >
            <Icon set="ui" name="checklist" size={22} />
          </IconButton>
        ) : undefined
      }
    />
  )

  if (isPending) {
    return (
      <Screen header={header}>
        <Skeleton className="h-[12px] w-full" />
        <Skeleton className="h-[160px] w-full" />
      </Screen>
    )
  }

  if (!recipe) {
    return (
      <Screen header={header}>
        <EmptyState
          title={t('recipes:detail.goneTitle')}
          description={t('recipes:detail.goneBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      </Screen>
    )
  }

  const steps = splitSteps(recipe.steps ?? '')
  const requested = Number(params.servings)
  const cooking = Number.isFinite(requested) && requested > 0 ? requested : recipe.servings

  if (steps.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState
          title={t('recipes:detail.noSteps')}
          icon={{ set: 'food', name: 'cooking-pot' }}
        />
        <Text variant="body" className="text-center text-muted">
          {t('recipes:cook.noSteps')}
        </Text>
      </Screen>
    )
  }

  const step = steps[Math.min(index, steps.length - 1)] ?? ''
  const last = index >= steps.length - 1
  const needed = ingredientsInStep(step, ingredients)

  // `goBack` rather than `router.back()`: cook mode can be the first screen in
  // the stack (a link, or a cold start restoring the route), and a GO_BACK with
  // no history would leave the cook on this page with a log button that logs
  // again on every tap.
  const logServing = () => {
    logFood.mutate(recipeLog(recipe, 1, selectedDate))
    toast.show({ title: t('recipes:detail.added'), tone: 'success' })
    goBack()
  }

  if (finished) {
    return (
      <Screen
        header={header}
        footer={
          <View className="flex-row gap-2.5">
            <Button className="flex-1" variant="secondary" onPress={() => goBack()}>
              {t('recipes:cook.finishedSkip')}
            </Button>
            <Button className="flex-1" loading={logFood.isPending} onPress={logServing}>
              {t('recipes:detail.addToDay')}
            </Button>
          </View>
        }
      >
        <EmptyState
          title={t('recipes:cook.finishedTitle')}
          description={t('recipes:cook.finishedBody')}
          icon={recipe.icon ?? { set: 'food', name: 'cooking-pot' }}
        />
      </Screen>
    )
  }

  const caption = t('recipes:cook.step', { count: index + 1, total: steps.length })

  return (
    <Screen
      header={header}
      footer={
        <View className="flex-row gap-2.5">
          <Button
            className="flex-1"
            variant="secondary"
            disabled={index === 0}
            onPress={() => setIndex((current) => Math.max(0, current - 1))}
          >
            {t('recipes:cook.back')}
          </Button>
          <Button
            className="flex-1"
            onPress={() => (last ? setFinished(true) : setIndex((current) => current + 1))}
          >
            {last ? t('recipes:cook.done') : t('recipes:cook.next')}
          </Button>
        </View>
      }
    >
      {/* Segments while each one is still wide enough to count, a bar past
          that: twelve slivers say "a lot" and nothing about where you are. */}
      <StepProgress
        total={steps.length}
        current={index + 1}
        variant={steps.length > 8 ? 'bar' : 'segments'}
        accessibilityLabel={caption}
      />

      <View className="gap-3">
        <Text variant="overline">{caption}</Text>
        {/* The one big thing on the screen, read from across the kitchen. */}
        <Text variant="displayMd" accessibilityRole="header" accessibilityLiveRegion="polite">
          {step}
        </Text>
      </View>

      {needed.length > 0 ? (
        <Card title={t('recipes:cook.youNeed')}>
          {needed.map((item, row) => (
            <View key={item.id}>
              {row > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-3 py-2.5">
                <Text variant="bodyStrong" className="min-w-0 flex-1" numberOfLines={2}>
                  {item.name}
                </Text>
                <Text variant="meta">
                  {measure(scaleIngredient(item, recipe.servings, cooking))}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Sheet
        visible={showIngredients}
        onClose={() => setShowIngredients(false)}
        title={t('recipes:cook.ingredients')}
        closeLabel={t('common:action.close')}
      >
        <IngredientChecklist
          ingredients={ingredients}
          servings={recipe.servings}
          cooking={cooking}
          ticked={ticked}
          onToggle={toggleTick}
        />
      </Sheet>
    </Screen>
  )
}
