import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSelectedDate, useSettings } from '@/data'
import { type GroupFoodView, useGroupFood } from '@/data/groups'
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
import { convert, MEASURES, type MeasureUnit, roundedFor } from '@/lib/measures'
import { useBack } from '@/lib/navigation'
import { roundHalfUp } from '@/lib/nutrition'
import { formatPortion, portionLabel } from '@/lib/portions'
import { spacing } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { Card, CollapsingAppBar, cn, Divider, Icon, Screen, Skeleton, Tappable, Text } from '@/ui'
import { EntryPicture, PersonAvatar, useOpenProfile } from './parts'

/** The fixed controls' row, as on the owner's own food page. */
const PINNED_BAR = spacing.sm * 2 + 44
/** How far the content's curve rides up over the picture. */
const CONTENT_LIFT = 22

/** Carbs, protein and fat, in the colours every chart in the app uses. */
const MACROS = [
  { key: 'carbs_g', label: 'macro.carbs', tile: 'bg-kaya-soft', ink: 'text-kaya-ink' },
  { key: 'protein_g', label: 'macro.protein', tile: 'bg-hibiscus-soft', ink: 'text-hibiscus-ink' },
  { key: 'fat_g', label: 'macro.fat', tile: 'bg-teh-soft', ink: 'text-teh-ink' },
] as const

/**
 * A group member's food, opened from its card in the chat, drawn as the
 * owner's own page draws it but read only: the plate across the top, the
 * portion they ate, the total with every nutrient, and each part on the plate.
 * The owner's face sits under the name and opens their feed. Nothing here
 * edits, logs or shares someone else's food.
 */
export function GroupFoodScreen({ groupId, entryId }: { groupId: string; entryId: string }) {
  const { t } = useTranslation(['groups', 'logging', 'common'])
  const back = useBack('/social')
  const query = useGroupFood(groupId, entryId)
  const insets = useSafeAreaInsets()
  const scrollY = useSharedValue(0)
  const view = query.data
  const heroHeight = (view?.entry.photo_path ? 298 : 198) + CONTENT_LIFT + insets.top
  return (
    <Screen
      flush
      scrollOffset={scrollY}
      overlayHeader={
        <CollapsingAppBar
          scrollY={scrollY}
          revealAt={heroHeight - (insets.top + PINNED_BAR)}
          onBack={back}
          backLabel={t('common:action.back')}
        />
      }
    >
      {!view ? (
        <View className="gap-stack px-gutter" style={{ paddingTop: insets.top + PINNED_BAR }}>
          {query.isError || query.fetchStatus === 'paused' || view === null ? (
            <QueryNotice
              error={query.isError}
              paused={query.fetchStatus === 'paused'}
              unavailable
              retry={() => query.refetch()}
            />
          ) : (
            <>
              <Skeleton className="h-[220px] w-full rounded-card" />
              <Card>
                <Skeleton className="h-[160px] w-full" />
              </Card>
            </>
          )}
        </View>
      ) : (
        <FoodBody view={view} heroHeight={heroHeight} />
      )}
    </Screen>
  )
}

