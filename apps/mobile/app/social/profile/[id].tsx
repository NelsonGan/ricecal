import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useSocialPosts, useSocialProfile } from '@/data/social'
import {
  ContentSafety,
  FollowButton,
  JoinPrompt,
  PostTile,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialList,
  SocialPhoto,
} from '@/features/social/components'
import { useThemeColors } from '@/theme/useTheme'
import { Badge, Button, Icon, IconButton, Screen, Sheet, Tappable, Text } from '@/ui'

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Profile key={id} id={id} />
}

function Profile({ id }: { id: string }) {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const profile = useSocialProfile(id)
  const posts = useSocialPosts(id)
  const colors = useThemeColors()
  const [options, setOptions] = useState(false)
  const person = profile.data
  const mine = id === viewer
  const header = person ? (
    <View className="gap-4 border-b-2 border-track bg-surface px-5 pb-5 pt-2">
      <View className="flex-row items-center gap-4">
        <SocialPhoto path={person.avatar_path} avatar size="lg" label={person.display_name} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="subtitle" numberOfLines={1}>
            {person.display_name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="meta" numberOfLines={1}>
              @{person.handle}
            </Text>
            {person.is_followed_by ? (
              <Badge tone="neutral" size="sm">
                {t('followsYou')}
              </Badge>
            ) : null}
          </View>
        </View>
      </View>

      {person.bio ? <Text>{person.bio}</Text> : null}

      <View className="flex-row items-stretch rounded-md bg-track px-1 py-1">
        <View className="min-h-sm flex-1 items-center justify-center px-1">
          <Text variant="label" className="text-center" numberOfLines={2}>
            {t('posts', { count: person.post_count })}
          </Text>
        </View>
        <Tappable
          className="min-h-sm flex-1 items-center justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel={t('followers', { count: person.follower_count })}
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'followers' },
            })
          }
        >
          <Text variant="label" className="text-center" numberOfLines={2}>
            {t('followers', { count: person.follower_count })}
          </Text>
        </Tappable>
        <Tappable
          className="min-h-sm flex-1 items-center justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel={`${person.following_count} ${t('following')}`}
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'following' },
            })
          }
        >
          <Text variant="label" className="text-center" numberOfLines={2}>
            {person.following_count} {t('following')}
          </Text>
        </Tappable>
      </View>

      {mine ? (
        <>
          <ReviewNotice
            status={person.quarantined ? 'quarantined' : person.review_status}
            reason={person.review_reason}
            kind="profile"
            id={person.user_id}
          />
          <Button fullWidth variant="secondary" onPress={() => router.push('/social/edit-profile')}>
            {t('editProfile')}
          </Button>
        </>
      ) : (
        <FollowButton id={id} following={person.is_following} fullWidth />
      )}
    </View>
  ) : undefined
  const action = person ? (
    mine ? (
      <IconButton
        size="sm"
        variant="ghost"
        accessibilityLabel={t('options')}
        onPress={() => setOptions(true)}
      >
        <Icon set="ui" name="more-horizontal" size={22} tintColor={colors.muted} />
      </IconButton>
    ) : (
      <ContentSafety
        kind="profile"
        id={id}
        authorId={id}
        onRemoved={() => router.replace('/feed')}
      />
    )
  ) : undefined
  return (
    <>
      <Screen
        scroll={false}
        flush
        header={<SocialBar title={t(mine ? 'myProfile' : 'profile')} action={action} />}
      >
        {person ? (
          <SocialList
            query={posts}
            rowKey={(post) => post.id}
            renderRow={(post, visible) => <PostTile post={post} visible={visible} />}
            header={header}
            empty={t('emptyPosts')}
            variant="grid"
            columns={2}
          />
        ) : (
          <View className="p-5">
            {mine && !profile.isPending && !profile.isError && !profile.data ? (
              <JoinPrompt />
            ) : (
              <QueryNotice
                pending={profile.isPending}
                error={profile.isError}
                paused={profile.fetchStatus === 'paused'}
                unavailable
                retry={profile.refetch}
              />
            )}
          </View>
        )}
      </Screen>
      <Sheet
        visible={options}
        onClose={() => setOptions(false)}
        closeLabel={t('cancel')}
        title={t('options')}
      >
        <Button
          fullWidth
          variant="ghost"
          contentClassName="justify-start"
          onPress={() => {
            setOptions(false)
            router.push('/social/blocked')
          }}
        >
          {t('blocked')}
        </Button>
      </Sheet>
    </>
  )
}
