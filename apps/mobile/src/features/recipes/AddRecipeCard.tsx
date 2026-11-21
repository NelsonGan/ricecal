import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Card, Icon, type IconProps, Squish, Text } from '@/ui'

/** Which door into a new recipe was taken. `/recipe/edit?start=` carries it. */
export type RecipeStart = 'manual' | 'photo' | 'describe'

export type AddRecipeCardProps = {
  onStart: (start: RecipeStart) => void
}

/**
 * The three ways in, at the top of your own shelf.
 *
 * On the shelf rather than behind the plus alone, because the choice between
 * them is the first thing a new recipe asks, and answering it here saves the
 * chooser page in between. The plus still opens that page, for whoever reached
 * for it first.
 */
export function AddRecipeCard({ onStart }: AddRecipeCardProps) {
  const { t } = useTranslation('recipes')

  return (
    <Card title={t('add.title')} contentClassName="gap-3">
      <View className="flex-row gap-2.5">
        <AddTile
          icon={{ set: 'system', name: 'guide-book' }}
          label={t('add.write')}
          onPress={() => onStart('manual')}
        />
        <AddTile
          icon={{ set: 'system', name: 'camera' }}
          label={t('add.photo')}
          onPress={() => onStart('photo')}
        />
        <AddTile
          icon={{ set: 'system', name: 'sparkle' }}
          label={t('add.describe')}
          onPress={() => onStart('describe')}
        />
      </View>
    </Card>
  )
}

function AddTile({
  icon,
  label,
  onPress,
}: {
  icon: IconProps
  label: string
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
      accessibilityLabel={label}
    >
      <Icon {...icon} size={36} />
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Squish>
  )
}
