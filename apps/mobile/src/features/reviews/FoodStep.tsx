import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { ReviewMeal, ReviewSummary } from '@/data'
import { storedImageSource, useMealPhotoUrl } from '@/data'
import { MealPhoto } from '@/features/shared'
import { energyShare } from '@/lib/nutrition'
import { Card, cn, Divider, Icon, Text } from '@/ui'
import { Shareable } from './ShareableCards'

export type FoodStepProps = {
  summary: ReviewSummary
  meals: readonly ReviewMeal[]
}

/** The three macro colours, in the order every chart in the app stacks them. */
const MACROS = [
  { key: 'carbs', fill: 'bg-kaya', label: 'common:macro.carbs' },
  { key: 'protein', fill: 'bg-hibiscus', label: 'common:macro.protein' },
  { key: 'fat', fill: 'bg-teh', label: 'common:macro.fat' },
] as const

/**
 * The picture beside a dish. Smaller than the diary's 72pt tile, because five
 * of these sit on one card rather than filling a screen, and a row here is a
 * line of a list rather than something to tap.
 *
 * Literal class strings rather than a number interpolated into one: NativeWind
 * compiles its stylesheet from the source text, so a class it cannot read
 * before the app runs produces no style at all.
 */
const TILE = 'h-11 w-11'
/** The drawing inside that box, at the size it was before the box existed. */
const TILE_ICON = 38

/** A dish with neither a photograph nor a drawing. The diary's own stand-in. */
const PLACEHOLDER_ICON = { set: 'food', name: 'empty-plate' } as const

/**
 * What was actually eaten.
 *
 * THE BIGGEST PLATES, heaviest first. This listed the most-repeated dishes for
 * about a day, and counting repeats turned out to assume something this diary
 * does not provide: a scanned plate is named by a model and a searched one by
 * the catalogue, so one dish eaten four times is often four names counted once
 * each. Calories need no such agreement — see the header on `review_meals`.
 *
 * Nothing on a row says how many times, for the same reason. A "1x" beside
 * every line is a column of ones claiming to mean something.
 *
 * The bar under each name is that dish's own macro split, and the card under
 * the list is the period's. Two readings of one colour scheme: the second says
 * where the calories came from overall, and the first says which plate is
 * responsible for it.
 *
 * EACH ROW LEADS WITH THE PHOTOGRAPH somebody took of it, and falls back to a
 * drawing. This listed drawings alone, which made a camera user's biggest week
 * five copies of the same outline: the photo is the one thing on this screen
 * that says the meal was theirs rather than a row in a catalogue.
 */
export function FoodStep({ summary, meals }: FoodStepProps) {
  const { t } = useTranslation(['reviews', 'common'])

  const split = energyShare({
    carbs: summary.carbs ?? 0,
    protein: summary.protein ?? 0,
    fat: summary.fat ?? 0,
  })
  const grams = { carbs: summary.carbs, protein: summary.protein, fat: summary.fat }

  return (
    <>
      <Shareable title={t('reviews:food.title')}>
        {/* `gap-0` so the rows sit on their own dividers, and the list carries
            the space under the heading itself — a header hard against its first
            row reads as part of that row. */}
        <Card title={t('reviews:food.title')} contentClassName="gap-0 p-card">
          <View className="mt-4">
            {meals.map((meal, index) => (
              <View key={meal.name}>
                {index > 0 ? <Divider className="my-3" /> : null}
                <MealRow meal={meal} />
              </View>
            ))}
          </View>
        </Card>
      </Shareable>

      <Shareable title={t('reviews:food.macros')}>
        <Card title={t('reviews:food.macros')} contentClassName="gap-3 p-card">
          {/* `mt-1` on top of the card's own gap: sixteen points under a
              heading, which is what every card in a story gives its own. */}
          <View className="mt-1 h-5 flex-row overflow-hidden rounded-full bg-track">
            {MACROS.map((macro) =>
              split[macro.key] <= 0 ? null : (
                <View
                  key={macro.key}
                  className={macro.fill}
                  style={{ flexGrow: split[macro.key], flexBasis: 0 }}
                />
              ),
            )}
          </View>

          <View className="flex-row gap-2.5">
            {MACROS.map((macro) => (
              <View key={macro.key} className="min-w-0 flex-1 gap-1">
                <View className="flex-row items-center gap-1.5">
                  <View className={cn('h-2.5 w-2.5 rounded-[3px]', macro.fill)} />
                  <Text variant="overlineSm" numberOfLines={1}>
                    {t(macro.label)}
                  </Text>
                </View>
                <Text className="font-display text-[17px] text-ink" numberOfLines={1}>
                  {t('reviews:food.grams', { value: Math.round(grams[macro.key] ?? 0) })}
                </Text>
                <Text variant="micro" numberOfLines={1}>
                  {t('reviews:food.share', { value: Math.round(split[macro.key] * 100) })}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </Shareable>
    </>
  )
}

/**
 * One plate: its picture, its name, what one of them cost, and its own split.
 *
 * A component rather than a loop body because the photograph is a HOOK — the
 * bucket is private, so a stored key is one signature away from being
 * renderable, and five keys asked for in the same frame are signed in one
 * request (see `BATCH_WINDOW_MS` in `data/photos.ts`). Nothing waits on it: the
 * row draws, and the tile fills in or stays a drawing.
 */
function MealRow({ meal }: { meal: ReviewMeal }) {
  const share = energyShare(meal)
  const { data: photoUrl } = useMealPhotoUrl(meal.photoPath)
  const photo = storedImageSource(meal.photoPath, photoUrl)

  return (
    <View className="flex-row items-center gap-3">
      {/* The box is the same whether it holds a photograph or a drawing, so a
          list of both keeps one text column. No `bg-track` under it: a tinted
          square behind an icon that has never had one would make every row
          without a photo read as a plate that failed to load. */}
      <View className={cn(TILE, 'items-center justify-center overflow-hidden rounded-tile')}>
        {photo ? (
          <MealPhoto source={photo} accessibilityLabel={meal.name} />
        ) : (
          /* Spread rather than two named props: `IconRef` is a union of
             set-and-name PAIRS, and splitting it lets a name from one set
             typecheck against another. */
          <Icon {...(meal.icon ?? PLACEHOLDER_ICON)} size={TILE_ICON} />
        )}
      </View>

      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row items-center gap-2">
          <Text variant="label" numberOfLines={1} className="min-w-0 flex-1 text-ink">
            {meal.name}
          </Text>
          <Text variant="label" className="text-ink">
            {meal.kcal.toLocaleString()}
          </Text>
        </View>

        {/* The split as a bar rather than as three percentages: five rows of
            "44/29/27" is a table nobody reads, and the colours are already the
            ones the rest of the app uses for these three. */}
        <View className="h-1.5 flex-row overflow-hidden rounded-full bg-track">
          {MACROS.map((macro) =>
            share[macro.key] <= 0 ? null : (
              <View
                key={macro.key}
                className={macro.fill}
                style={{ flexGrow: share[macro.key], flexBasis: 0 }}
              />
            ),
          )}
        </View>
      </View>
    </View>
  )
}
