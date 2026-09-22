import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { useSocialPosts, useSocialProfile } from '@/data/social'
import {
  ContentSafety,
  FollowButton,
  JoinPrompt,
  PostCard,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialList,
  SocialPhoto,
} from '@/features/social/components'
import { Button, Card, Screen, Text } from '@/ui'

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
  const person = profile.data
  const mine = id === viewer
  const header = person ? (
    <Card>
      <View className="flex-row items-center gap-3">
        <SocialPhoto path={person.avatar_path} avatar label={person.display_name} />
        <View className="flex-1">
          <Text variant="subtitle">{person.display_name}</Text>
          <Text variant="meta">@{person.handle}</Text>
        </View>
      </View>
      {person.bio ? <Text>{person.bio}</Text> : null}
      {person.is_followed_by ? <Text variant="meta">{t('followsYou')}</Text> : null}
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="label">{t('posts', { count: person.post_count })}</Text>
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'followers' },
            })
          }
        >
          {t('followers', { count: person.follower_count })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'following' },
            })
          }
        >
          {person.following_count} {t('following')}
        </Button>
      </View>
      {mine ? (
        <>
          <ReviewNotice
            status={person.quarantined ? 'quarantined' : person.review_status}
            reason={person.review_reason}
            kind="profile"
            id={person.user_id}
          />
          <Button variant="secondary" onPress={() => router.push('/social/edit-profile')}>
            {t('editProfile')}
          </Button>
          <Button variant="ghost" onPress={() => router.push('/social/blocked')}>
            {t('blocked')}
          </Button>
        </>
      ) : (
        <>
          <FollowButton id={id} following={person.is_following} />
          <ContentSafety
            kind="profile"
            id={id}
            authorId={id}
            onRemoved={() => router.replace('/feed')}
          />
        </>
      )}
    </Card>
  ) : undefined
  return (
    <Screen scroll={false} flush header={<SocialBar title={t(mine ? 'myProfile' : 'profile')} />}>
      {person ? (
        <SocialList
          query={posts}
          rowKey={(post) => post.id}
          renderRow={(post, visible) => <PostCard post={post} visible={visible} />}
          header={header}
          empty={t('emptyPosts')}
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
  )
}
