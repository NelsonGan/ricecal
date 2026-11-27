import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { useReducedMotion, ZoomIn } from 'react-native-reanimated'

import { ONBOARDING_ART, OnboardingStep, ShowcaseFrame } from '@/features/onboarding'
import { Avatar, AvatarGroup, Icon, Text } from '@/ui'

/**
 * The sample post. A person's name and a dish are not translated, so both are
 * written here rather than in a bundle.
 */
const POST = { author: 'Lina', dish: 'Laksa', kcal: 482, likes: 12 }
/** When a friend's like lands on the sample post, after the screen has settled. */
const LIKE_AT_MS = 900

const MEMBERS = ['Aisyah', 'Wei Ling', 'Priya', 'Daniel', 'Hafiz', 'Mei', 'Arun', 'Siti']

/**
 * A showcase between the questions: the feed and groups.
 *
 * A post the way the feed draws one (a photo with the dish and its figure
 * laid over it) and a group under it. Before `source`, whose answers include
 * "Friend or family", so the question lands just after the reason to bring one.
 */
export default function SocialStep() {
  const { t } = useTranslation(['onboarding', 'groups', 'social', 'common'])
  const router = useRouter()
  const likes = useLikeLanding()

  return (
    <OnboardingStep
      name="social"
      art={{ art: 'friends' }}
      title={t('social.title')}
      subtitle={t('social.subtitle')}
      onBack={() => router.dismissTo('/(onboarding)/workouts-showcase')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/(onboarding)/source')}
    >
      <ShowcaseFrame
        accessibilityLabel={`${POST.author}, ${POST.dish}, ${POST.kcal} ${t('common:unit.kcal')}, ${t('social:likes', { count: likes })}. ${t('social.group')}, ${t('groups:members', { count: MEMBERS.length })}`}
      >
        <View className="flex-row items-center gap-2.5">
          <Avatar name={POST.author} fallback="initial" size="xs" tone="pandan" />
          <Text variant="bodyStrong">{POST.author}</Text>
        </View>

        <View className="h-[150px] overflow-hidden rounded-tile">
          <Image
            source={ONBOARDING_ART.laksa}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={0}
          />
          <View className="absolute bottom-2.5 left-2.5 flex-row items-baseline gap-1.5 rounded-full bg-black/60 px-3 py-1.5">
            <Text variant="label" className="text-white">
              {POST.dish}
            </Text>
            <Text variant="label" className="text-white">
              {POST.kcal}
              <Text variant="caption" className="text-white/80">
                {' '}
                {t('common:unit.kcal')}
              </Text>
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          {/* Keyed on the count, so the heart pops when the like lands. */}
          <Animated.View key={likes} entering={likes === POST.likes ? ZoomIn : undefined}>
            <Icon set="system" name="heart-filled" size={20} />
          </Animated.View>
          <Text variant="meta">{likes}</Text>
        </View>

        <View className="h-0.5 bg-line" />

        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="bodyStrong" numberOfLines={1}>
              {t('social.group')}
            </Text>
            <Text variant="meta">{t('groups:members', { count: MEMBERS.length })}</Text>
          </View>
          <AvatarGroup names={MEMBERS} total={MEMBERS.length} max={3} size="xs" />
        </View>
      </ShowcaseFrame>
    </OnboardingStep>
  )
}

/**
 * The sample post's like count: one short of the figure, then a friend's like
 * lands. Something changing on its own is what tells a picture from a control
 * waiting for a tap. Under Reduce Motion it starts at the final count.
 */
function useLikeLanding(): number {
  const still = useReducedMotion()
  const [likes, setLikes] = useState(still ? POST.likes : POST.likes - 1)
  useEffect(() => {
    if (still) return
    const timer = setTimeout(() => setLikes(POST.likes), LIKE_AT_MS)
    return () => clearTimeout(timer)
  }, [still])
  return likes
}
