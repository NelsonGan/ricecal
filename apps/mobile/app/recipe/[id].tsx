import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  REPORT_REASONS,
  type ReportReason,
  storedImageSource,
  useBlockAuthor,
  useDeleteRecipe,
  useFavouriteRecipe,
  useLogFood,
  useMealPhotoUrl,
  useRecipe,
  useRecipeIngredients,
  useReportRecipe,
  useSelectedDate,
} from '@/data'
import {
  IngredientChecklist,
  RecipeStats,
  RecipeSteps,
  recipeLog,
  ShareSheet,
  sourceHost,
  useCopyRecipe,
  useTickedIngredients,
} from '@/features/recipes'
import { MealPhoto } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { energyShare } from '@/lib/nutrition'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Aside,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  cn,
  EmptyState,
  Icon,
  IconButton,
  MacroBar,
  Screen,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stepper,
  Tappable,
  Text,
  useToast,
} from '@/ui'

type Section = 'ingredients' | 'method'

/**
 * One recipe, and what you can do with it: read it, cook it, log it.
 *
 * The page is laid out in the order a cook uses it. The picture and the name,
 * then the overview that decides whether it is tonight's dinner (prep, cook,
 * servings, what a serving costs), then the ingredients at tonight's amounts or
 * the method, one tab each, since nobody reads both at once. The footer holds
 * the two things somebody came here to do: start cooking, or add it to the day.
 *
 * Your own can be starred, edited, shared and deleted. Somebody else's can be
 * logged and cooked too, and kept as a copy of your own to change.
 *
 * Logging somebody else's used to be impossible, and the reason was real at the
 * time: a logged entry referenced the recipe's mirror catalogue row, so editing
 * a recipe repriced every entry that ever pointed at it. The mirror went with
 * the catalogue. An entry is a snapshot now, so a community dish costs the
 * reader exactly what it said it cost on the day they ate it.
 */
