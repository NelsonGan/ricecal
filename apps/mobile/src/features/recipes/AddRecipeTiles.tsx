import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Badge, Icon, type IconProps, Squish, Text } from '@/ui'

/** Which door into a new recipe was taken on the Recipes tab. */
export type RecipeStart = 'manual' | 'photo' | 'describe'

export type AddRecipeTilesProps = {
  onStart: (start: RecipeStart) => void
  /** Shows a Pro badge on Photo and Describe for free accounts. */
  proBadge?: string
}

/** The three add-recipe tiles inside the Recipes tab's Add sheet. */
export function AddRecipeTiles({ onStart, proBadge }: AddRecipeTilesProps) {
  const { t } = useTranslation('recipes')

  return (
    <View className="flex-row gap-2.5">
      <AddTile
        icon={{ set: 'system', name: 'guide-book' }}
        label={t('add.write')}
        onPress={() => onStart('manual')}
      />
      <AddTile
        icon={{ set: 'system', name: 'camera' }}
        label={t('add.photo')}
        badge={proBadge}
        onPress={() => onStart('photo')}
      />
      <AddTile
        icon={{ set: 'system', name: 'sparkle' }}
        label={t('add.describe')}
        badge={proBadge}
        onPress={() => onStart('describe')}
      />
    </View>
  )
}

function AddTile({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: IconProps
  label: string
  badge?: string
  onPress: () => void
}) {
  return (
    <Squish
      depth={4}
      radius={18}
      containerClassName="flex-1"
      slabClassName="bg-line"
      className="items-center gap-1.5 border-[3px] border-line bg-canvas px-2 py-3"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
    >
      {badge ? (
        <Badge tone="kaya" size="sm" className="absolute right-1.5 top-1.5">
          {badge}
        </Badge>
      ) : null}
      <Icon {...icon} size={36} />
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Squish>
  )
}
