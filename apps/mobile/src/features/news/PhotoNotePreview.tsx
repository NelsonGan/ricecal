import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Icon, Text } from '@/ui'

/** Two of the question's own one-tap answers, the ones a photo is worst at. */
const CHIPS = ['shared', 'lessRice'] as const

/**
 * The camera's new step in miniature: the plate filling the frame, then the
 * question under it with two of its one-tap answers. The real panel's words in
 * the reader's language, so the page shows what they will meet after the
 * shutter. The chips are drawn rather than `Chip`s, a picture having nothing
 * to press.
 */
export function PhotoNotePreview() {
  const { t } = useTranslation(['news', 'logging'])

  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:photoNote.previewLabel')}
    >
      <View className="w-[208px] gap-2.5 overflow-hidden rounded-[22px] bg-surface p-2.5">
        <View className="h-[112px] items-center justify-center rounded-[16px] bg-inverse">
          <Icon set="dishes" name="nasi-lemak" size={84} />
        </View>
        <View className="gap-2 px-1 pb-1">
          <Text variant="label" numberOfLines={1}>
            {t('logging:photoNote.title')}
          </Text>
          <View className="flex-row gap-1.5">
            {CHIPS.map((key) => (
              <View key={key} className="rounded-full border-2 border-line px-2.5 py-1">
                <Text variant="caption" numberOfLines={1}>
                  {t(`logging:photoNote.suggestion.${key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