export default function RecipeDetailScreen() {
  const { t } = useTranslation(['recipes', 'common'])
  const router = useRouter()
  const goBack = useBack('/recipes')
  const toast = useToast()
  const colors = useThemeColors()

  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: recipe, isPending } = useRecipe(id)
  const { data: ingredients = [] } = useRecipeIngredients(id)

  const { selectedDate } = useSelectedDate()
  const logFood = useLogFood()
  const favourite = useFavouriteRecipe()
  const { copy: copyRecipe, busy: copying } = useCopyRecipe()
  const remove = useDeleteRecipe()
  const report = useReportRecipe()
  const block = useBlockAuthor()

  const [section, setSection] = useState<Section>('ingredients')
  /**
   * How many the pot is being cooked for tonight. Null follows the recipe's own
   * servings, so it is right before the recipe has loaded and after an edit.
   */
  const [cookingFor, setCookingFor] = useState<number | null>(null)
  /** Ingredients already in the pot. This visit only; see `IngredientChecklist`. */
  const [ticked, toggleTick] = useTickedIngredients(id ?? '')
  /**
   * How many servings are being logged. The chips in the log sheet are
   * shortcuts to values of it.
   */
  const [quantity, setQuantity] = useState(1)
  const [logging, setLogging] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reporting, setReporting] = useState(false)
  // What the menu's button opens, held until the menu's own window is gone.
  // iOS will not present a modal while another is still dismissing, so opening
  // the delete or share sheet in the same tap left it unshown.
  const afterMenu = useRef<(() => void) | null>(null)

  // Internal navigation carries the row id. A link carries the bearer slug,
  // which the photo signer needs as well as the recipe queries.
  const sharedSlug = recipe && recipe.id !== id ? id : undefined
  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(
    recipe?.photoPath,
    sharedSlug,
  )
  const photo = storedImageSource(recipe?.photoPath, photoUrl)

  /**
   * Whether this recipe has an author who could be reported or blocked. Somebody
   * else's, and with a cook on it to name.
   */
  const reportable = Boolean(recipe && !recipe.isMine && recipe.ownerId)

  /**
   * Both of these leave the screen, because the recipe they were about is no
   * longer visible to this account: the restrictive read policy takes effect on
   * the next fetch, and staying here would leave the reader looking at the thing
   * they just asked never to see again while the query behind it 404s.
   */
  const submitReport = async (reason: ReportReason) => {
    if (!recipe) return
    setReporting(false)
    try {
      await report.mutateAsync({ recipeId: recipe.id, reason })
      toast.show({ title: t('recipes:report.done') })
      router.replace('/recipes')
    } catch {
      toast.show({ title: t('recipes:report.failed'), tone: 'error' })
    }
  }

  const blockCook = async () => {
    if (!recipe) return
    setReporting(false)
    try {
      await block.mutateAsync(recipe.ownerId)
      toast.show({ title: t('recipes:report.blocked') })
      router.replace('/recipes')
    } catch {
      toast.show({ title: t('recipes:report.failed'), tone: 'error' })
    }
  }

  if (isPending) {
    return (
      <Screen
        header={<AppBar title="" onBack={() => goBack()} backLabel={t('common:a11y.back')} />}
      >
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[32px] w-2/3" />
        <Skeleton className="h-[64px] w-full" />
      </Screen>
    )
  }

  // Resolved, and there is nothing there. Distinct from still loading, and the
  // distinction matters most on the path this screen exists for: a shared LINK
  // to an invalid link, a deleted recipe, or one this account blocked or
  // reported. A skeleton that never resolves says the app is broken; this says
  // what happened.
  if (!recipe) {
    return (
      <Screen
        header={
          <AppBar
            title={t('recipes:detail.goneTitle')}
            onBack={() => goBack()}
            backLabel={t('common:a11y.back')}
          />
        }
      >
        <EmptyState
          title={t('recipes:detail.goneTitle')}
          description={t('recipes:detail.goneBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      </Screen>
    )
  }

  const cooking = cookingFor ?? recipe.servings
  const priced = recipe.ingredientCount > 0
  const perServing = recipe.perServing
  // Proportional to the calories each macro contributes, which is the only
  // reading under which three bars of different nutrients are comparable.
  const share = energyShare(perServing)
  const logKcal = Math.round(perServing.kcal * quantity)

  const portions: Array<{ key: string; label: string; value: number }> = [
    { key: 'half', label: t('recipes:detail.portion.half'), value: 0.5 },
    { key: 'one', label: t('recipes:detail.portion.one'), value: 1 },
    { key: 'two', label: t('recipes:detail.portion.two'), value: 2 },
    ...(recipe.servings > 2
      ? [{ key: 'pot', label: t('recipes:detail.portion.pot'), value: recipe.servings }]
      : []),
  ]

  const addToDay = () => {
    // NOT GATED, and on somebody else's recipe either. Logging a pot writes an
    // entry from figures somebody typed, reaches no model and costs nothing, so
    // it is free for the same reason searching the catalogue is. What a free
    // account is limited on is how many recipes it may KEEP, which is checked
    // where one is created rather than where one is logged.
    logFood.mutate(recipeLog(recipe, quantity, selectedDate))
    setLogging(false)
    toast.show({ title: t('recipes:detail.added'), tone: 'success' })
  }

  const copy = async () => {
    const newId = await copyRecipe({ recipeId: recipe.id, shareSlug: sharedSlug })
    if (newId) router.replace({ pathname: '/recipe/[id]', params: { id: newId } })
  }

  const startCooking = () =>
    router.push({
      pathname: '/recipe/cook',
      params: { id, servings: String(cooking) },
    })

  return (
    <Screen
      header={
        <AppBar
          title=""
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
          /* On a community recipe too, and that is guideline 1.2 rather than a
             nicety: an app whose users read each other's writing has to offer a
             way to report it and a way to never see that cook again. */
          action={
            <View className="flex-row items-center gap-2">
              {recipe.isMine ? (
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={
                    recipe.isFavourite ? t('recipes:card.unfavourite') : t('recipes:card.favourite')
                  }
                  accessibilityState={{ selected: recipe.isFavourite }}
                  onPress={() =>
                    favourite.mutate({ id: recipe.id, favourite: !recipe.isFavourite })
                  }
                >
                  <Icon
                    set="system"
                    name={recipe.isFavourite ? 'heart-filled' : 'heart'}
                    size={22}
                  />
                </IconButton>
              ) : (
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('recipes:detail.saveCopy')}
                  disabled={copying}
                  onPress={copy}
                >
                  <Icon set="ui" name="bookmark" size={20} />
                </IconButton>
              )}
              {recipe.isMine || reportable ? (
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('common:a11y.more')}
                  onPress={() => (recipe.isMine ? setMenu(true) : setReporting(true))}
                >
                  <Icon set="ui" name="more-vertical" size={20} tintColor={colors.muted} />
                </IconButton>
              ) : null}
            </View>
          }
        />
      }
      /* "Add to today" is the primary, because it is what somebody reading a
         dish at a mealtime came to do. "Start cooking" is beside it for the
         person at the stove, on every recipe that has a method to page
         through. */
      footer={
        <View className="flex-row items-center gap-2.5">
          {recipe.steps ? (
            <Button className="flex-1" variant="secondary" onPress={startCooking}>
              {t('recipes:detail.startCooking')}
            </Button>
          ) : null}
          {/* Your own recipe with nothing in it yet costs nothing to log, so
              the thing to do next is to fill it in. */}
          {recipe.isMine && !priced ? (
            <Button
              className="flex-1"
              onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })}
            >
              {t('recipes:edit.addIngredient')}
            </Button>
          ) : (
            <Button
              className="flex-1"
              loading={logFood.isPending}
              onPress={() => {
                setQuantity(1)
                setLogging(true)
              }}
            >
              {t('recipes:detail.addToDay')}
            </Button>
          )}
        </View>
      }
    >
      {/* Tall enough for the whole dish when there is a photograph of it. A
          drawing keeps the short box: a 96pt illustration centred in a 260pt
          frame is a small picture in a large empty one.

          `resolvingPhoto` counts as having one, because it means the recipe HAS
          a photograph and we are waiting on a URL for it. Left out, the box
          opens short and grows by 130pt under the reader a moment later. */}
      <View
        className={cn(
          'items-center justify-center overflow-hidden rounded-card border-[3px] border-line bg-track',
          photo || resolvingPhoto ? 'h-[260px]' : 'h-[130px]',
        )}
      >
        {photo ? (
          <MealPhoto source={photo} />
        ) : resolvingPhoto ? (
          <Skeleton width="100%" height={260} rounded={false} className="bg-line" />
        ) : (
          <Icon {...(recipe.icon ?? { set: 'food', name: 'cooking-pot' })} size={96} />
        )}
      </View>

      <View className="gap-2">
        {/* A cook's own name for their own pot, so it is as long as they made it. */}
        <Text variant="title" accessibilityRole="header">
          {recipe.name}
        </Text>

        {/* Who cooked it, on somebody else's. Absent on your own, where the
            answer is you. */}
        {!recipe.isMine ? (
          <View className="flex-row items-center gap-2">
            <Icon set="ui" name="profile" size={16} />
            <Text variant="meta" className="flex-1">
              {t('recipes:fromAuthor', { name: recipe.authorName || t('recipes:someCook') })}
            </Text>
          </View>
        ) : null}

        {recipe.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <Chip key={tag} soft>
                {t(`recipes:tag.${tag}`)}
              </Chip>
            ))}
          </View>
        ) : null}
      </View>

      <RecipeStats recipe={recipe} />

      {/* Left out until something is in the pot: "0 kcal" with three empty
          bars reads as a broken figure rather than a missing one. */}
      {priced ? (
        <Card>
          <View className="flex-row items-center gap-4">
            <View className="items-start">
              <View className="flex-row items-baseline gap-1">
                <Text variant="numeric" className="text-[30px] leading-[36px] text-pandan-ink">
                  {perServing.kcal.toLocaleString()}
                </Text>
                <Text variant="caption">{t('common:unit.kcal')}</Text>
              </View>
              <Text variant="meta">{t('recipes:detail.perServing')}</Text>
            </View>
            <View className="min-w-0 flex-1 gap-1.5">
              <MacroBar
                inline
                label={t('common:macro.carbs')}
                amount={t('common:unit.grams', { value: perServing.carbs })}
                value={share.carbs}
                tone="kaya"
              />
              <MacroBar
                inline
                label={t('common:macro.protein')}
                amount={t('common:unit.grams', { value: perServing.protein })}
                value={share.protein}
                tone="hibiscus"
              />
              <MacroBar
                inline
                label={t('common:macro.fat')}
                amount={t('common:unit.grams', { value: perServing.fat })}
                value={share.fat}
                tone="teh"
              />
            </View>
          </View>
        </Card>
      ) : null}

      {/* With two panes, the picture and the overview stay on the left and the
          cooking (ingredients and method) goes on the right. */}
      <Aside>
        <SegmentedControl
          options={[
            { value: 'ingredients', label: t('recipes:detail.tabIngredients') },
            { value: 'method', label: t('recipes:detail.tabMethod') },
          ]}
          value={section}
          onChange={setSection}
        />

        {section === 'ingredients' ? (
          <Card>
            {ingredients.length > 0 ? (
              <View className="gap-1">
                {/* Changes the amounts and nothing else. What a serving costs
                    is the same however many are at the table. */}
                <View className="flex-row items-center justify-between gap-3 pb-2">
                  <Text variant="bodyStrong">{t('recipes:detail.cookingFor')}</Text>
                  <Stepper
                    value={cooking}
                    onChange={(next) => setCookingFor(Math.round(next))}
                    step={1}
                    min={1}
                    max={Math.max(100, recipe.servings)}
                    format={(value) => String(Math.round(value))}
                    decrementLabel={t('common:a11y.decrease')}
                    incrementLabel={t('common:a11y.increase')}
                    className="w-[150px]"
                  />
                </View>
                <IngredientChecklist
                  ingredients={ingredients}
                  servings={recipe.servings}
                  cooking={cooking}
                  ticked={ticked}
                  onToggle={toggleTick}
                />
              </View>
            ) : (
              <Text variant="body" className="text-muted">
                {t('recipes:detail.noIngredients')}
              </Text>
            )}
          </Card>
        ) : (
          <Card
            title={
              recipe.isMine
                ? t('recipes:detail.steps')
                : t('recipes:detail.stepsFrom', {
                    name: recipe.authorName || t('recipes:someCook'),
                  })
            }
          >
            {recipe.steps ? (
              <RecipeSteps steps={recipe.steps} />
            ) : (
              <Text variant="body" className="text-muted">
                {t('recipes:detail.noSteps')}
              </Text>
            )}
          </Card>
        )}

        {/* The owner's bookmark to where it came from. Nobody else is sent it;
            see `recipes.source_url`. */}
        {recipe.sourceUrl ? (
          <Tappable
            className="flex-row items-center gap-3 rounded-tile border-[3px] border-line bg-surface px-4 py-3"
            accessibilityRole="link"
            accessibilityLabel={`${t('recipes:detail.source')}, ${sourceHost(recipe.sourceUrl)}`}
            onPress={() => {
              if (recipe.sourceUrl) Linking.openURL(recipe.sourceUrl).catch(() => {})
            }}
          >
            <Icon set="ui" name="link" size={22} />
            <View className="min-w-0 flex-1">
              <Text variant="caption">{t('recipes:detail.source')}</Text>
              <Text variant="label" numberOfLines={1}>
                {sourceHost(recipe.sourceUrl)}
              </Text>
            </View>
            <Icon set="ui" name="chevron-right" size={18} />
          </Tappable>
        ) : null}
      </Aside>

      {/* How much of the pot was eaten. A sheet rather than a stepper on the
          page, because the page's own number is now how many it is cooked for,
          and two steppers about servings on one screen answer two questions
          nobody can tell apart. */}
      <Sheet
        visible={logging}
        onClose={() => setLogging(false)}
        title={t('recipes:detail.logTitle')}
        closeLabel={t('common:action.close')}
        scrollable={false}
        footer={
          <Button fullWidth loading={logFood.isPending} onPress={addToDay}>
            {t('recipes:detail.addToDay')}
          </Button>
        }
      >
        <View className="gap-4">
          <Stepper
            value={quantity}
            onChange={setQuantity}
            step={0.5}
            min={0.5}
            max={recipe.servings * 2}
            unit={t('recipes:detail.servingLabel', { count: quantity })}
            decrementLabel={t('common:a11y.decrease')}
            incrementLabel={t('common:a11y.increase')}
          />
          <View className="flex-row flex-wrap gap-2">
            {portions.map((portion) => (
              <Chip
                key={portion.key}
                selected={quantity === portion.value}
                onPress={() => setQuantity(portion.value)}
              >
                {portion.label}
              </Chip>
            ))}
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text variant="overline">
              {t('recipes:detail.ofServings', { count: quantity, total: recipe.servings })}
            </Text>
            <View className="flex-row items-baseline gap-1">
              <Text variant="numeric" className="text-pandan-ink">
                {logKcal.toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
          </View>
        </View>
      </Sheet>

      <ShareSheet visible={sharing} onClose={() => setSharing(false)} recipe={recipe} />

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        onDismiss={() => {
          const next = afterMenu.current
          afterMenu.current = null
          next?.()
        }}
        title={recipe.name}
        closeLabel={t('common:action.close')}
        scrollable={false}
      >
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Icon set="ui" name="edit" size={20} />}
          onPress={() => {
            afterMenu.current = () =>
              router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })
            setMenu(false)
          }}
        >
          {t('common:action.edit')}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Icon set="ui" name="share" size={20} />}
          onPress={() => {
            afterMenu.current = () => setSharing(true)
            setMenu(false)
          }}
        >
          {t('recipes:share.action')}
        </Button>
        <Button
          variant="danger"
          fullWidth
          leftIcon={<Icon set="ui" name="delete" size={20} />}
          onPress={() => {
            afterMenu.current = () => setDeleting(true)
            setMenu(false)
          }}
        >
          {t('recipes:detail.delete')}
        </Button>
      </Sheet>

      {/* REPORTING IS ONE TAP AND IT IS FINAL, deliberately. There is no
          confirmation and no "are you sure": a reader who has just seen
          something they want gone should not have to look at it through a
          second dialog, and the cost of a mis-tap is one recipe hidden from one
          person, which they can live with.

          What each button promises is exactly what happens. A reason hides this
          recipe from this reader immediately; three separate people reporting
          it takes it off the shelf for everybody, which `report_threshold` in
          the database decides rather than anything here. Blocking hides
          everything by that cook at once. Neither tells the author. */}
      <Sheet
        visible={reporting}
        onClose={() => setReporting(false)}
        title={t('recipes:report.title')}
        description={t('recipes:report.body')}
        closeLabel={t('common:action.cancel')}
        scrollable={false}
      >
        {REPORT_REASONS.map((reason) => (
          <Button key={reason} variant="secondary" fullWidth onPress={() => submitReport(reason)}>
            {t(`recipes:report.${reason}`)}
          </Button>
        ))}
        <Button
          variant="danger"
          fullWidth
          leftIcon={<Icon set="ui" name="close" size={20} />}
          onPress={blockCook}
        >
          {t('recipes:report.block', { name: recipe.authorName || t('recipes:someCook') })}
        </Button>
      </Sheet>

      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={t('recipes:detail.deleteTitle')}
        description={t('recipes:detail.deleteBody')}
        confirmLabel={t('common:action.delete')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
        onConfirm={async () => {
          await remove.mutateAsync({ id: recipe.id, photoPath: recipe.photoPath })
          setDeleting(false)
          toast.show({ title: t('recipes:detail.deleted'), tone: 'neutral' })
          router.replace('/recipes')
        }}
      />
    </Screen>
  )
}
