import { useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useAvatarUrl, useProfile, useSettings, useUserId } from '@/data'
import {
  type SocialPost,
  type SocialPostKind,
  useSocialPosts,
  useSocialProfile,
  useSocialWorkoutStats,
} from '@/data/social'
import {
  ContentSafety,
  FollowButton,
  PostTile,
  QueryNotice,
  ReviewNotice,
  SocialBar,
  SocialList,
  SocialPhoto,
  WorkoutPostPreview,
} from '@/features/social/components'
import { durationText, volumeText } from '@/features/workouts/format'
import { unitFor } from '@/lib/units'
import { Badge, Button, Icon, IconButton, Screen, Sheet, Tabs, Tappable, Text } from '@/ui'

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
  // Meals and workouts are two tabs rather than one stream: a grid of plates
  // and a list of sessions read differently, and someone visiting for one
  // should not page through the other.
  const [tab, setTab] = useState<SocialPostKind>('food')
  const posts = useSocialPosts(id, tab)
  const leaveProfile = useCallback(() => router.dismissTo('/feed'), [router])
  const [options, setOptions] = useState(false)
  const afterDismiss = useRef<(() => void) | null>(null)
  const person = profile.data
  const mine = id === viewer
  const account = mine ? ownProfile.data : null
  const visible = Boolean(person || account)
  const name = person?.display_name || account?.display_name || t('unknownPerson')
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
            {handle ? (
              <Text variant="meta" numberOfLines={1}>
                @{handle}
              </Text>
            ) : null}
            {person?.is_followed_by ? (
              <Badge tone="neutral" size="sm">
                {t('followsYou')}
              </Badge>
            ) : null}
          </View>
        </View>
      </View>

      {bio ? <Text>{bio}</Text> : null}

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
          {person?.quarantined ? (
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

      <Tabs
        value={tab}
        align="center"
        accessibilityLabel={t('profile')}
        options={[
          { value: 'food', label: t('foodTab') },
          { value: 'workout', label: t('workoutsTab') },
        ]}
        onChange={setTab}
      />
      {tab === 'workout' ? <WorkoutFigures id={id} /> : null}
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
          tab === 'food' ? (
            <SocialList
              key="food"
              query={posts}
              rowKey={(post) => post.id}
              renderRow={(post, visible) => <PostTile post={post} visible={visible} />}
              header={header}
              empty={t('emptyMeals')}
              variant="grid"
              columns={2}
            />
          ) : (
            <SocialList
              key="workout"
              query={posts}
              rowKey={(post) => post.id}
              renderRow={(post) => <WorkoutRow post={post} />}
              header={header}
              empty={t('emptyWorkouts')}
              variant="cards"
            />
          )
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

/** What the shared workouts add up to, over the ones this viewer can see. */
function WorkoutFigures({ id }: { id: string }) {
  const { t } = useTranslation(['workouts', 'common'])
  const stats = useSocialWorkoutStats(id).data
  const { data: settings } = useSettings()
  if (!stats?.workouts) return null
  const figures = [
    { label: t('workouts:stats.metric.workouts'), value: String(stats.workouts) },
    { label: t('workouts:stats.metric.duration'), value: durationText(t, stats.durationS) },
    ...(stats.volumeKg > 0
      ? [
          {
            label: t('workouts:stats.metric.volume'),
            value: volumeText(t, stats.volumeKg, unitFor(settings?.units)),
          },
        ]
      : []),
  ]
  return (
    <View className="flex-row rounded-md bg-track py-3">
      {figures.map((figure, index) => (
        <View
          key={figure.label}
          className={index > 0 ? 'flex-1 border-line border-l px-3' : 'flex-1 px-3'}
        >
          <Text variant="overlineSm" numberOfLines={1}>
            {figure.label}
          </Text>
          <Text variant="numeric" numberOfLines={1} adjustsFontSizeToFit>
            {figure.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** One shared workout on a profile, opening its post for likes and comments. */
function WorkoutRow({ post }: { post: SocialPost }) {
  const { t } = useTranslation('social')
  const router = useRouter()
  return (
    <Tappable
      className="overflow-hidden rounded-card border border-line"
      accessibilityRole="button"
      accessibilityLabel={[post.workout_name ?? '', t('likes', { count: post.like_count })].join(
        ', ',
      )}
      onPress={() => router.push({ pathname: '/social/post/[id]', params: { id: post.id } })}
    >
      <WorkoutPostPreview post={post} />
    </Tappable>
  )
}
