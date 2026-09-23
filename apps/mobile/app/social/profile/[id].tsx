import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useAvatarUrl, useProfile, useUserId } from '@/data'
import { useSocialPosts, useSocialProfile } from '@/data/social'
import {
  ContentSafety,
  FollowButton,
  PostTile,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialList,
  SocialPhoto,
} from '@/features/social/components'
import { Badge, Button, Icon, IconButton, Screen, Sheet, Tappable, Text } from '@/ui'

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <Profile key={id} id={id} />
}

function Profile({ id }: { id: string }) {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const ownProfile = useProfile()
  const profile = useSocialProfile(id)
  const posts = useSocialPosts(id)
  const leaveProfile = useCallback(() => router.dismissTo('/feed'), [router])
  const [options, setOptions] = useState(false)
  const afterDismiss = useRef<(() => void) | null>(null)
  const person = profile.data
  const mine = id === viewer
  const account = mine ? ownProfile.data : null
  const visible = Boolean(person || account)
  const name = person?.display_name || account?.display_name || t('displayName')
  const handle = person?.handle ?? account?.handle
  const bio = person?.bio || account?.bio
  const avatarPath = person?.avatar_path ?? account?.avatar_path
  const ownAvatar = useAvatarUrl(mine ? (avatarPath ?? undefined) : undefined)
  const header = visible ? (
    <View className="gap-4 border-b-2 border-track bg-surface px-5 pb-5 pt-2">
      <View className="flex-row items-center gap-4">
        <SocialPhoto
          path={mine ? null : person?.avatar_path}
          privateUri={ownAvatar.data}
          avatar
          size="lg"
          label={name}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="subtitle" numberOfLines={1}>
            {name}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="meta" className={handle ? undefined : 'text-muted'} numberOfLines={1}>
              {handle ? `@${handle}` : t('handle')}
            </Text>
            {person?.is_followed_by ? (
              <Badge tone="neutral" size="sm">
                {t('followsYou')}
              </Badge>
            ) : null}
          </View>
        </View>
      </View>

      {bio ? <Text>{bio}</Text> : mine ? <Text className="text-muted">{t('bio')}</Text> : null}

      <View className="flex-row items-stretch rounded-md bg-track px-1 py-1">
        <View className="min-h-sm flex-1 items-center justify-center px-1">
          <Text variant="label" className="text-center" numberOfLines={2}>
            {t('posts', { count: person?.post_count ?? 0 })}
          </Text>
        </View>
        <Tappable
          className="min-h-sm flex-1 items-center justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel={t('followers', { count: person?.follower_count ?? 0 })}
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'followers' },
            })
          }
        >
          <Text variant="label" className="text-center" numberOfLines={2}>
            {t('followers', { count: person?.follower_count ?? 0 })}
          </Text>
        </Tappable>
        <Tappable
          className="min-h-sm flex-1 items-center justify-center px-1"
          accessibilityRole="button"
          accessibilityLabel={`${person?.following_count ?? 0} ${t('following')}`}
          onPress={() =>
            router.push({
              pathname: '/social/connections/[id]',
              params: { id, direction: 'following' },
            })
          }
        >
          <Text variant="label" className="text-center" numberOfLines={2}>
            {person?.following_count ?? 0} {t('following')}
          </Text>
        </Tappable>
      </View>

      {mine ? (
        <>
          {person ? (
            <ReviewNotice
              status={person.quarantined ? 'quarantined' : person.review_status}
              reason={person.review_reason}
              kind="profile"
              id={person.user_id}
            />
          ) : null}
          <Button fullWidth variant="secondary" onPress={() => router.push('/settings/account')}>
            {t('editProfile')}
          </Button>
        </>
      ) : (
        <FollowButton id={id} following={person?.is_following ?? false} fullWidth />
      )}
    </View>
  ) : undefined
  const action = visible ? (
    mine ? (
      <IconButton
        size="sm"
        variant="ghost"
        accessibilityLabel={t('options')}
        onPress={() => setOptions(true)}
      >
        <Icon set="ui" name="more-horizontal" size={22} />
      </IconButton>
    ) : (
      <ContentSafety kind="profile" id={id} authorId={id} onRemoved={leaveProfile} />
    )
  ) : undefined
  return (
    <>
      <Screen
        scroll={false}
        flush
        header={<SocialBar title={t(mine ? 'myProfile' : 'profile')} action={action} />}
      >
        {visible ? (
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
            <QueryNotice
              pending={mine ? ownProfile.isPending || profile.isPending : profile.isPending}
              error={mine ? ownProfile.isError && profile.isError : profile.isError}
              paused={mine ? ownProfile.fetchStatus === 'paused' : profile.fetchStatus === 'paused'}
              unavailable
              retry={() => {
                void profile.refetch()
                if (mine) void ownProfile.refetch()
              }}
            />
          </View>
        )}
      </Screen>
      <Sheet
        visible={options}
        onClose={() => setOptions(false)}
        onDismiss={() => {
          const next = afterDismiss.current
          afterDismiss.current = null
          next?.()
        }}
        closeLabel={t('cancel')}
        title={t('options')}
      >
        <Button
          fullWidth
          variant="secondary"
          leftIcon={<Icon set="system" name="shield" size={20} />}
          onPress={() => {
            afterDismiss.current = () => router.push('/social/blocked')
            setOptions(false)
          }}
        >
          {t('blocked')}
        </Button>
      </Sheet>
    </>
  )
}
