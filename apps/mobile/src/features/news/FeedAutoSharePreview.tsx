import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { storedImageSource, useAvatarUrl, useProfile } from '@/data'
import { FoodPreview } from '@/features/social/components'
import { Avatar, Icon, Text } from '@/ui'

/**
 * What an automatic post looks like, drawn with the feed's own pieces rather
 * than a screenshot, so it follows the theme and the language and never goes
 * stale against the real card. The author is the reader, with their own
 * picture, because the point is that this is what their meals will look like.
 *
 * The dish is an example and its figures are made up. Food names are data and
 * stay in their local spelling in every language, so it is not translated.
 */
export function FeedAutoSharePreview() {
  const { t } = useTranslation(['news', 'social'])
  const { data: profile } = useProfile()
  const { data: avatarUri } = useAvatarUrl(profile?.avatar_path ?? undefined)
  const avatar = storedImageSource(profile?.avatar_path ?? undefined, avatarUri)

  return (
    // A picture to VoiceOver, not a post it could try to like.
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:feedAutoShare.previewLabel')}
    >
      <View className="w-[208px] overflow-hidden rounded-[22px] bg-surface">
        <View className="flex-row items-center gap-2.5 px-3 py-2.5">
          <Avatar
            name={profile?.display_name ?? ''}
            uri={avatar?.uri}
            cacheKey={avatar?.cacheKey}
            size="sm"
            tone="pandan"
          />
          <View className="min-w-0 flex-1">
            <Text variant="label" numberOfLines={1}>
              {t('news:feedAutoShare.you')}
            </Text>
            <Text variant="caption">{t('social:justNow')}</Text>
          </View>
        </View>
        {/* The profile grid's tile rather than the feed's full card: the same
            drawing and caption at half the height, so the card's words and
            buttons still fit on a small phone. Inset so the post keeps a white
            edge against the tinted panel. */}
        <View className="px-2.5">
          <FoodPreview
            variant="tile"
            name="Nasi lemak"
            icon={{ set: 'dishes', name: 'nasi-lemak' }}
            facts={{ kcal: 644, carbs_g: 78, protein_g: 24, fat_g: 28 }}
          />
        </View>
        <View className="flex-row items-center gap-4 px-3 py-2.5">
          <Icon set="system" name="heart" size={22} />
          <Icon set="system" name="chat" size={22} />
        </View>
      </View>
    </View>
  )
}
