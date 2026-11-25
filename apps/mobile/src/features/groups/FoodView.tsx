import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dateKey, useSettings, useUserId } from '@/data'
import { type GroupFoodIngredient, useGroupFood } from '@/data/groups'
import {
  dayLabel,
  MacrosToggle,
  PartLine,
  partUnit,
  shownIn,
  usePartMacros,
} from '@/features/logging'
import { formatTime, MacroFigures, useMeasureText, usePortionWords } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { convert, isMeasureUnit, MEASURES, type MeasureUnit, roundedFor } from '@/lib/measures'
import { useBack } from '@/lib/navigation'
import { energyShare, roundHalfUp } from '@/lib/nutrition'
import { formatPortion, portionLabel } from '@/lib/portions'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  Aside,
  Card,
  CollapsingAppBar,
  cn,
  Divider,
  Icon,
  Screen,
  Skeleton,
  Tappable,
  Text,
  useWindowLayout,
} from '@/ui'
import { Thumbs } from './MealSheet'
import { EntryPicture, PersonAvatar, useOpenProfile } from './parts'

/** Matches `app/log/food/[id].tsx`: pinned bar height and how far the curved sheet lifts over the hero. */
const PINNED_BAR = spacing.sm * 2 + 44
const CONTENT_LIFT = 22

/** Carbs, protein and fat in the order and colours every chart in the app uses. */
const MACROS = [
  { key: 'carbs', field: 'carbs_g', dot: 'bg-kaya' },
  { key: 'protein', field: 'protein_g', dot: 'bg-hibiscus' },
  { key: 'fat', field: 'fat_g', dot: 'bg-teh' },
] as const

const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * A group member's shared food, opened from its card in the group chat.
 * Draws the photo or drawing, who logged it, group reactions, serving size,
 * calories and macro breakdown, extra nutrients (when recorded) and the plate's
 * ingredient list with its Macros toggle. Read only: never exposes diary notes
 * or meal location.
 */
