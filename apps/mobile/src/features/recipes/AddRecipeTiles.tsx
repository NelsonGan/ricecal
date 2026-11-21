import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Badge, cn, Icon, type IconProps, Squish, Text } from '@/ui'

/** Which door into a new recipe was taken on the Recipes tab. */
export type RecipeStart = 'manual' | 'photo' | 'describe' | 'video'

export type AddRecipeTilesProps = {
  onStart: (start: RecipeStart) => void
  /** Shows a Pro badge on Photo and Describe for free accounts. */
  proBadge?: string
}

/**
 * The four add-recipe tiles inside the Recipes tab's Add sheet. Video carries
 * no Pro badge: a free account imports five a month, which the sheet's own
 * caption says once it is open.
 */
export function AddRecipeTiles({ onStart, proBadge }: AddRecipeTilesProps) {
  const { t } = useTranslation('recipes')

  return (
    <View className="flex-row gap-2.5">
      <AddTile
        icon={{ set: 'system', name: 'guide-book' }}
        label={t('add.write')}
        roomForBadge={Boolean(proBadge)}
        onPress={() => onStart('manual')}
      />
      <AddTile
        icon={{ set: 'system', name: 'camera' }}
        label={t('add.photo')}
        badge={proBadge}
        roomForBadge={Boolean(proBadge)}
        onPress={() => onStart('photo')}
      />
      <AddTile
        icon={{ set: 'system', name: 'sparkle' }}
        label={t('add.describe')}
        badge={proBadge}
        roomForBadge={Boolean(proBadge)}
        onPress={() => onStart('describe')}
      />
      <AddTile
        icon={{ set: 'system', name: 'video' }}
        label={t('add.video')}
        roomForBadge={Boolean(proBadge)}
        onPress={() => onStart('video')}
      />
    </View>
  )
}

function AddTile({
  icon,
  label,
  badge,
  roomForBadge = false,
  onPress,
}: {
  icon: IconProps
  label: string
  badge?: string
  /**
   * Room above the icon for a badge, on every tile in the row so they stay
   * level. Four tiles to a row leave the badge no corner beside the icon, and
   * the tile clips anything that hangs outside it.
   */
  roomForBadge?: boolean
  onPress: () => void
}) {
  return (
    <Squish
      depth={4}
      radius={18}
      containerClassName="flex-1"
      slabClassName="bg-line"
      className={cn(
        'items-center gap-1.5 border-[3px] border-line bg-canvas px-2 py-3',
        roomForBadge && 'pt-6',
      )}
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
