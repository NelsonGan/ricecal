import { useKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, View } from 'react-native'

import { useRecipe, useRecipeIngredients } from '@/data'
import {
  IngredientChecklist,
  ingredientsInStep,
  LogRecipeSheet,
  splitSteps,
  useCookStep,
  useRecipeLogDate,
  useTickedIngredients,
} from '@/features/recipes'
import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Sheet,
  Skeleton,
  StepProgress,
  Tappable,
  Text,
} from '@/ui'

/**
 * Cook mode: the method one step at a time, large enough to read from a step
 * away with the phone propped against the tiles, and the screen kept awake so
 * it does not lock between stirring and the next instruction.
 *
 * Under each step, the ingredients it names at tonight's amounts (the detail
 * screen passes how many it is being cooked for), and the whole list one tap
 * away. Tapping the step moves on as the Next button does. Where the cook is
 * survives leaving and coming back (`useCookStep`). The last step asks how
 * much was eaten, which is the moment the meal actually happens.
 */
export default function CookModeScreen() {
  useKeepAwake('recipe-cook')
  const { t } = useTranslation(['recipes', 'common'])
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string; servings?: string; date?: string }>()
  const goBack = useBack(params.id ? `/recipe/${params.id}` : '/recipes')
  const { logDate, isToday } = useRecipeLogDate(params.date)

  const { data: recipe, isPending } = useRecipe(params.id)
  const { data: ingredients = [] } = useRecipeIngredients(params.id)

  const [savedIndex, setIndex] = useCookStep(params.id ?? '')
  const [finished, setFinished] = useState(false)
  const [logging, setLogging] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
  const [ticked, toggleTick] = useTickedIngredients(params.id ?? '')

  const steps = splitSteps(recipe?.steps ?? '')
  // Clamped once, here: the remembered step can be past the end of a method
  // that has been edited shorter since, and every reading below uses this one.
  const index = Math.min(savedIndex, Math.max(0, steps.length - 1))
  const step = steps[index] ?? ''

  // VoiceOver does not read a live region on iOS, so a new step is announced.
  // Not on arrival, where the header already says where the cook is.
  const announced = useRef<string | null>(null)
  useEffect(() => {
    if (!step) return
    if (announced.current !== null && announced.current !== step) {
      AccessibilityInfo.announceForAccessibility(step)
    }
    announced.current = step
  }, [step])

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

  const last = index >= steps.length - 1
  const needed = ingredientsInStep(step, ingredients)
  const priced = recipe.ingredientCount > 0
  const advance = () => {
    if (last) {
      // Done with this pot: the next visit starts at the top.
      setIndex(0)
      setFinished(true)
    } else setIndex(index + 1)
  }

  if (finished) {
    return (
      <Screen
        header={header}
        // `goBack` rather than `router.back()`: cook mode can be the first
        // screen in the stack (a link, or a cold start restoring the route),
        // where a GO_BACK has nowhere to go.
        footer={
          priced ? (
            <View className="flex-row gap-2.5">
              <Button className="flex-1" variant="secondary" onPress={() => goBack()}>
                {t('recipes:cook.finishedSkip')}
              </Button>
              <Button className="flex-1" onPress={() => setLogging(true)}>
                {isToday ? t('recipes:detail.addToDay') : t('common:action.add')}
              </Button>
            </View>
          ) : recipe.isMine ? (
            // Nothing in the pot to log yet, so the thing to do is fill it in.
            <Button
              fullWidth
              onPress={() =>
                router.replace({ pathname: '/recipe/edit', params: { id: recipe.id } })
              }
            >
              {t('recipes:edit.addIngredient')}
            </Button>
          ) : (
            <Button fullWidth onPress={() => goBack()}>
              {t('recipes:cook.done')}
            </Button>
          )
        }
      >
        <EmptyState
          title={t('recipes:cook.finishedTitle')}
          description={priced ? t('recipes:cook.finishedBody') : undefined}
          icon={recipe.icon ?? { set: 'food', name: 'cooking-pot' }}
        />
        {/* How much of it was eaten, asked rather than assumed to be one. */}
        <LogRecipeSheet
          visible={logging}
          onClose={() => setLogging(false)}
          recipe={recipe}
          logDate={logDate}
          isToday={isToday}
          onLogged={() => goBack()}
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
            onPress={() => setIndex(index - 1)}
          >
            {t('recipes:cook.back')}
          </Button>
          <Button className="flex-1" onPress={advance}>
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

      {/* The one big thing on the screen, read from across the kitchen, and
          the biggest target on it: a knuckle anywhere on the step moves on,
          for hands that are not clean enough for the button. */}
      <Tappable
        className="gap-3"
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={`${caption}. ${step}`}
        accessibilityHint={last ? t('recipes:cook.done') : t('recipes:cook.next')}
      >
        <Text variant="overline">{caption}</Text>
        <Text variant="displayMd">{step}</Text>
      </Tappable>

      {needed.length > 0 ? (
        <Card title={t('recipes:cook.youNeed')}>
          <IngredientChecklist
            ingredients={needed}
            servings={recipe.servings}
            cooking={cooking}
            ticked={ticked}
            onToggle={toggleTick}
          />
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
