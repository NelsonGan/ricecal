import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import type { VideoPlatform } from '@/data'
import { placeCategoryIcon } from '@/features/places/lib/placeIcons'
import { PlatformLogo } from '@/features/recipes/PlatformLogo'
import { UnitGroups } from '@/features/recipes/UnitGroups'
import { useMeasureText } from '@/features/shared/useMeasureText'
import { useThemeColors } from '@/theme/useTheme'
import { Avatar, Icon, Text } from '@/ui'
import { Tile, You } from './GroupsPreview'

/**
 * The 1.3.0 card's pictures, each drawn from the app's own pieces so it
 * follows the theme and the language. Every one is a single image to a screen
 * reader, with nothing to press.
 */

/**
 * The three logos on the video, in the order the owner asked for. The paste
 * sheet lists all seven; three are enough to say "a video from where you
 * already watch them" without a row of tiles crowding the picture.
 */
const LOGOS: VideoPlatform[] = ['tiktok', 'instagram', 'rednote']

/** A cooking video, an arrow, and the recipe it becomes. */
export function RecipeImportPreview() {
  const { t } = useTranslation('news')
  const colors = useThemeColors()
  const measure = useMeasureText()
  const rows = [
    { icon: 'yellow-noodles', amount: measure.amount(200, 'g') },
    { icon: 'coconut', amount: measure.amount(1, 'cup') },
    { icon: 'chilli', amount: measure.amount(2, 'tbsp') },
  ] as const

  return (
    <View
      className="flex-row items-center justify-center gap-2"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('recipeImport.previewLabel')}
    >
      <View>
        {/* Portrait, as a short video is. */}
        <View className="h-[132px] w-[96px] items-center justify-center overflow-hidden rounded-[16px] border-[3px] border-surface bg-inverse">
          <Icon set="dishes" name="laksa" size={74} />
        </View>
        {/* Across the video's foot, as the recipe card wears its logo. */}
        <View className="absolute -bottom-3 left-0 right-0 flex-row justify-center gap-1">
          {LOGOS.map((platform) => (
            <PlatformLogo key={platform} platform={platform} size={24} ring />
          ))}
        </View>
      </View>
      <Icon set="ui" name="arrow-right" size={22} tintColor={colors.surface} />
      <View className="w-[112px] gap-1.5 rounded-[18px] bg-surface p-2">
        <Text variant="label" numberOfLines={1} className="px-1">
          {t('recipeImport.exampleName')}
        </Text>
        {rows.map((row) => (
          <View
            key={row.icon}
            className="flex-row items-center gap-1.5 rounded-[12px] bg-surface-alt px-1.5 py-1"
          >
            <Icon set="food" name={row.icon} size={22} />
            <Text variant="caption" numberOfLines={1} className="shrink">
              {row.amount}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Friends, in the board's own tiles: a day of meals and a nudge. */
const BOARD = [
  { key: 'you', slots: ['nasi-lemak', 'chicken-rice', 'empty'] },
  { key: 'Aisha', slots: ['roti-canai', 'nudge', 'empty'] },
] as const

/**
 * The Social tab in miniature: the group pills, the group's day, and the feed
 * under it, which is the whole of what changed.
 */
export function SocialTabPreview() {
  const { t } = useTranslation(['news', 'groups', 'common'])
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:socialTab.previewLabel')}
    >
      <View className="w-[224px] gap-2.5 rounded-[22px] bg-surface p-3">
        {/* The pills as Social draws them: the group, then all groups. */}
        <View className="flex-row gap-1.5">
          <View className="shrink flex-row items-center gap-1 rounded-full border border-pandan-soft-line bg-pandan-soft py-1 pl-1 pr-2.5">
            <Icon set="food" name="rice-bowl" size={20} />
            <Text
              numberOfLines={1}
              className="shrink font-body-black text-[12px] leading-[16px] text-pandan-ink"
            >
              {t('news:socialTab.exampleGroup')}
            </Text>
          </View>
          <View className="shrink flex-row items-center gap-1 rounded-full border border-line bg-surface py-1 pl-1 pr-2.5">
            <Icon set="system" name="groups" size={20} />
            <Text
              numberOfLines={1}
              className="shrink font-body-black text-[12px] leading-[16px] text-muted"
            >
              {t('groups:title')}
            </Text>
          </View>
        </View>
        <View className="gap-1.5">
          {BOARD.map((row) => (
            <View key={row.key} className="flex-row items-center justify-between">
              {row.key === 'you' ? (
                <You />
              ) : (
                <Avatar name={row.key} fallback="initial" size="xs" tone="hibiscus" />
              )}
              {row.slots.map((slot, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed picture
                <Tile key={index} slot={slot} />
              ))}
            </View>
          ))}
        </View>
        {/* The feed, below the group's day. */}
        <View className="flex-row items-center gap-2 border-t-2 border-line pt-2.5">
          <Avatar name="Wei" fallback="initial" size="xs" tone="water" />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              Wei
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {`644 ${t('common:unit.kcal')}`}
            </Text>
          </View>
          <Icon set="dishes" name="nasi-lemak" size={34} />
          <Icon set="system" name="heart" size={20} />
        </View>
      </View>
    </View>
  )
}

/**
 * A place on a drawn map, wearing the food map's pin, over the entry page's
 * Where row. A drawing rather than the real map: a live map in a card that is
 * swiped past would load tiles for a picture, and it would need a place.
 */
export function MealPlacesPreview() {
  const { t } = useTranslation(['news', 'places'])
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:mealPlaces.previewLabel')}
    >
      <View className="w-[224px] overflow-hidden rounded-[22px] bg-surface">
        <View className="h-[112px] overflow-hidden bg-kaya-soft">
          {/* Streets and a park, in the warm tones of a street map. */}
          <View className="absolute left-0 right-0 top-[62px] h-2.5 bg-surface" />
          <View className="absolute bottom-0 left-[54px] top-0 w-2.5 bg-surface" />
          <View className="absolute bottom-0 right-[44px] top-0 w-2 bg-surface" />
          <View className="absolute right-3 top-3 h-10 w-14 rounded-[10px] bg-pandan-soft" />
          {/* The food map's pin: the plate eaten there, with how many meals. */}
          <View className="absolute left-[84px] top-3 items-center" style={{ paddingRight: 6 }}>
            <View className="h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full border-[3px] border-surface bg-surface">
              <Icon set="dishes" name="chicken-rice" size={40} />
            </View>
            <View
              style={{
                width: 0,
                height: 0,
                marginTop: -2,
                borderLeftWidth: 7,
                borderRightWidth: 7,
                borderTopWidth: 8,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
              }}
              className="border-t-surface"
            />
            <View className="absolute -top-1 right-0 h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-ink px-1">
              <Text variant="micro" className="text-surface">
                3
              </Text>
            </View>
          </View>
        </View>
        <View className="flex-row items-center gap-2.5 px-3 py-2.5">
          <Icon {...placeCategoryIcon('FoodMarket')} size={30} />
          <View className="min-w-0 flex-1">
            <Text variant="caption">{t('places:where')}</Text>
            {/* A place's name is data, never translated, as Apple Maps gives it. */}
            <Text variant="label" numberOfLines={1}>
              Maxwell Food Centre
            </Text>
            <Text variant="meta" numberOfLines={1}>
              1 Kadayanallur St
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}

/**
 * A rice bowl measured in cups, over the food page's own unit picker with
 * cups chosen. The picker is the real one, drawn with nothing to press.
 */
export function KitchenUnitsPreview() {
  const { t } = useTranslation(['news', 'common'])
  const measure = useMeasureText()
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:kitchenUnits.previewLabel')}
    >
      <View className="w-[224px] gap-2.5 rounded-[22px] bg-surface p-3" pointerEvents="none">
        <View className="flex-row items-center gap-2 px-1">
          <Icon set="food" name="rice-bowl" size={30} />
          <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
            {measure.amount(1, 'cup')}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {`206 ${t('common:unit.kcal')}`}
          </Text>
        </View>
        <UnitGroups keys={['g', 'oz', 'tsp', 'tbsp', 'cup']} value="cup" onChange={() => {}} />
      </View>
    </View>
  )
}
