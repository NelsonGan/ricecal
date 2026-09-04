import { FREE_RECIPES } from '@ricecal/shared'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  isRecipeLimit,
  type ReportReason,
  snapshotFromRecipe,
  storedImageSource,
  useBlockAuthor,
  useDeleteRecipe,
  useLogFood,
  useMealPhotoUrl,
  useRecipe,
  useRecipeIngredients,
  useRecipeQuota,
  useReportRecipe,
  useSaveRecipeCopy,
  useSelectedDate,
} from '@/data'
import { openPaywall } from '@/data/refusals'
import { useRequirePro } from '@/features/paywall'
import { RecipeSteps, ShareSheet } from '@/features/recipes'
import { MealPhoto } from '@/features/shared'
import { useBack } from '@/lib/navigation'
import { energyShare } from '@/lib/nutrition'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  cn,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  MacroBar,
  Screen,
  Sheet,
  Skeleton,
  Stepper,
  Text,
  useToast,
} from '@/ui'

/**
 * One food somebody wrote, and what you can do with it.
 *
 * Your own logs into the day and can be shared. Somebody else's does BOTH: it
 * logs into the day, and it can be kept as a copy of your own to edit.
 *
 * Logging somebody else's used to be impossible, and the reason was real at the
 * time: a logged entry referenced the recipe's mirror catalogue row, so editing
 * a recipe repriced every entry that ever pointed at it and logging somebody
 * else's would have put their future corrections into your past diary. The
 * mirror went with the catalogue. An entry is a snapshot now — `recipe_id` is
 * provenance and nothing reads back through it — so a community dish costs the
 * reader exactly what it said it cost on the day they ate it, and making them
 * save a copy first was a step that no longer protected anything.
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
  const requirePro = useRequirePro()
  const saveCopy = useSaveRecipeCopy()
  const quota = useRecipeQuota()
  const remove = useDeleteRecipe()
  const report = useReportRecipe()
  const block = useBlockAuthor()

  /**
   * How many servings are being logged. Not a portion id: the mirror's base
   * portion is one serving, so "how many" is the entry's quantity and the chips
   * below are shortcuts to values of it.
   */
  const [quantity, setQuantity] = useState(1)
  const [sharing, setSharing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reporting, setReporting] = useState(false)

  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(recipe?.photoPath)
  const photo = storedImageSource(recipe?.photoPath, photoUrl)

  /**
   * Whether this food has an author who could be reported or blocked. Somebody
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
      <Screen>
        <AppBar title="" onBack={() => goBack()} backLabel={t('common:a11y.back')} />
        <Skeleton className="h-[130px] w-full" />
        <Skeleton className="h-[120px] w-full" />
      </Screen>
    )
  }

  // Resolved, and there is nothing there. Distinct from still loading, and the
  // distinction matters most on the path this screen exists for: a shared LINK
  // to a recipe that was deleted, made private again, or is still waiting on a
  // review. A skeleton that never resolves says the app is broken; this says
  // what happened.
  if (!recipe) {
    return (
      <Screen>
        <AppBar
          title={t('recipes:detail.goneTitle')}
          onBack={() => goBack()}
          backLabel={t('common:a11y.back')}
        />
        <EmptyState
          title={t('recipes:detail.goneTitle')}
          description={t('recipes:detail.goneBody')}
          icon={{ set: 'ui', name: 'search' }}
        />
      </Screen>
    )
  }

  const kcal = Math.round(recipe.perServing.kcal * quantity)
  const macros = {
    carbs: Math.round(recipe.perServing.carbs * quantity * 10) / 10,
    protein: Math.round(recipe.perServing.protein * quantity * 10) / 10,
    fat: Math.round(recipe.perServing.fat * quantity * 10) / 10,
  }
  // Proportional to the calories each macro contributes, which is the only
  // reading under which three bars of different nutrients are comparable.
  const share = energyShare(macros)

  const portions: Array<{ key: string; label: string; value: number }> = [
    { key: 'half', label: t('recipes:detail.portion.half'), value: 0.5 },
    { key: 'one', label: t('recipes:detail.portion.one'), value: 1 },
    { key: 'two', label: t('recipes:detail.portion.two'), value: 2 },
    ...(recipe.servings > 2
      ? [{ key: 'pot', label: t('recipes:detail.portion.pot'), value: recipe.servings }]
      : []),
  ]

  const addToDay = () => {
    // NOT GATED, and on somebody else's food either. Logging a pot writes an
    // entry from figures somebody typed, reaches no model and costs nothing, so
    // it is free for the same reason searching the catalogue is. What a free
    // account is limited on is how many foods it may KEEP, which is checked
    // where one is created rather than where one is logged.
    logFood.mutate({
      snapshot: snapshotFromRecipe(recipe),
      quantity,
      logDate: selectedDate,
      source: 'quickAdd',
      method: 'recipe',
    })
    toast.show({ title: t('recipes:detail.added'), tone: 'success' })
    goBack()
  }

  const copy = async () => {
    // A saved copy is a food of yours — it lands on your shelf, it is yours to
    // edit, and the database counts it against the same three. So the gate is
    // here as well as on the plus button, or "save somebody else's" would be
    // the way round the ceiling, and the user would meet a trigger's error
    // message instead of a paywall.
    if (quota.atLimit && !requirePro('new_recipe')) return
    let newId: string
    try {
      newId = await saveCopy.mutateAsync(recipe.id)
    } catch (error) {
      // The trigger refusing, rather than the write failing. Reachable even
      // past the guard above: the count this screen read can be a shelf out of
      // date — another phone saved a third recipe a minute ago — and "could not
      // save that" would send somebody to try again at a ceiling that is not
      // going to move. Same answer as the recipe form gives.
      if (isRecipeLimit(error)) {
        // Through `openPaywall` rather than three lines here, so the toast comes
        // from the top like every other one that opens this screen — the
        // paywall's buy button is a footer, and a bottom toast lands on it.
        openPaywall(toast, {
          title: t('recipes:edit.limitReached', { count: FREE_RECIPES }),
          feature: 'new_recipe',
        })
        return
      }
      toast.show({ title: t('recipes:detail.saveCopyFailed'), tone: 'error' })
      return
    }
    toast.show({ title: t('recipes:detail.savedCopy'), tone: 'success' })
    router.replace({ pathname: '/recipe/[id]', params: { id: newId } })
  }

  return (
    <Screen
      /* "Add to today" is the primary on both, because it is what somebody
         reading a dish at a mealtime came to do. What sits beside it differs:
         your own has a share button, and somebody else's has "Save to my
         foods", which is the second thing you might want and not the first.
         Keeping a copy is for the food you mean to cook again, and that is a
         decision about next week rather than about lunch. */
      footer={
        recipe.isMine ? (
          <View className="flex-row items-center gap-2.5">
            <Button className="flex-1" loading={logFood.isPending} onPress={addToDay}>
              {t('recipes:detail.addToDay')}
            </Button>
            <IconButton
              variant="neutral"
              accessibilityLabel={t('recipes:share.action')}
              onPress={() => setSharing(true)}
            >
              <Icon set="ui" name="share" size={22} />
            </IconButton>
          </View>
        ) : (
          <View className="gap-2.5">
            <Button fullWidth loading={logFood.isPending} onPress={addToDay}>
              {t('recipes:detail.addToDay')}
            </Button>
            <Button fullWidth variant="secondary" loading={saveCopy.isPending} onPress={copy}>
              {t('recipes:detail.saveCopy')}
            </Button>
          </View>
        )
      }
    >
      <AppBar
        title={recipe.name}
        /* A cook's own name for their own pot, so it is as long as they made
           it: the same reason the logged-entry screen takes two lines. Every
           other bar in the app names a screen and stays on one. */
        titleLines={2}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
        /* On a community food too, and that is guideline 1.2 rather than a
           nicety: an app whose users read each other's writing has to offer a
           way to report it and a way to never see that cook again. */
        action={
          recipe.isMine || reportable ? (
            <IconButton
              size="sm"
              accessibilityLabel={t('common:a11y.more')}
              onPress={() => (recipe.isMine ? setMenu(true) : setReporting(true))}
            >
              <Icon set="ui" name="more-vertical" size={20} tintColor={colors.muted} />
            </IconButton>
          ) : undefined
        }
      />

      {/* Tall enough for the whole dish when there is a photograph of it, the
          same two heights the logged-entry screen uses. At a flat 130pt a
          photo of a pot came through as a letterbox strip across the middle of
          it — the cook's own picture of their own cooking, cropped to a band.
          A drawing keeps the short box: a 96pt illustration centred in a 260pt
          frame is a small picture in a large empty one.

          `resolvingPhoto` counts as having one, because it means the recipe HAS a
          photograph and we are waiting on a URL for it. Left out, the box
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
        ) : recipe.icon ? (
          <Icon {...recipe.icon} size={96} />
        ) : (
          <Icon set="food" name="cooking-pot" size={96} />
        )}
      </View>

      {/* Who cooked it, on somebody else's. Absent on your own, where the answer
          is you. */}
      {!recipe.isMine ? (
        <Card tone="water">
          <View className="flex-row items-center gap-3">
            <Icon set="ui" name="profile" size={18} />
            <Text variant="meta" className="flex-1">
              {t('recipes:fromAuthor', { name: recipe.authorName || t('recipes:someCook') })}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <View className="gap-3">
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
        </View>
      </Card>

      <Card>
        <View className="gap-3">
          <View className="flex-row items-baseline justify-between">
            <View className="flex-row items-baseline gap-1">
              <Text variant="numeric" className="text-[30px] leading-[36px] text-pandan-ink">
                {kcal.toLocaleString()}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
            <Text variant="overline">
              {t('recipes:detail.ofServings', { count: quantity, total: recipe.servings })}
            </Text>
          </View>

          <MacroBar
            label={t('common:macro.carbs')}
            amount={t('common:unit.grams', { value: macros.carbs })}
            value={share.carbs}
            tone="kaya"
          />
          <MacroBar
            label={t('common:macro.protein')}
            amount={t('common:unit.grams', { value: macros.protein })}
            value={share.protein}
            tone="hibiscus"
          />
          <MacroBar
            label={t('common:macro.fat')}
            amount={t('common:unit.grams', { value: macros.fat })}
            value={share.fat}
            tone="teh"
          />
        </View>
      </Card>

      {ingredients.length > 0 ? (
        <Card title={t('recipes:detail.ingredients')}>
          {ingredients.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-2.5 py-2.5">
                <Text variant="bodyStrong" className="min-w-0 flex-1" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="meta">
                  {item.amount} {t(`recipes:ingredient.unit.${item.unit}`, { count: item.amount })}
                </Text>
                <View className="flex-row items-baseline gap-1">
                  <Text variant="numeric" className="text-[15px] leading-[20px]">
                    {item.macros.kcal.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card
        title={
          recipe.isMine
            ? t('recipes:detail.steps')
            : t('recipes:detail.stepsFrom', { name: recipe.authorName || t('recipes:someCook') })
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

      <ShareSheet visible={sharing} onClose={() => setSharing(false)} recipe={recipe} />

      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={recipe.name}
        closeLabel={t('common:action.close')}
        scrollable={false}
      >
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Icon set="ui" name="edit" size={20} />}
          onPress={() => {
            setMenu(false)
            router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })
          }}
        >
          {t('common:action.edit')}
        </Button>
        <Button
          variant="secondary"
          fullWidth
          leftIcon={<Icon set="ui" name="share" size={20} />}
          onPress={() => {
            setMenu(false)
            setSharing(true)
          }}
        >
          {t('recipes:share.action')}
        </Button>
        <Button
          variant="danger"
          fullWidth
          leftIcon={<Icon set="ui" name="delete" size={20} />}
          onPress={() => {
            setMenu(false)
            setDeleting(true)
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

/**
 * The four reasons, in the order they are offered.
 *
 * A list rather than four buttons written out, so the copy keys and the enum
 * cannot drift: `report_reason` in `schemas/01_enums.sql` has these four and
 * `recipes:report.*` has a line for each. Adding a fifth is a change in three
 * files that the compiler notices in two of them.
 *
 * Ordered by how likely it is to be the true reason rather than by severity.
 */
const REPORT_REASONS: readonly ReportReason[] = ['inappropriate', 'spam', 'dangerous', 'stolen']
