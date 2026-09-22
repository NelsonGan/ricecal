import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useSocialFeed, useSocialProfile } from '@/data/social'
import { ScreenTitle } from '@/features/shared'
import { JoinPrompt, PostCard, SocialList } from '@/features/social/components'
import { Button, Screen, SegmentedControl, Text } from '@/ui'

export default function FeedScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const [mode, setMode] = useState<'following' | 'discover'>('following')
  const feed = useSocialFeed(mode)
  const own = useSocialProfile()
  return (
    <Screen
      scroll={false}
      flush
      header={
        <View className="gap-3 pb-3">
          <ScreenTitle title={t('feed')} />
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="neutral" onPress={() => router.push('/social/people')}>
              {t('people')}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => router.push('/social/notifications')}>
              {t('notifications')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() =>
                router.push({ pathname: '/social/profile/[id]', params: { id: viewer } })
              }
            >
              {t('myProfile')}
            </Button>
          </View>
          <SegmentedControl
            value={mode}
            options={[
              { value: 'following', label: t('following') },
              { value: 'discover', label: t('discover') },
            ]}
            onChange={setMode}
          />
        </View>
      }
    >
      <SocialList
        key={mode}
        query={feed}
        rowKey={(post) => post.id}
        renderRow={(post, visible) => <PostCard post={post} visible={visible} />}
        empty={t(mode === 'following' ? 'emptyFeed' : 'emptyDiscover')}
        header={
          !own.isPending && !own.isError && !own.data ? (
            <JoinPrompt />
          ) : mode === 'following' && !feed.data?.pages[0]?.rows.length ? (
            <Text variant="meta">{t('emptyFollowing')}</Text>
          ) : undefined
        }
      />
    </Screen>
  )
}
