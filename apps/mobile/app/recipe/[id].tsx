import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  snapshotFromRecipe,
  storedImageSource,
  useDeleteRecipe,
  useLogFood,
  useMealPhotoUrl,
  useRecipe,
  useRecipeIngredients,
  useSaveRecipeCopy,
  useSelectedDate,
} from '@/data'
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
 * R5 — one recipe, and the two things you can do with it.
 *
 * WHICH TWO DEPENDS ON WHOSE IT IS, and that is the one decision on this
 * screen. Your own recipe logs straight into the day. Somebody else's — the
 * kitchen's, or the community's — is SAVED first, as a copy, and logged from
 * the copy.
 *
 * That is not a permissions detail, it is the point. A logged entry references
 * the recipe's mirror catalogue row, and editing a recipe reprices every entry
 * that ever pointed at it. Logging somebody else's directly would put their
 * future corrections into your past diary — they change the servings next month
 * and last Tuesday's dinner moves. A copy is yours, and so are its numbers.
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
  const saveCopy = useSaveRecipeCopy()
  const remove = useDeleteRecipe()

  /**
   * How many servings are being logged. Not a portion id: the mirror's base
   * portion is one serving, so "how many" is the entry's quantity and the chips
   * below are shortcuts to values of it.
   */
  const [quantity, setQuantity] = useState(1)
  const [sharing, setSharing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: photoUrl, isLoading: resolvingPhoto } = useMealPhotoUrl(recipe?.photoPath)
  const photo = storedImageSource(recipe?.photoPath, photoUrl)

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
    logFood.mutate({
      snapshot: snapshotFromRecipe(recipe),
      quantity,
      logDate: selectedDate,
      source: 'quickAdd',
    })
    toast.show({ title: t('recipes:detail.added'), tone: 'success' })
    goBack()
  }

  const copy = async () => {
    let newId: string
    try {
      newId = await saveCopy.mutateAsync(recipe.id)
    } catch {
      toast.show({ title: t('recipes:detail.saveCopyFailed'), tone: 'error' })
      return
    }
    toast.show({ title: t('recipes:detail.savedCopy'), tone: 'success' })
    router.replace({ pathname: '/recipe/[id]', params: { id: newId } })
  }

  return (
    <Screen
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
          <Button fullWidth loading={saveCopy.isPending} onPress={copy}>
            {t('recipes:detail.saveCopy')}
          </Button>
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
        action={
          recipe.isMine ? (
            <IconButton
              size="sm"
              accessibilityLabel={t('common:a11y.more')}
              onPress={() => setMenu(true)}
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
        <Card tone={recipe.isOfficial ? 'pandan' : 'water'}>
          <View className="flex-row items-center gap-3">
            <Icon set="ui" name={recipe.isOfficial ? 'check' : 'profile'} size={18} />
            <Text variant="meta" className="flex-1">
              {recipe.isOfficial
                ? t('recipes:detail.official')
                : t('recipes:fromAuthor', { name: recipe.authorName || t('recipes:someCook') })}
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
            unit={t('recipes:detail.servingLabel')}
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
          recipe.isMine || recipe.isOfficial
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