export function GroupFoodScreen({ groupId, postId }: { groupId: string; postId: string }) {
  const { t } = useTranslation(['groups', 'logging', 'common'])
  const back = useBack('/social')
  const viewer = useUserId()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { split } = useWindowLayout()
  const headerScrollY = useSharedValue(0)
  const openProfile = useOpenProfile()
  const query = useGroupFood(groupId, postId)
  const units = useSettings().data?.units
  const measureText = useMeasureText()
  const words = usePortionWords()
  const [showMacros] = usePartMacros()
  const [showNutrients, setShowNutrients] = useState(false)

  const view = query.data
  const food = view?.food
  const ingredients = view?.ingredients ?? []
  const hasPhoto = Boolean(food?.photo_path)
  const heroHeight = (hasPhoto ? 298 : 198) + CONTENT_LIFT + insets.top

  if (!view || !food) {
    return (
      <Screen
        flush
        scrollOffset={headerScrollY}
        overlayHeader={
          <CollapsingAppBar
            scrollY={headerScrollY}
            revealAt={120}
            onBack={back}
            backLabel={t('common:action.back')}
          />
        }
      >
        {query.isError || query.fetchStatus === 'paused' ? (
          <View className="px-gutter" style={{ paddingTop: PINNED_BAR + spacing.md }}>
            <QueryNotice
              error={query.isError}
              paused={query.fetchStatus === 'paused'}
              unavailable
              retry={() => query.refetch()}
            />
          </View>
        ) : (
          <>
            <View style={{ marginTop: -insets.top }}>
              <Skeleton
                width="100%"
                height={260 + CONTENT_LIFT + insets.top}
                rounded={false}
                className="bg-track"
              />
            </View>
            <View
              className="gap-stack rounded-t-card bg-canvas px-gutter"
              style={{
                marginTop: -(spacing.stack + CONTENT_LIFT),
                paddingTop: CONTENT_LIFT + spacing.stack,
              }}
            >
              <View className="gap-2">
                <Skeleton width="72%" height={28} />
                <Skeleton width="48%" height={18} />
              </View>
              <Card>
                <Skeleton className="h-[140px] w-full" />
              </Card>
              <Card>
                <Skeleton className="h-[160px] w-full" />
              </Card>
            </View>
          </>
        )}
      </Screen>
    )
  }

  const isSelf = view.owner.id === viewer
  const todayKey = dateKey(new Date())
  const whenText = t('logging:detail.whenValue', {
    day: dayLabel(food.log_date, todayKey, {
      today: t('common:date.today'),
      yesterday: t('common:date.yesterday'),
    }),
    time: formatTime(food.logged_at),
  })

  // Portion and weight: always say how much was eaten (e.g. "1 plate (420 g)",
  // "150 g", or "1 serving"), avoiding a redundant gram bracket in any language
  // when `portionLabel` already measured the serving by weight or millilitres.
  const measured: { unit: MeasureUnit | null } = { unit: null }
  const portion =
    portionLabel(food.eaten, food.serving_label, {
      ...words,
      measured: (amount, unit) => {
        measured.unit = unit
        return words.measured(amount, unit)
      },
    }) ?? words.servings(food.eaten)
  const weightText = (() => {
    if (food.grams === null || !(food.grams > 0)) return null
    if (measured.unit && (MEASURES[measured.unit].family === 'weight' || measured.unit === 'ml')) {
      return null
    }
    const unit = units === 'imperial' ? 'oz' : 'g'
    const amount = roundedFor(unit, convert(food.grams, 'g', unit))
    return amount > 0 ? measureText.amount(amount, unit) : null
  })()
  const servingBadge = weightText ? `${portion} (${weightText})` : portion
  const metaLine = [whenText, food.brand].filter(Boolean).join(' · ')

  const macroTotal = food.carbs_g + food.protein_g + food.fat_g
  const share =
    macroTotal > 0
      ? energyShare({ carbs: food.carbs_g, protein: food.protein_g, fat: food.fat_g })
      : null

  const extras = [
    {
      key: 'fibre',
      label: t('logging:detail.fibre'),
      value:
        food.fibre_g === null
          ? undefined
          : t('common:unit.grams', { value: roundHalfUp(food.fibre_g, 1) }),
    },
    {
      key: 'sugar',
      label: t('logging:detail.sugar'),
      value:
        food.sugar_g === null
          ? undefined
          : t('common:unit.grams', { value: roundHalfUp(food.sugar_g, 1) }),
    },
    {
      key: 'sodium',
      label: t('logging:detail.sodium'),
      value:
        food.sodium_mg === null
          ? undefined
          : t('logging:detail.milligrams', { value: Math.round(food.sodium_mg) }),
    },
  ] as const
  const hasExtras = extras.some((row) => row.value !== undefined)
  const plateKcal = ingredients.reduce((sum, item) => sum + item.kcal, 0)

  const formatPartAmount = (ingredient: GroupFoodIngredient) => {
    const part = {
      grams: ingredient.grams,
      quantity: ingredient.quantity,
      servingLabel: ingredient.serving_label ?? '',
      displayUnit: isMeasureUnit(ingredient.display_unit) ? ingredient.display_unit : null,
    }
    const unit = partUnit(part, units)
    return unit ? measureText.amount(shownIn(part, unit), unit).replace(/ /g, '\u00A0') : undefined
  }

  return (
    <Screen
      flush
      scrollOffset={headerScrollY}
      overlayHeader={
        <CollapsingAppBar
          scrollY={headerScrollY}
          revealAt={heroHeight - (insets.top + PINNED_BAR)}
          onBack={back}
          backLabel={t('common:action.back')}
        />
      }
    >
      <View
        className={cn('overflow-hidden', hasPhoto ? 'bg-track' : 'bg-pandan-soft')}
        style={{ marginTop: -insets.top, height: heroHeight }}
      >
        <View
          className="flex-1"
          style={hasPhoto ? undefined : { paddingTop: insets.top, paddingBottom: CONTENT_LIFT }}
        >
          <EntryPicture entry={food} ownerId={view.owner.id} iconSize={100} />
        </View>
      </View>

      <View
        className="gap-stack rounded-t-card bg-canvas px-gutter"
        style={{
          marginTop: -(spacing.stack + CONTENT_LIFT),
          paddingTop: CONTENT_LIFT + spacing.stack,
        }}
      >
        <View className="gap-2.5">
          <Text variant="title" numberOfLines={2}>
            {food.name}
          </Text>
          <View className="flex-row items-center justify-between gap-3">
            <Tappable
              onPress={() => openProfile(view.owner.id)}
              className="min-w-0 shrink flex-row items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5"
              accessibilityRole="button"
              accessibilityLabel={t('groups:openProfile', { name: view.owner.name })}
            >
              <PersonAvatar person={view.owner} size="xs" />
              <Text variant="caption" numberOfLines={1} className="shrink text-ink">
                {view.owner.name}
              </Text>
              <Icon set="ui" name="chevron-right" size={12} tintColor={colors.muted} />
            </Tappable>
            <Thumbs
              entryId={food.id}
              likes={food.likes ?? 0}
              dislikes={food.dislikes ?? 0}
              mine={food.mine ?? 0}
              isSelf={isSelf}
              pills
            />
          </View>
          <Text variant="meta">{metaLine}</Text>
        </View>
      </View>

      <Aside>
        <View
          className="gap-stack bg-canvas px-gutter"
          style={split ? { paddingTop: PINNED_BAR } : undefined}
        >
          <Card
            title={t('logging:detail.total')}
            action={
              <View className="max-w-[60%] rounded-full bg-pandan-soft px-3 py-1">
                <Text
                  variant="caption"
                  className="text-pandan-ink"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {servingBadge}
                </Text>
              </View>
            }
          >
            <View className="flex-row items-baseline gap-1.5">
              <Text variant="displayMd">{Math.round(food.kcal).toLocaleString()}</Text>
              <Text variant="label" className="text-muted">
                {t('common:unit.kcal')}
              </Text>
            </View>

            {share ? (
              <View className="h-3 flex-row overflow-hidden rounded-full bg-track">
                {share.carbs > 0 ? (
                  <View className="bg-kaya" style={{ flex: share.carbs }} />
                ) : null}
                {share.protein > 0 ? (
                  <View className="bg-hibiscus" style={{ flex: share.protein }} />
                ) : null}
                {share.fat > 0 ? <View className="bg-teh" style={{ flex: share.fat }} /> : null}
              </View>
            ) : null}

            <View className="flex-row">
              {MACROS.map((macro, index) => (
                <View
                  key={macro.key}
                  className={cn(
                    'min-w-0 flex-1',
                    index > 0 && 'border-l border-line pl-3',
                    index < MACROS.length - 1 && 'pr-2',
                  )}
                >
                  <View className="flex-row items-center gap-1.5">
                    <View className={cn('h-2.5 w-2.5 rounded-full', macro.dot)} />
                    <Text
                      variant="numeric"
                      className="shrink"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {t('common:unit.grams', { value: round1(food[macro.field]) })}
                    </Text>
                  </View>
                  <Text
                    variant="meta"
                    className="pl-4"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {t(`common:macro.${macro.key}`)}
                  </Text>
                </View>
              ))}
            </View>

            {hasExtras ? <Divider /> : null}

            {hasExtras ? (
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
            ) : null}

            {showNutrients ? (
              <View className="gap-2">
                {extras.map((row) => (
                  <View key={row.key} className="flex-row items-baseline justify-between gap-3">
                    <Text variant="body">{row.label}</Text>
                    <Text variant="label" className={row.value ? undefined : 'text-faint'}>
                      {row.value ?? '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>

          {ingredients.length > 0 ? (
            <Card title={t('logging:detail.plateTitle')} action={<MacrosToggle />}>
              {ingredients.map((ingredient) => {
                const amount = formatPartAmount(ingredient)
                return (
                  <View key={ingredient.id} className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-0.5">
                      <PartLine quantity={ingredient.quantity} name={ingredient.name}>
                        {amount && !showMacros ? <Text variant="meta">{` ${amount}`}</Text> : null}
                      </PartLine>
                      {showMacros ? (
                        <MacroFigures
                          carbs={ingredient.carbs_g}
                          protein={ingredient.protein_g}
                          fat={ingredient.fat_g}
                          lead={amount}
                        />
                      ) : null}
                    </View>
                    <View className="flex-row items-baseline gap-1">
                      <Text variant="numeric">{Math.round(ingredient.kcal).toLocaleString()}</Text>
                      <Text variant="caption">{t('common:unit.kcal')}</Text>
                    </View>
                  </View>
                )
              })}
              <Divider />
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
                <View className="flex-row items-baseline gap-1">
                  <Text variant="numeric">{Math.round(plateKcal).toLocaleString()}</Text>
                  <Text variant="caption">{t('common:unit.kcal')}</Text>
                </View>
              </View>
              {food.plate_quantity === 1 ? null : (
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text variant="bodyStrong">
                    {t('logging:detail.times', { amount: formatPortion(food.plate_quantity) })}
                  </Text>
                  <View className="flex-row items-baseline gap-1">
                    <Text variant="numeric">
                      {roundHalfUp(plateKcal * food.plate_quantity).toLocaleString()}
                    </Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
                </View>
              )}
            </Card>
          ) : null}
        </View>
      </Aside>
    </Screen>
  )
}
