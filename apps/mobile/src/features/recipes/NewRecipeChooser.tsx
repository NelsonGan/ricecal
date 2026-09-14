import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { cn, Icon, type IconProps, Squish, Text } from '@/ui'

export type NewRecipeChooserProps = {
  onManual: () => void
  onPhoto: () => void
  onDescribe: () => void
}

/** The first page of a new food: one manual path, then the two AI inputs. */
export function NewRecipeChooser({ onManual, onPhoto, onDescribe }: NewRecipeChooserProps) {
  const { t } = useTranslation('recipes')

  return (
    <View className="gap-6">
      <Squish
        depth={6}
        radius={22}
        slabClassName="bg-pandan-soft-line"
        className="flex-row items-center gap-4 border-[3px] border-pandan bg-pandan-soft px-5 py-5"
        onPress={onManual}
        accessibilityRole="button"
        accessibilityLabel={t('new.manualLabel')}
      >
        <View className="h-[52px] w-[52px] items-center justify-center rounded-md bg-surface">
          <Icon set="food" name="cooking-pot" size={38} />
        </View>
        <Text variant="subtitle" className="min-w-0 flex-1">
          {t('new.manualLabel')}
        </Text>
        <Icon set="ui" name="chevron-right" size={20} />
      </Squish>

      <View className="gap-2.5">
        <Text variant="label">{t('new.aiLabel')}</Text>
        <View className="flex-row gap-2.5">
          <AiOption
            icon={{ set: 'system', name: 'camera' }}
            label={t('new.scanLabel')}
            tone="water"
            onPress={onPhoto}
          />
          <AiOption
            icon={{ set: 'system', name: 'sparkle' }}
            label={t('new.describeLabel')}
            tone="kaya"
            onPress={onDescribe}
          />
        </View>
      </View>
    </View>
  )
}

function AiOption({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: IconProps
  label: string
  tone: 'water' | 'kaya'
  onPress: () => void
}) {
  return (
    <Squish
      depth={5}
      radius={22}
      containerClassName="flex-1"
      slabClassName={tone === 'water' ? 'bg-water-soft-line' : 'bg-kaya-soft-line'}
      className={cn(
        'items-center gap-2 border-[3px] px-3 py-4',
        tone === 'water' ? 'border-water bg-water-soft' : 'border-kaya bg-kaya-soft',
      )}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon {...icon} size={30} />
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
    </Squish>
  )
}
