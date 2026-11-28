import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccessibilityInfo, View } from 'react-native'

import { removeMealPhoto, uploadMealPhoto, useRecipe, useRecipeIngredients } from '@/data'
import { InlineCamera } from '@/features/logging'
import {
  CookedPhotoTile,
  cookingSteps,
  forgetCookSession,
  IngredientChecklist,
  ingredientsInStep,
  LogRecipeSheet,
  localiseIngredients,
  localiseRecipe,
  useCookStep,
  useRecipeLanguage,
  useRecipeLogDate,
  useTickedIngredients,
} from '@/features/recipes'
import { useScreenAwake } from '@/lib/keep-awake'
import { useBack, useCloseStack } from '@/lib/navigation'
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
  useToast,
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
 * much was eaten, which is the moment the meal actually happens, and offers to
 * photograph the plate so the diary shows what was cooked, not a drawing.
 */
export default function CookModeScreen() {
  useScreenAwake('recipe-cook')
  const { t } = useTranslation(['recipes', 'common', 'logging'])
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string; servings?: string; date?: string }>()
  const goBack = useBack(params.id ? `/recipe/${params.id}` : '/recipes')
  const closeRecipe = useCloseStack('/recipes')
  const { logDate, isToday } = useRecipeLogDate(params.date)

  const { data: stored, isPending } = useRecipe(params.id)
  const { data: storedIngredients = [] } = useRecipeIngredients(params.id)
  // In whichever language the recipe page was showing.
  const language = useRecipeLanguage(stored)
  const shown = language.english ? undefined : language.translation
  const recipe = localiseRecipe(stored, shown)
  const ingredients = localiseIngredients(storedIngredients, shown)

  // The session is the recipe's row, as on the recipe page: opened from a
  // shared link, the route's id is the slug, and the ticks made there would
  // be under another key.
  const session = stored?.id ?? params.id ?? ''
  const [savedIndex, setIndex] = useCookStep(session)
  const [finished, setFinished] = useState(false)
  const [logging, setLogging] = useState(false)
  const [showIngredients, setShowIngredients] = useState(false)
  const [ticked, toggleTick] = useTickedIngredients(session)
  const toast = useToast()
  const [snapping, setSnapping] = useState(false)
  const [attaching, setAttaching] = useState(false)
  /** The plate, once photographed and uploaded: the local file and its key. */
  const [shot, setShot] = useState<{ uri: string; path: string } | undefined>()
  /**
   * The key this screen is responsible for deleting, if the cook leaves
   * without logging. Cleared once Add is tapped: from then a row points at
   * it, and a write that then fails leaves an object nothing reads, which
   * costs storage. Deleting it could leave a row pointing at nothing.
   */
  const orphan = useRef<string | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (orphan.current) void removeMealPhoto(orphan.current).catch(() => {})
    }
  }, [])

  /**
   * The shot, uploaded the moment it is taken, since that is the slow part and
   * the cook is reading the screen meanwhile. A retake replaces the earlier
   * object, which nothing else points at.
   */
  const attachPhoto = async (uri: string) => {
    setSnapping(false)
    setAttaching(true)
    try {
      const path = await uploadMealPhoto(uri)
      // Closed while it was sending: nothing will log or sweep it.
      if (!mounted.current) {
        void removeMealPhoto(path).catch(() => {})
        return
      }
      if (orphan.current) void removeMealPhoto(orphan.current).catch(() => {})
      orphan.current = path
      setShot({ uri, path })
    } catch {
      // Not once the screen is gone: the toast would land on whatever is next.
      if (mounted.current) toast.show({ title: t('logging:detail.photoFailed'), tone: 'error' })
    } finally {
      if (mounted.current) setAttaching(false)
    }
  }

  const pages = cookingSteps(stored?.steps, language.translation?.steps, !language.english)
  const steps = pages.map((page) => page.text)
  // Clamped once, here: the remembered step can be past the end of a method
  // that has been edited shorter since, and every reading below uses this one.
  const index = Math.min(savedIndex, Math.max(0, steps.length - 1))
  const step = steps[index] ?? ''

  // VoiceOver does not read a live region on iOS, so a new step is announced.
  // Tracked by index rather than text so identical consecutive steps still
  // announce. Not on arrival, where the header already says where the cook is.
  const announced = useRef<number | null>(null)
  useEffect(() => {
    // Finishing resets the step to the first, which is not a step to read out.
    if (!step || finished) return
    if (announced.current !== null && announced.current !== index) {
      AccessibilityInfo.announceForAccessibility(step)
    }
    announced.current = index
  }, [index, step, finished])

  const showChecklist =
    ingredients.length > 0 && !isPending && Boolean(recipe) && steps.length > 0 && !finished

  const header = (
    <AppBar
      title={recipe?.name ?? ''}
      leading="dismiss"
      onBack={() => goBack()}
      backLabel={t('recipes:cook.close')}
      action={
        showChecklist ? (
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
          description={recipe.isMine ? t('recipes:cook.noSteps') : undefined}
          icon={{ set: 'food', name: 'cooking-pot' }}
        />
      </Screen>
    )
  }

  const last = index >= steps.length - 1
  // Found in the English step by the English names, then shown translated:
  // the words of a Chinese or Thai step have no spaces between them to find.
  const named = new Set(
    ingredientsInStep(pages[index]?.english ?? step, storedIngredients).map((item) => item.id),
  )
  const needed = ingredients.filter((item) => named.has(item.id))
  const priced = recipe.ingredientCount > 0
  const advance = () => {
    if (last) {
      // Done with this pot: the next visit starts at the top, unticked.
      forgetCookSession(session)
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
              {/* Held while the plate uploads: logged now, the row would go
                  without the photo and the upload would then be deleted. */}
              <Button className="flex-1" loading={attaching} onPress={() => setLogging(true)}>
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
        {priced ? (
          // Something to log, so something to photograph: the plate goes on
          // the diary row instead of the recipe's drawing.
          <View className="items-center gap-6 pt-8">
            <CookedPhotoTile
              icon={recipe.icon}
              photoUri={shot?.uri}
              attaching={attaching}
              onPress={() => setSnapping(true)}
            />
            <View className="items-center gap-2 px-gutter">
              <Text variant="title" className="text-center">
                {t('recipes:cook.finishedTitle')}
              </Text>
              <Text variant="body" className="text-center">
                {shot ? t('recipes:cook.finishedBody') : t('recipes:cook.finishedPhoto')}
              </Text>
            </View>
          </View>
        ) : (
          <EmptyState
            title={t('recipes:cook.finishedTitle')}
            icon={recipe.icon ?? { set: 'food', name: 'cooking-pot' }}
          />
        )}
        <Sheet
          visible={snapping}
          onClose={() => setSnapping(false)}
          title={t('recipes:cook.photoTitle')}
          closeLabel={t('common:action.close')}
          // Full height with the viewfinder filling it, as every camera in the
          // app is. The library button inside it covers a photo taken already.
          fullHeight
          fillBody
          scrollable={false}
        >
          {/* No uri is a device with no camera, every simulator: nothing to attach. */}
          <InlineCamera
            fill
            onCapture={(photoUri) => {
              if (photoUri) void attachPhoto(photoUri)
            }}
          />
        </Sheet>
        {/* How much of it was eaten, asked rather than assumed to be one. */}
        <LogRecipeSheet
          visible={logging}
          onClose={() => setLogging(false)}
          recipe={recipe}
          logDate={logDate}
          isToday={isToday}
          // From the log sheet (it passes its day), back to it, as the recipe
          // page does; otherwise back to the recipe.
          // Past the recipe page too, to the search with its query and meal
          // intact. `dismissTo('/log/search')` replaced its params with none.
          onLogged={() => (params.date ? closeRecipe() : goBack())}
          photoPath={shot?.path}
          onSubmit={() => {
            orphan.current = undefined
          }}
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
