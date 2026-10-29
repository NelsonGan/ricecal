import { useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { keys } from '@/data/keys'
import {
  type SocialFeedShow,
  socialFeedParams,
  useSocialFeed,
  useSocialUnread,
} from '@/data/social'
import { ScreenTitle } from '@/features/shared'
import { PostCard, SocialList } from '@/features/social/components'
import {
  Aside,
  CountBadge,
  cn,
  Icon,
  IconButton,
  Screen,
  Sheet,
  Tabs,
  Tappable,
  Text,
  useWindowLayout,
} from '@/ui'

export default function FeedScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const [mode, setMode] = useState<'following' | 'discover'>('following')
  const [show, setShow] = useState<SocialFeedShow>('all')
  const [filtering, setFiltering] = useState(false)
  // With two panes both feeds are on screen, one in each, and the tabs that
  // switch between them have nothing to do. See `Aside`.
  const { split } = useWindowLayout()
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
                  accessibilityLabel={`${t('feedShow')}, ${t(SHOW_LABEL[show])}`}
                  onPress={() => setFiltering(true)}
                >
                  <View className="h-6 w-6 items-center justify-center">
                    <Icon set="ui" name="filter" size={21} />
                    {/* A filter left on would otherwise read as a quiet feed. */}
                    {show !== 'all' ? (
                      <View
                        className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-pandan"
                        accessibilityElementsHidden
                      />
                    ) : null}
                  </View>
                </IconButton>
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
          {split ? null : (
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
          )}
        </View>
      }
    >
      {split ? (
        <>
          <FeedColumn key={`following-${show}`} mode="following" show={show} titled />
          <Aside>
            <FeedColumn key={`discover-${show}`} mode="discover" show={show} titled />
          </Aside>
        </>
      ) : (
        <FeedColumn key={`${mode}-${show}`} mode={mode} show={show} />
      )}
      <FeedFilter
        visible={filtering}
        value={show}
        onChange={(value) => {
          setShow(value)
          setFiltering(false)
        }}
        onClose={() => setFiltering(false)}
      />
    </Screen>
  )
}

const SHOW_LABEL = {
  all: 'feedShowAll',
  food: 'feedShowFood',
  workout: 'feedShowWorkouts',
} as const satisfies Record<SocialFeedShow, string>
const SHOWS = Object.keys(SHOW_LABEL) as SocialFeedShow[]

/** The feed's filter: every post, meals only or workouts only, for both feeds. */
function FeedFilter({
  visible,
  value,
  onChange,
  onClose,
}: {
  visible: boolean
  value: SocialFeedShow
  onChange: (value: SocialFeedShow) => void
  onClose: () => void
}) {
  const { t } = useTranslation(['social', 'common'])
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('feedShow')}
      closeLabel={t('common:action.close')}
    >
      <View>
        {SHOWS.map((option, index) => {
          const selected = option === value
          return (
            <Tappable
              key={option}
              onPress={() => onChange(option)}
              className={cn(
                'min-h-sm flex-row items-center gap-3 py-4',
                index > 0 && 'border-t-2 border-track',
              )}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
            >
              <Text
                variant="bodyStrong"
                className={cn('flex-1', selected ? 'text-pandan-ink' : 'font-body-bold')}
              >
                {t(SHOW_LABEL[option])}
              </Text>
              {selected ? <Icon set="ui" name="check" size={22} /> : null}
            </Tappable>
          )
        })}
      </View>
    </Sheet>
  )
}

/**
 * One feed. Keyed by its mode and filter, so a switch starts the new feed at
 * its top. `titled` names it, for when the two stand side by side and there
 * are no tabs to say which is which.
 */
function FeedColumn({
  mode,
  show,
  titled = false,
}: {
  mode: 'following' | 'discover'
  show: SocialFeedShow
  titled?: boolean
}) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const feed = useSocialFeed(mode, show)
  const queryClient = useQueryClient()
  useFocusEffect(
    useCallback(() => {
      // A food can publish while this tab is mounted behind the diary. Only when
      // stale: coming straight back from a post refetched every loaded page.
      void queryClient.refetchQueries({
        queryKey: keys.socialRead(viewer, 'social_feed', socialFeedParams(mode, show)),
        exact: true,
        stale: true,
      })
    }, [mode, show, queryClient, viewer]),
  )

  const list = (
    <SocialList
      query={feed}
      variant="feed"
      rowKey={(post) => post.id}
      renderRow={(post, visible) => <PostCard post={post} visible={visible} />}
      empty={t(mode === 'following' && show === 'all' ? 'emptyFollowing' : 'end')}
      end={t('end')}
    />
  )
  if (!titled) return list

  return (
    <View className="flex-1 gap-2">
      <Text variant="overlineSm" className="px-gutter">
        {t(mode)}
      </Text>
      {list}
    </View>
  )
}
