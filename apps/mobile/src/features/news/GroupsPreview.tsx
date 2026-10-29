import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { storedImageSource, useAvatarUrl, useProfile } from '@/data'
import type { IconRef } from '@/data/types'
import { FoodPreview } from '@/features/social/components'
import { Avatar, type AvatarProps, cn, Icon, Text } from '@/ui'

type AvatarTone = NonNullable<AvatarProps['tone']>
/** A drawing from the dishes set, as the board draws an entry. */
type Dish = Extract<IconRef, { set: 'dishes' }>['name']

/** A day on the board: a dish, nothing yet, or a missed meal waiting for a nudge. */
type Slot = Dish | 'empty' | 'nudge'

/**
 * Two friends and the reader, breakfast to dinner. Names only feed the
 * initials: the picture is one image to a screen reader.
 */
const FRIENDS: { name: string; tone: AvatarTone; slots: [Slot, Slot, Slot] }[] = [
  { name: 'Aisha', tone: 'hibiscus', slots: ['roti-canai', 'laksa', 'empty'] },
  { name: 'Wei', tone: 'water', slots: ['kaya-toast', 'nudge', 'empty'] },
]
const YOURS: [Slot, Slot, Slot] = ['nasi-lemak', 'chicken-rice', 'empty']

/** The reader's own face, as the feed page draws it. */
function You() {
  const { data: profile } = useProfile()
  const { data: avatarUri } = useAvatarUrl(profile?.avatar_path ?? undefined)
  const avatar = storedImageSource(profile?.avatar_path ?? undefined, avatarUri)
  return (
    <Avatar
      name={profile?.display_name ?? ''}
      uri={avatar?.uri}
      cacheKey={avatar?.cacheKey}
      size="xs"
      tone="pandan"
    />
  )
}

function Tile({ slot }: { slot: Slot }) {
  return (
    <View
      className={cn(
        'h-[40px] w-[40px] items-center justify-center rounded-[12px]',
        slot === 'nudge' ? 'bg-hibiscus-soft' : 'bg-surface-alt',
      )}
    >
      {slot === 'nudge' ? (
        <Icon set="system" name="wave" size={22} />
      ) : slot === 'empty' ? (
        <View className="h-[3px] w-3 rounded-full bg-line-strong" />
      ) : (
        <Icon set="dishes" name={slot} size={30} />
      )}
    </View>
  )
}

/**
 * A group's day in miniature, with the board's own tiles: everybody's meals
 * side by side, and the wave on a friend's missed lunch that sends a nudge.
 */
export function GroupsBoardPreview() {
  const { t } = useTranslation('news')
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('groupsBoard.previewLabel')}
    >
      <View className="w-[208px] gap-2 rounded-[22px] bg-surface p-3">
        {[
          { key: 'you', face: <You />, slots: YOURS },
          ...FRIENDS.map((friend) => ({
            key: friend.name,
            face: <Avatar name={friend.name} fallback="initial" size="xs" tone={friend.tone} />,
            slots: friend.slots,
          })),
        ].map((row) => (
          <View key={row.key} className="flex-row items-center justify-between">
            {row.face}
            {row.slots.map((slot, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed picture
              <Tile key={index} slot={slot} />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * A meal shared in the chat, as the chat draws a food card, with reactions
 * tucked under it and an emoji answer. No words in the bubbles, so the picture
 * reads the same in every language.
 */
export function GroupsChatPreview() {
  const { t } = useTranslation(['news', 'onboarding'])
  return (
    <View
      className="items-center"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('news:groupsChat.previewLabel')}
    >
      <View className="w-[208px] gap-4 rounded-[22px] bg-canvas p-3">
        <View className="flex-row items-end gap-2">
          <Avatar name="Aisha" fallback="initial" size="xs" tone="hibiscus" />
          <View className="flex-1">
            <View className="overflow-hidden rounded-[18px] bg-surface p-1.5">
              <FoodPreview
                variant="tile"
                name={t('onboarding:tutorial.read.exampleName')}
                icon={{ set: 'dishes', name: 'nasi-lemak' }}
                facts={{ kcal: 644, carbs_g: 78, protein_g: 24, fat_g: 28 }}
              />
            </View>
            {/* Tucked over the bubble's corner, as the chat tucks them. */}
            <View className="absolute -bottom-3 right-2 flex-row items-center gap-0.5 rounded-full border-2 border-canvas bg-surface px-1.5 py-0.5">
              <Text className="text-[14px] leading-[21px]">❤️</Text>
              <Text className="text-[14px] leading-[21px]">🔥</Text>
              <Text variant="micro" className="ml-0.5 font-body-bold text-muted">
                3
              </Text>
            </View>
          </View>
        </View>
        <View className="self-end rounded-[18px] bg-pandan px-3 py-1">
          <Text className="text-[22px] leading-[30px]">😋</Text>
        </View>
      </View>
    </View>
  )
}