export function FoodBody({ view, heroHeight }: { view: GroupFoodView; heroHeight: number }) {
  const { t } = useTranslation(['groups', 'logging', 'common'])
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const openProfile = useOpenProfile()
  const { todayKey } = useSelectedDate()
  const words = usePortionWords()
  const measureText = useMeasureText()
  const units = useSettings().data?.units
  const [showMacros] = usePartMacros()
  const [showNutrients, setShowNutrients] = useState(false)
  const { entry, owner, parts } = view

  // How much they ate, as the diary says it: "1.5 plates", "350 g". A plate of
  // parts counts the plate; anything else counts its serving.
  const plate = parts.length > 0 ? entry.plate_quantity : 1
  const eaten = roundHalfUp(entry.quantity * plate, 2)
  // Which unit the portion was measured in, if any, so a weight is not said
  // twice ("150 g · ≈ 150 g") in any language.
  const measured: { unit: MeasureUnit | null } = { unit: null }
  const portion =
    portionLabel(eaten, entry.serving_label, {
      ...words,
      measured: (amount, unit) => {
        measured.unit = unit
        return words.measured(amount, unit)
      },
    }) ?? words.servings(eaten)
  // What that weighs, in the viewer's own units, beside a portion that is not
  // itself a weight or a volume.
  const weighs = (() => {
    if (!entry.grams || entry.grams <= 0) return null
    const unit = measured.unit
    if (unit && (MEASURES[unit].family === 'weight' || unit === 'ml')) return null
    const shown = units === 'imperial' ? 'oz' : 'g'
    const amount = roundedFor(shown, convert(entry.grams, 'g', shown))
    return amount > 0 ? measureText.amount(amount, shown) : null
  })()
  const portionText = weighs ? `${portion} · ≈ ${weighs}` : portion

  const extras = [
    { key: 'fibre', label: t('logging:detail.fibre'), value: entry.fibre_g, unit: 'g' },
    { key: 'sugar', label: t('logging:detail.sugar'), value: entry.sugar_g, unit: 'g' },
    { key: 'sodium', label: t('logging:detail.sodium'), value: entry.sodium_mg, unit: 'mg' },
  ].filter((row) => row.value !== null)
  const plateKcal = parts.reduce((sum, part) => sum + part.kcal, 0)
  // The share of the plate eaten. Each part arrives rounded to the calorie, but
  // the diary rounds the plate once from the unrounded parts, so the parts times
  // the share can sit a calorie or two off the total above (787 × 1½ read 1,181
  // under a total of 1,180). Within that rounding the line is the diary's own
  // figure; further off, the owner typed the total, and the line keeps what the
  // parts come to.
  const scaledKcal = plateKcal * plate
  const roundingSlack = (parts.length / 2) * plate + 0.5
  const eatenKcal =
    Math.abs(entry.kcal - scaledKcal) <= roundingSlack
      ? Math.round(entry.kcal)
      : roundHalfUp(scaledKcal)

  return (
    <>
      {/* The plate, behind the status bar as on the owner's page. */}
      <View
        className={cn('overflow-hidden bg-track', !entry.photo_path && 'bg-pandan-soft')}
        style={{ marginTop: -insets.top, height: heroHeight }}
      >
        <EntryPicture entry={entry} ownerId={owner.id} iconSize={100} />
      </View>

      <View
        className="gap-stack rounded-t-card bg-canvas px-gutter"
        style={{
          marginTop: -(spacing.stack + CONTENT_LIFT),
          paddingTop: CONTENT_LIFT + spacing.stack,
        }}
      >
        {/* The name, whose it is and when, as one heading block. */}
        <View className="items-start gap-2">
          <Text variant="title" numberOfLines={2}>
            {entry.name}
          </Text>
          <Tappable
            onPress={() => openProfile(owner.id)}
            className="flex-row items-center gap-1.5 rounded-full bg-surface-alt py-1 pl-1 pr-2.5"
            accessibilityRole="button"
            accessibilityLabel={t('groups:openProfile', { name: owner.name })}
          >
            <PersonAvatar person={owner} size="xs" />
            <Text variant="caption" numberOfLines={1} className="text-ink">
              {owner.name}
            </Text>
            <Icon set="ui" name="chevron-right" size={12} tintColor={colors.muted} />
          </Tappable>
          <Text variant="meta">
            {t('logging:detail.whenValue', {
              // The owner's diary day, as their own page says it: supper at
              // 00:30 belongs to the day they put it on (README, `log_date`).
              day: dayLabel(entry.log_date, todayKey, {
                today: t('common:date.today'),
                yesterday: t('common:date.yesterday'),
              }),
              time: formatTime(entry.logged_at),
            })}
          </Text>
        </View>

        {/* The portion rides on the total's title line, as a pill, rather
            than taking a card of its own for one line. */}
        <Card
          title={t('logging:detail.total')}
          action={
            <View className="max-w-[62%] rounded-full bg-pandan-soft px-3 py-1">
              <Text
                variant="caption"
                className="text-pandan-ink"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {portionText}
              </Text>
            </View>
          }
        >
          <View className="flex-row items-baseline gap-1.5">
            <Text variant="displayMd">{Math.round(entry.kcal).toLocaleString()}</Text>
            <Text variant="label" className="text-muted">
              {t('common:unit.kcal')}
            </Text>
          </View>
          {/* Three tiles rather than bars: a bar measures against a target,
              and the viewer's targets say nothing about someone else's meal. */}
          <View className="flex-row gap-2">
            {MACROS.map((macro) => (
              <View
                key={macro.key}
                className={cn('min-w-0 flex-1 gap-0.5 rounded-tile px-3 py-2.5', macro.tile)}
              >
                <Text variant="caption" numberOfLines={1} className={macro.ink}>
                  {t(`common:${macro.label}`)}
                </Text>
                <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit>
                  {t('common:unit.grams', { value: Math.round(entry[macro.key]) })}
                </Text>
              </View>
            ))}
          </View>
          {extras.length ? (
            <>
              <Divider />
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
            </>
          ) : null}
          {showNutrients ? (
            <View className="gap-2">
              {extras.map((row) => (
                <View key={row.key} className="flex-row items-baseline justify-between gap-3">
                  <Text variant="body">{row.label}</Text>
                  <Text variant="label">
                    {row.unit === 'mg'
                      ? t('logging:detail.milligrams', { value: Math.round(row.value ?? 0) })
                      : t('common:unit.grams', { value: roundHalfUp(row.value ?? 0, 1) })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* What the plate is made of, as the owner's own ingredient card
                reads it: the same rows, amounts and Macros switch, without the
                pencil. Only when something broke it down. */}
        {parts.length ? (
          <Card title={t('logging:detail.plateTitle')} action={<MacrosToggle />}>
            {parts.map((part) => {
              const unit = partUnit(part, units)
              const amount = unit
                ? measureText.amount(shownIn(part, unit), unit).replace(/ /g, ' ')
                : undefined
              return (
                <View key={part.id} className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-0.5">
                    <PartLine quantity={part.quantity} name={part.name}>
                      {amount && !showMacros ? <Text variant="meta">{` ${amount}`}</Text> : null}
                    </PartLine>
                    {showMacros ? (
                      <MacroFigures
                        carbs={part.carbs}
                        protein={part.protein}
                        fat={part.fat}
                        lead={amount}
                      />
                    ) : null}
                  </View>
                  <View className="flex-row items-baseline gap-1">
                    <Text variant="numeric">{part.kcal.toLocaleString()}</Text>
                    <Text variant="caption">{t('common:unit.kcal')}</Text>
                  </View>
                </View>
              )
            })}
            <Divider />
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="bodyStrong">{t('logging:detail.plateTotal')}</Text>
              <View className="flex-row items-baseline gap-1">
                <Text variant="numeric">{plateKcal.toLocaleString()}</Text>
                <Text variant="caption">{t('common:unit.kcal')}</Text>
              </View>
            </View>
            {/* Under the plate it scales, when not all of it was eaten. */}
            {plate === 1 ? null : (
              <View className="flex-row items-baseline justify-between gap-3">
                <Text variant="bodyStrong">
                  {t('logging:detail.times', { amount: formatPortion(plate) })}
                </Text>
                <View className="flex-row items-baseline gap-1">
                  <Text variant="numeric">{eatenKcal.toLocaleString()}</Text>
                  <Text variant="caption">{t('common:unit.kcal')}</Text>
                </View>
              </View>
            )}
          </Card>
        ) : null}
      </View>
    </>
  )
}
