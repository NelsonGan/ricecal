import { useFocusEffect, useIsFocused, useRouter } from 'expo-router'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, type ScrollViewInstance, View } from 'react-native'
import { useUserId } from '@/data'
import {
  type GroupSummary,
  useGroupBoardChatLive,
  useGroupChatSummary,
  useGroupInviteCount,
  useMyGroups,
} from '@/data/groups'
import { QueryNotice } from '@/features/social/components'
import { useThemeColors } from '@/theme/useTheme'
import { Button, Card, CountBadge, cn, Icon, ProgressBar, Skeleton, Tappable, Text } from '@/ui'
import { BoardPreview, ChatRow } from './Board'
import { InviteSheet } from './InviteSheet'
import { GroupIcon } from './parts'
import { setOpenGroup, useOpenGroup } from './store'

/**
 * The groups half of Social, above the feed: a row to switch between the
 * viewer's groups, and the chosen group's day on a card. The card is the
 * reason Social opens on it: most people are in one group, and what friends
 * ate today is the first thing they look for. The chosen group is remembered
 * per account (`store.ts`), so a relaunch comes back to the same card.
 */
export function SocialGroups({ inView }: { inView: boolean }) {
  const { t } = useTranslation('groups')
  const router = useRouter()
  const userId = useUserId()
  const groups = useMyGroups()
  const invites = useGroupInviteCount()
  const inviteCount = invites.data ?? 0
  // The count polls slowly; coming back to the tab is a good moment to ask again.
  useFocusEffect(
    useCallback(() => {
      void invites.refetch()
    }, [invites.refetch]),
  )
  const remembered = useOpenGroup(userId)
  const list = groups.data ?? []
  const chosen = list.find((group) => group.id === remembered)
  // Which group sits first in the pill row. Starts at the remembered choice on
  // mount, and syncs again when a group is chosen outside this row (from
  // Groups, a notification or an account switch) or when returning to Social,
  // so a group further down the list is visible at the start instead of
  // scrolled out of sight. Tapping a pill in place leaves the row still until
  // then so pills do not jump out from under the finger.
  const chipsRef = useRef<ScrollViewInstance>(null)
  const rememberedRef = useRef(remembered)
  rememberedRef.current = remembered
  const inPlaceRef = useRef<string | null>(null)
  const prevUserIdRef = useRef(userId)
  const [front, setFront] = useState<string | null>(remembered)
  useEffect(() => {
    const switchedUser = prevUserIdRef.current !== userId
    prevUserIdRef.current = userId
    if (switchedUser || remembered !== inPlaceRef.current) {
      inPlaceRef.current = null
      setFront(remembered)
      chipsRef.current?.scrollTo({ x: 0, animated: false })
    }
  }, [userId, remembered])
  const ordered = useMemo(() => orderGroupChips(list, front), [list, front])
  // A group just made or joined is chosen before the list has it, and so is
  // one a notification opened that this phone has not listed yet: ask the
  // server once and wait for the answer rather than show another group's
  // card, or the empty one. A group left or deleted elsewhere falls back to
  // the first.
  //
  // The answer is the ask's own refetch, judged by its result rather than by
  // the query's flags: a failed refetch goes idle with the old list too, and
  // read that way it once dropped a group just joined on another phone. A
  // failed ask keeps the choice and stops waiting; the next list that lands
  // (its stamp changes) decides, and coming back to Social asks again.
  const [ask, setAsk] = useState<{
    id: string
    stamp: number
    state: 'asking' | 'answered' | 'failed'
  } | null>(null)
  const missing = Boolean(remembered) && !chosen
  const asked = ask !== null && ask.id === remembered
  const answered =
    asked &&
    (ask.state === 'answered' || (ask.state === 'failed' && groups.dataUpdatedAt !== ask.stamp))
  const { refetch } = groups
  useEffect(() => {
    // Idle, not merely not fetching: offline the refetch pauses, and is asked
    // once it can be answered.
    if (!missing || !remembered || asked || !groups.data || groups.fetchStatus !== 'idle') return
    const sent = { id: remembered, stamp: groups.dataUpdatedAt, state: 'asking' as const }
    setAsk(sent)
    void refetch().then((result) => {
      setAsk((current) =>
        current === sent ? { ...sent, state: result.isError ? 'failed' : 'answered' } : current,
      )
    })
  }, [missing, remembered, asked, groups.data, groups.fetchStatus, groups.dataUpdatedAt, refetch])
  useFocusEffect(
    useCallback(() => {
      setAsk((current) => (current?.state === 'failed' ? null : current))
      inPlaceRef.current = null
      setFront(rememberedRef.current)
      chipsRef.current?.scrollTo({ x: 0, animated: false })
    }, []),
  )
  const waiting = !answered && !(asked && ask.state === 'failed')
  const arriving =
    missing && waiting && (groups.isFetching || (groups.fetchStatus === 'idle' && !asked))
  const selected = chosen ?? list[0] ?? null
  const openGroups = () => router.push('/group')
  // Forgotten once a list fetched after it was chosen says it is gone, so
  // later refetches do not read as a group still arriving.
  const gone = missing && answered && !groups.isFetching
  useEffect(() => {
    if (gone) setOpenGroup(userId, null)
  }, [gone, userId])

  if (groups.isLoading || arriving) return <SocialGroupsSkeleton />
  if (!groups.data && (groups.isError || groups.fetchStatus === 'paused')) {
    return (
      <View className="px-gutter pt-1">
        <QueryNotice
          error={groups.isError}
          paused={groups.fetchStatus === 'paused'}
          retry={() => groups.refetch()}
        />
      </View>
    )
  }

  return (
    <View className="gap-3 pt-1">
      <GroupChips
        scrollRef={chipsRef}
        groups={ordered}
        selected={selected?.id ?? null}
        inviteCount={inviteCount}
        onSelect={(id) => {
          inPlaceRef.current = id
          setOpenGroup(userId, id)
        }}
        onMore={openGroups}
      />
      {selected ? (
        <GroupDayCard key={selected.id} group={selected} inView={inView} />
      ) : (
        <Card className="mx-gutter" contentClassName="items-center gap-md">
          <Icon set="food" name="rice-bowl" size={56} />
          <View className="items-center gap-1">
            <Text variant="label" className="text-center">
              {t('emptyTitle')}
            </Text>
            <Text variant="meta" className="text-center">
              {t('emptyBody')}
            </Text>
          </View>
          <Button
            className="self-center"
            size="sm"
            onPress={() => router.push({ pathname: '/group', params: { new: '1' } })}
          >
            {t('startGroup')}
          </Button>
        </Card>
      )}
    </View>
  )
}

