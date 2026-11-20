import { useQueryClient } from '@tanstack/react-query'
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router'
import { type ReactElement, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'
import { useUserId } from '@/data'
import { keys } from '@/data/keys'
import {
  type SocialFeedShow,
  socialFeedParams,
  useSocialFeed,
  useSocialUnread,
} from '@/data/social'
import { SocialGroups } from '@/features/groups/SocialGroups'
import { ScreenTitle } from '@/features/shared'
import { PostCard, SocialList } from '@/features/social/components'
import {
  Aside,
  CountBadge,
  cn,
  Icon,
  IconButton,
  Screen,
  Tabs,
  Tappable,
  Text,
  useWindowLayout,
} from '@/ui'

/**
 * Social: the viewer's groups on top, then the feed. It used to be two tabs,
 * Feed and Groups, and most people only ever opened one of them; together the
 * group's day is the first thing on screen and the feed is a scroll away.
 *
 * The groups and the feed's own tabs and filter head the feed's list rather
 * than the screen, so they scroll away and the posts get the whole height.
 */
export default function SocialScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const viewer = useUserId()
  const [mode, setMode] = useState<'following' | 'discover'>('following')
  const [show, setShow] = useState<SocialFeedShow>('all')
  // Whether the groups above the feed can be on screen; their card polls only then.
  const [groupsInView, setGroupsInView] = useState(true)
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
            title={t('title')}
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
                    <Icon set="ui" name="mail" size={22} />
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
          {split ? (
            // Two panes have no tabs, and the filter covers both feeds, so it
            // sits once above them rather than in each.
            <FeedShowChips value={show} onChange={setShow} inHeader />
          ) : null}
        </View>
      }
    >
      {split ? (
        <>
          <FeedColumn
            mode="following"
            show={show}
            titled
            header={<SocialGroups inView={groupsInView} />}
            onHeaderShown={setGroupsInView}
          />
          <Aside>
            {/* Keyed, so the filter (in the header, above both) starts this
                one at its top; it carries no groups to reload. */}
            <FeedColumn key={`discover-${show}`} mode="discover" show={show} titled />
          </Aside>
        </>
      ) : (
        // Not keyed by the feed: switching it keeps the list, and the groups
        // above it, where they are. The tabs are on screen to be tapped, so the
        // new feed starts right under them.
        <FeedColumn
          mode={mode}
          show={show}
          onHeaderShown={setGroupsInView}
          header={
            <View>
              <SocialGroups inView={groupsInView} />
              <View className="px-gutter pt-sm">
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
              <FeedShowChips value={show} onChange={setShow} />
            </View>
          }
        />
      )}
    </Screen>
  )
}

const SHOW_LABEL = {
  all: 'feedShowAll',
  food: 'feedShowFood',
  workout: 'feedShowWorkouts',
} as const satisfies Record<SocialFeedShow, string>
const SHOWS = Object.keys(SHOW_LABEL) as SocialFeedShow[]

/**
 * The feed's filter: every post, meals only or workouts only, for both feeds.
 * It heads the list rather than the app bar, so it reads as part of the feed
 * and scrolls away with it.
 */
function FeedShowChips({
  value,
  onChange,
  inHeader = false,
}: {
  value: SocialFeedShow
  onChange: (value: SocialFeedShow) => void
  /** In the screen header, which already pads its sides. */
  inHeader?: boolean
}) {
  const { t } = useTranslation('social')
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName={cn('gap-1', inHeader ? 'pt-1' : 'px-gutter pb-2 pt-3')}
      accessibilityRole="tablist"
      accessibilityLabel={t('feedShow')}
    >
      {SHOWS.map((option) => {
        const selected = option === value
        return (
          // Small and flat on purpose: it is a quiet refinement of the feed
          // beneath it, and a row of raised chips outshouted the posts.
          <Tappable
            key={option}
            onPress={() => {
              if (!selected) onChange(option)
            }}
            hitSlop={{ top: 8, bottom: 8 }}
            className={cn('rounded-full px-3 py-1.5', selected && 'bg-pandan-soft')}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              className={cn(
                'font-body-black text-[14px] leading-[18px]',
                selected ? 'text-pandan-ink' : 'text-muted',
              )}
            >
              {t(SHOW_LABEL[option])}
            </Text>
          </Tappable>
        )
      })}
    </ScrollView>
  )
}

/**
 * One feed. The one under the groups is never keyed by its mode or filter: a
 * switch keeps the list, and the groups above it, where they are. `titled` names it, for when the two
 * stand side by side and there are no tabs to say which is which. Pulling it
 * down refreshes the groups drawn above it too.
 */
function FeedColumn({
  mode,
  show,
  titled = false,
  header,
  onHeaderShown,
}: {
  mode: 'following' | 'discover'
  show: SocialFeedShow
  titled?: boolean
  /** Drawn above the first post, scrolling with the list. */
  header?: ReactElement
  onHeaderShown?: (shown: boolean) => void
}) {
  const { t } = useTranslation('social')
  const viewer = useUserId()
  const feed = useSocialFeed(mode, show, useIsFocused())
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

  const heading = titled ? (
    <Text variant="overlineSm" className="px-gutter pb-2 pt-lg">
      {t(mode)}
    </Text>
  ) : null
  return (
    <SocialList
      query={feed}
      onRefresh={() =>
        Promise.all([
          feed.refetch(),
          queryClient.refetchQueries({ queryKey: keys.groups(viewer), type: 'active' }),
        ])
      }
      onHeaderShown={onHeaderShown}
      variant="feed"
      header={
        header || heading ? (
          <View>
            {header}
            {heading}
          </View>
        ) : undefined
      }
      rowKey={(post) => post.id}
      renderRow={(post, visible) => <PostCard post={post} visible={visible} />}
      empty={t(mode === 'following' && show === 'all' ? 'emptyFollowing' : 'end')}
      end={t('end')}
    />
  )
}
