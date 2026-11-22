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
  useMealPhotoUrl,
  useRecipe,
  useRecipeIngredients,
  useReportRecipe,
} from '@/data'
import {
  IngredientChecklist,
  LogRecipeSheet,
  PlatformLogo,
  RecipeNutrition,
  RecipeStats,
  RecipeSteps,
  ShareSheet,
  sourceHost,
  useCopyRecipe,
  useRecipeLogDate,
  useTickedIngredients,
} from '@/features/recipes'
import { MealPhoto } from '@/features/shared'
import { useBack, useCloseStack } from '@/lib/navigation'
import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Aside,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  Sheet,
  Skeleton,
  Squish,
  Tabs,
  Tappable,
  Text,
  useToast,
} from '@/ui'

type Section = 'ingredients' | 'method'

/** The most people "Cooking for" goes up to: the column's own ceiling on servings. */
const MAX_COOKING_FOR = 100

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
  // Away from a recipe that is gone or hidden, back to what opened it: the
  // Recipes tab, a group chat, the log search.
  const leave = useCloseStack('/recipes')
  const toast = useToast()
  const colors = useThemeColors()

  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>()
  const { data: recipe, isPending } = useRecipe(id)
  const { data: ingredients = [] } = useRecipeIngredients(id)

  const { logDate, isToday } = useRecipeLogDate(date)
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
      leave()
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
      leave()
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
  // A recipe from a video is the video's creator's, whoever imported it, so
  // they are the one credited, on your own copy too.
  const credit = recipe.videoCredit
  const creditPlatform = credit ? t(`recipes:platform.${credit.platform}`) : ''
  // A video's recipe says so with its creator pill instead (below the title).
  const metaLine = credit
    ? ''
    : [
        recipe.isMine
          ? null
          : t('recipes:fromAuthor', { name: recipe.authorName || t('recipes:someCook') }),
        ...recipe.tags.map((tag) => t(`recipes:tag.${tag}`)),
      ]
        .filter(Boolean)
        .join(' · ')
  // Logging is NOT GATED, and on somebody else's recipe either. Logging a pot
  // writes an entry from figures somebody typed, reaches no model and costs
  // nothing, so it is free for the same reason searching the catalogue is. What
  // a free account is limited on is how many recipes it may KEEP.

  const copy = async () => {
    const newId = await copyRecipe({ recipeId: recipe.id, shareSlug: sharedSlug })
    if (newId) router.replace({ pathname: '/recipe/[id]', params: { id: newId } })
  }

  const startCooking = () =>
    router.push({
      pathname: '/recipe/cook',
      params: { id, servings: String(cooking), ...(date ? { date } : {}) },
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
              {/* Editing is what a cook does after cooking (the salt was too
                  much, it fed five), so it is one tap rather than a menu item. */}
              {recipe.isMine ? (
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('common:action.edit')}
                  onPress={() =>
                    router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })
                  }
                >
                  <Icon set="ui" name="edit" size={20} />
                </IconButton>
              ) : null}
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
              ) : null}
              {/* Somebody else's: keep a copy. In the bar, beside the menu,
                  where the mockups put it; a labelled button in the page made
                  the title block the busiest thing on screen. */}
              {!recipe.isMine ? (
                <IconButton
                  size="sm"
                  variant="neutral"
                  accessibilityLabel={t('recipes:detail.saveCopy')}
                  disabled={copying}
                  onPress={copy}
                >
                  <Icon set="ui" name="bookmark" size={20} />
                </IconButton>
              ) : null}
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
            <Button
              className="flex-1"
              variant="secondary"
              leftIcon={<Icon set="food" name="cooking-pot" size={22} />}
              onPress={startCooking}
            >
              {t('recipes:detail.startCooking')}
            </Button>
          ) : null}
          {/* Your own recipe with nothing in it yet costs nothing to log, so
              the thing to do next is to fill it in. */}
          {priced ? (
            <Button className="flex-1" onPress={() => setLogging(true)}>
              {isToday ? t('recipes:detail.addToDay') : t('common:action.add')}
            </Button>
          ) : recipe.isMine ? (
            <Button
              className="flex-1"
              onPress={() => router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })}
            >
              {t('recipes:edit.addIngredient')}
            </Button>
          ) : null}
        </View>
      }
    >
      {/* Tall enough for the whole dish when there is a photograph of it. A
          drawing keeps the short box: a 96pt illustration centred in a 260pt
          frame is a small picture in a large empty one.

          `resolvingPhoto` counts as having one, because it means the recipe HAS
          a photograph and we are waiting on a URL for it. Left out, the box
          opens short and grows by 130pt under the reader a moment later. */}
      {photo || resolvingPhoto ? (
        <View className="h-[260px] items-center justify-center overflow-hidden rounded-card border-[3px] border-line bg-track">
          {photo ? (
            <MealPhoto source={photo} />
          ) : (
            <Skeleton width="100%" height={260} rounded={false} className="bg-line" />
          )}
        </View>
      ) : null}

      {/* The name, and one quiet line under it: who wrote it (on somebody
          else's) and which meals it is for. That line replaced an author row,
          a labelled save button and a row of tag chips, three things stacked
          under the title before anything about the food itself. */}
      <View className="flex-row items-center gap-3">
        {/* With no photograph the drawing sits beside the name rather than in
            a box of its own above it, so the ingredients start higher. */}
        {photo || resolvingPhoto ? null : (
          <Icon {...(recipe.icon ?? { set: 'food', name: 'cooking-pot' })} size={72} />
        )}
        <View className="min-w-0 flex-1 gap-0.5">
          {/* A cook's own name for their own pot, so it is as long as they made it. */}
          <Text variant="title" accessibilityRole="header">
            {recipe.name}
          </Text>
          {credit ? (
            // The creator as a pill with their platform's logo, the meals
            // beside it as quiet tags: "From @creator · Lunch · Dinner" as one
            // grey sentence read as small print. The pill opens the video.
            <View className="flex-row flex-wrap items-center gap-1.5 pt-1.5">
              <Squish
                depth={slab.sm}
                radius={radius.full}
                slabClassName="bg-line"
                className="flex-row items-center gap-2 border-[2px] border-line bg-surface py-1 pl-1 pr-3.5"
                accessibilityRole="link"
                accessibilityLabel={`${t('recipes:import.watch', { platform: creditPlatform })}, ${
                  credit.author || creditPlatform
                }`}
                onPress={() => {
                  Linking.openURL(credit.url).catch(() => {})
                }}
              >
                <PlatformLogo platform={credit.platform} size={24} />
                <Text variant="label" numberOfLines={1} className="flex-shrink">
                  {credit.author || creditPlatform}
                </Text>
              </Squish>
              {/* As tall as the pill's face, and lifted off the slab it sits
                  on, so the row reads as one line of pills. */}
              {recipe.tags.map((tag) => (
                <View
                  key={tag}
                  className="rounded-full bg-track px-3.5 py-1.5"
                  style={{ marginBottom: slab.sm }}
                >
                  <Text variant="caption">{t(`recipes:tag.${tag}`)}</Text>
                </View>
              ))}
            </View>
          ) : metaLine ? (
            <Text variant="meta">{metaLine}</Text>
          ) : null}
        </View>
      </View>

      <RecipeStats recipe={recipe} />

      {/* Left out until something is in the pot: "0 kcal" reads as a broken
          figure rather than a missing one. */}
      {priced ? <RecipeNutrition perServing={recipe.perServing} /> : null}

      {/* With two panes, the picture and the overview stay on the left and the
          cooking (ingredients and method) goes on the right. */}
      <Aside>
        {/* Tabs rather than a segmented control: these are two views of the
            recipe, not a value being picked, and the underline reads as the
            header of the card under it. Against the left edge rather than
            centred, because everything above them starts there too. */}
        <Tabs
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
                    is the same however many are at the table. Two small
                    buttons rather than the form's stepper: this is a setting
                    over a list, not the thing the page is for. */}
                <View className="flex-row items-center justify-between gap-3 pb-2">
                  <Text variant="bodyStrong" accessibilityRole="text">
                    {`${t('recipes:detail.cookingFor')} ${cooking}`}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <IconButton
                      size="xs"
                      variant="neutral"
                      hitSlop={6}
                      disabled={cooking <= 1}
                      accessibilityLabel={t('common:a11y.decrease')}
                      onPress={() => setCookingFor(Math.max(1, cooking - 1))}
                    >
                      <Icon set="ui" name="minus" size={16} tintColor={colors.ink} />
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="neutral"
                      hitSlop={6}
                      disabled={cooking >= MAX_COOKING_FOR}
                      accessibilityLabel={t('common:a11y.increase')}
                      onPress={() => setCookingFor(Math.min(MAX_COOKING_FOR, cooking + 1))}
                    >
                      <Icon set="ui" name="plus" size={16} tintColor={colors.ink} />
                    </IconButton>
                  </View>
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

        {/* The video it was imported from, for everybody: the server rebuilt
            the link from the platform and the post id, so unlike the owner's
            own bookmark below it cannot point anywhere else. */}
        {credit ? (
          <Tappable
            className="flex-row items-center gap-3 rounded-tile border-[3px] border-line bg-surface px-4 py-3"
            accessibilityRole="link"
            accessibilityLabel={t('recipes:import.watch', {
              platform: t(`recipes:platform.${credit.platform}`),
            })}
            onPress={() => {
              Linking.openURL(credit.url).catch(() => {})
            }}
          >
            <PlatformLogo platform={credit.platform} size={36} />
            <View className="min-w-0 flex-1">
              <Text variant="caption">
                {t('recipes:import.watch', { platform: t(`recipes:platform.${credit.platform}`) })}
              </Text>
              <Text variant="label" numberOfLines={1}>
                {credit.author || t(`recipes:platform.${credit.platform}`)}
              </Text>
            </View>
            <Icon set="ui" name="chevron-right" size={18} />
          </Tappable>
        ) : null}

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
          page, because the page's own number is how many it is cooked for, and
          two steppers about servings on one screen answer two questions nobody
          can tell apart. */}
      <LogRecipeSheet
        visible={logging}
        onClose={() => setLogging(false)}
        recipe={recipe}
        logDate={logDate}
        isToday={isToday}
        // Opened from the log sheet (which passes its day): logging is what it
        // came for, so it goes back there, as it always did. From the Recipes
        // tab it stays, for the cook still reading the recipe.
        onLogged={date ? () => goBack() : undefined}
      />

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
          leave()
        }}
      />
    </Screen>
  )
}
