import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useSocialFeed, useSocialProfile } from '@/data/social'
import { ScreenTitle } from '@/features/shared'
import { JoinPrompt, PostCard, SocialList } from '@/features/social/components'
import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Screen, Tabs } from '@/ui'

export default function FeedScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const colors = useThemeColors()
  const [mode, setMode] = useState<'following' | 'discover'>('following')
  const feed = useSocialFeed(mode)
  const own = useSocialProfile()
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
                  <Icon set="ui" name="search" size={21} tintColor={colors.muted} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t('notifications')}
                  onPress={() => router.push('/social/notifications')}
                >
                  <Icon set="ui" name="notification" size={22} tintColor={colors.muted} />
                </IconButton>
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={t('myProfile')}
                  onPress={() =>
                    router.push({ pathname: '/social/profile/[id]', params: { id: viewer } })
                  }
                >
                  <Icon set="ui" name="profile" size={22} tintColor={colors.muted} />
                </IconButton>
              </View>
            }
          />
          <Tabs
            value={mode}
            align="center"
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
        empty={t(mode === 'following' ? 'emptyFollowing' : 'emptyDiscover')}
        header={
          !own.isPending && !own.isError && !own.data ? (
            <View className="m-5">
              <JoinPrompt />
            </View>
          ) : undefined
        }
      />
    </Screen>
  )
}