/**
 * Moves `frontId` to the head of the chip row while keeping the rest in the
 * server's order.
 */
function orderGroupChips(
  groups: readonly GroupSummary[],
  frontId: string | null,
): readonly GroupSummary[] {
  if (!frontId) return groups
  const index = groups.findIndex((group) => group.id === frontId)
  if (index <= 0) return groups
  return [groups[index], ...groups.slice(0, index), ...groups.slice(index + 1)]
}

/**
 * The viewer's groups as a row of flat pills, then one that opens the Groups
 * page: every group with its details, the invites waiting (its badge), a new
 * group and the public ones to join.
 */
function GroupChips({
  scrollRef,
  groups,
  selected,
  inviteCount,
  onSelect,
  onMore,
}: {
  scrollRef: RefObject<ScrollViewInstance | null>
  groups: readonly GroupSummary[]
  selected: string | null
  inviteCount: number
  onSelect: (id: string) => void
  onMore: () => void
}) {
  const { t } = useTranslation('groups')
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-gutter"
      accessibilityRole="tablist"
      accessibilityLabel={t('title')}
    >
      {groups.map((group) => {
        const active = group.id === selected
        return (
          <Tappable
            key={group.id}
            onPress={() => {
              if (!active) onSelect(group.id)
            }}
            className={cn(
              'max-w-[220px] flex-row items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3.5',
              active ? 'border-pandan-soft-line bg-pandan-soft' : 'border-line bg-surface',
            )}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <View className="h-7 w-7 items-center justify-center overflow-hidden rounded-full">
              {group.icon_path ? (
                <GroupIcon name={group.icon_name} path={group.icon_path} fill />
              ) : (
                <GroupIcon name={group.icon_name} size={24} />
              )}
            </View>
            <Text
              numberOfLines={1}
              className={cn(
                'shrink font-body-black text-[14px] leading-[18px]',
                active ? 'text-pandan-ink' : 'text-muted',
              )}
            >
              {group.name}
            </Text>
          </Tappable>
        )
      })}
      <Tappable
        onPress={onMore}
        className="flex-row items-center gap-1.5 rounded-full border border-line bg-surface py-1.5 pl-2 pr-3.5"
        accessibilityRole="button"
        accessibilityLabel={
          inviteCount ? `${t('title')}, ${t('invites')} ${inviteCount}` : t('title')
        }
      >
        <View className="h-7 w-7 items-center justify-center">
          <Icon set="system" name="groups" size={24} />
        </View>
        <Text className="font-body-black text-[14px] leading-[18px] text-muted">{t('title')}</Text>
        {/* Beside the word rather than on the picture, where it covered the word. */}
        <CountBadge
          count={inviteCount}
          className="h-5 min-w-5 px-1"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </Tappable>
    </ScrollView>
  )
}

