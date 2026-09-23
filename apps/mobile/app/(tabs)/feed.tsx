import { useIsFocused, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useSocialFeed, useSocialUnread } from '@/data/social'
import { ScreenTitle } from '@/features/shared'
import { PostCard, SocialList } from '@/features/social/components'
import { CountBadge, Icon, IconButton, Screen, Tabs } from '@/ui'

export default function FeedScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const [mode, setMode] = useState<'following' | 'discover'>('following')
  const feed = useSocialFeed(mode)
  const unread = useSocialUnread(useIsFocused())
  const unreadCount = unread.data ?? 0
  const unreadLabel =
    unreadCount > 99
      ? t('unreadNotificationsOverflow')
      : t('unreadNotifications', { count: unreadCount })
  return (
    <Screen
      scroll={false}
      flush
      header={
        <View className="gap-1">
          <ScreenTitle
            title={t('feed')}
            trailing={
              <View className="flex-row items-center">
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t('people')}
                  onPress={() => router.push('/social/people')}
                >
                  <Icon set="ui" name="search" size={21} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={[t('notifications'), unreadCount ? unreadLabel : '']
                    .filter(Boolean)
                    .join(', ')}
                  onPress={() => router.push('/social/notifications')}
                >
                  <View className="h-6 w-6 items-center justify-center">
                    <Icon set="ui" name="notification" size={22} />
                    <CountBadge
                      count={unreadCount}
                      className="absolute -right-2 -top-2 h-5 min-w-5 px-1"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                  </View>
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t('myProfile')}
                  onPress={() =>
                    router.push({ pathname: '/social/profile/[id]', params: { id: viewer } })
                  }
                >
                  <Icon set="ui" name="profile" size={22} />
                </IconButton>
              </View>
            }
          />
          <Tabs
            value={mode}
            align="center"
            scrollable
            accessibilityLabel={t('feed')}
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
        variant="feed"
        rowKey={(post) => post.id}
        renderRow={(post, visible) => <PostCard post={post} visible={visible} />}
        empty={t(mode === 'following' ? 'emptyFollowing' : 'end')}
        end={t('end')}
      />
    </Screen>
  )
}