/**
 * One group's today: who has logged, the first rows of its board, and the
 * chat. Its header and "See all" open the full board, which has every member
 * and the sixty days before.
 */
function GroupDayCard({ group, inView }: { group: GroupSummary; inView: boolean }) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const router = useRouter()
  // Read while Social is in front and the card can be on screen; scrolled
  // into the feed, it keeps what it last read and catches up on the way back.
  const live = useIsFocused() && inView
  const chatLive = useGroupBoardChatLive(group.id, live)
  const chat = useGroupChatSummary(group.id, live, chatLive)
  const [inviteOpen, setInviteOpen] = useState(false)
  const openBoard = () => router.push({ pathname: '/group/board', params: { id: group.id } })
  const logged = t('loggedToday', { logged: group.logged_today, count: group.member_count })

  return (
    <Card className="mx-gutter" flush contentClassName="gap-2 p-2">
      <Tappable
        className="flex-row items-center gap-3 px-1 pt-1"
        onPress={openBoard}
        accessibilityRole="button"
        accessibilityLabel={[group.name, logged, t('openBoard')].join(', ')}
      >
        <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-[14px] bg-pandan-soft">
          {group.icon_path ? (
            <GroupIcon name={group.icon_name} path={group.icon_path} fill />
          ) : (
            <GroupIcon name={group.icon_name} size={34} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="subtitle" numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {group.name}
          </Text>
          <Text variant="micro" numberOfLines={1}>
            {logged}
          </Text>
          <ProgressBar
            value={group.member_count ? group.logged_today / group.member_count : 0}
            height={6}
          />
        </View>
        <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
      </Tappable>
      <BoardPreview
        groupId={group.id}
        live={live}
        onSeeAll={openBoard}
        onInvite={() => setInviteOpen(true)}
      />
      <ChatRow
        summary={chat.data}
        onPress={() => router.push({ pathname: '/group/chat', params: { id: group.id } })}
      />
      <InviteSheet groupId={group.id} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Card>
  )
}

function SocialGroupsSkeleton() {
  return (
    <View className="gap-3 pt-1">
      <View className="flex-row gap-2 px-gutter">
        <Skeleton width={150} height={42} />
        <Skeleton width={110} height={42} />
      </View>
      <View className="px-gutter">
        <Skeleton rounded={false} width="100%" height={300} className="rounded-card" />
      </View>
    </View>
  )
}
