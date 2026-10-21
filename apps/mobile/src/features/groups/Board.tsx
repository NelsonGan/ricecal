import { parseISO, subDays } from 'date-fns'
import { useIsFocused, useRouter } from 'expo-router'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppState,
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dateKey, useUserId } from '@/data'
import {
  type BoardEntry,
  type BoardMember,
  GROUP_MEALS,
  type GroupBoard,
  type GroupMeal,
  useGroupBoard,
  useMyGroups,
} from '@/data/groups'
import { workoutIcon, workoutKindKey } from '@/features/activity/workoutKind'
import { QueryNotice } from '@/features/social/components'
import { track } from '@/lib/analytics'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  CountBadge,
  cn,
  FLOAT_SHADOW,
  Icon,
  IconButton,
  Skeleton,
  Tappable,
  Text,
  useNavInset,
  useToast,
} from '@/ui'
import { ChatSheet } from './Chat'
import { InviteSheet } from './InviteSheet'
import { MealSheet } from './MealSheet'
import { EntryPicture, MEAL_TINT, PersonAvatar, shortDuration, useGroupTask } from './parts'
import { takeOpenDay } from './store'
import { GroupWeekStrip } from './WeekStrip'

/** How far back the pager goes. The server answers no further, nor signs older photos. */
const DAYS = 60
/** Rows before "Show more": you and four friends. */
const FOLDED_ROWS = 5
const GAP = 4
/** The page's side margin. The grid has no card around it, so the tiles get the width. */
const EDGE = 8
const MEMBER_COLUMN = 46
/** Each side of the header: room for its two buttons, so the title centres on the screen. */
const HEADER_SIDE = 88
/** Text in a tile is capped so a large Dynamic Type size cannot push it out of a fixed square. */
const TILE_TEXT = 1.3
const SKELETON_ROWS = ['a', 'b', 'c', 'd']

/**
 * The phone's calendar date, which moves at midnight and when the app comes
 * back from the background. Read once per render, a date that changed under a
 * mounted board shifted every page by a day.
 */
function useToday(): string {
  const [today, setToday] = useState(() => dateKey(new Date()))
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-armed for the next midnight each time the date moves
  useEffect(() => {
    const check = () => setToday(dateKey(new Date()))
    const now = new Date()
    const midnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
    const timer = setTimeout(check, midnight + 1000)
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check()
    })
    return () => {
      clearTimeout(timer)
      subscription.remove()
    }
  }, [today])
  return today
}

/** The widths the grid works to: narrow phones give up a little of the workout column. */
function useGrid() {
  const { width } = useWindowDimensions()
  const workout = width < 360 ? 44 : 54
  const tile = Math.floor((width - EDGE * 2 - MEMBER_COLUMN - workout - GAP * 4) / 3)
  return useMemo(() => ({ width, workout, tile, compact: tile < 70 }), [width, workout, tile])
}
type Grid = ReturnType<typeof useGrid>

/**
 * First names, unless two people in the group share one: a board of three
 * Muhammads tells nobody apart, so those get their full name.
 */
function shortNames(members: readonly BoardMember[]): Map<string, string> {
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name
  const counts = new Map<string, number>()
  for (const member of members) {
    const name = first(member.person.name)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return new Map(
    members.map((member) => {
      const name = first(member.person.name)
      return [member.person.id, (counts.get(name) ?? 0) > 1 ? member.person.name : name]
    }),
  )
}

/**
 * One group, one page per day. Swiping sideways goes back a day, and the week
 * strip under the header picks any day of the last sixty, the way Today's does. The chat for the day on
 * screen sits in a bar above the tabs and opens as a sheet.
 */
export function GroupBoardScreen({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { t } = useTranslation(['groups', 'common'])
  const colors = useThemeColors()
  const router = useRouter()
  const viewer = useUserId()
  const grid = useGrid()
  const navInset = useNavInset()
  const focused = useIsFocused()
  const today = useToday()
  const days = useMemo(
    () => Array.from({ length: DAYS }, (_, index) => dateKey(subDays(parseISO(today), index))),
    [today],
  )
  // The day on screen, rather than its position: positions move at midnight.
  const [day, setDay] = useState(() => takeOpenDay(viewer, groupId) ?? today)
  const index = Math.max(0, days.indexOf(day))
  const pager = useRef<FlatList<string>>(null)
  const summary = useMyGroups().data?.find((group) => group.id === groupId)
  // The same query as the page on screen, which is the one that polls.
  const board = useGroupBoard(groupId, day, focused, false)
  const [chatOpen, setChatOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  // A notification tapped while this board is already open names its day too.
  useEffect(() => {
    if (!focused) return
    const asked = takeOpenDay(viewer, groupId)
    if (asked && days.includes(asked)) setDay(asked)
  }, [focused, viewer, groupId, days])
  // Keep the pager on the chosen day when the list under it shifts.
  useEffect(() => {
    pager.current?.scrollToIndex({ index, animated: false })
  }, [index])

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const target = days[Math.round(event.nativeEvent.contentOffset.x / grid.width)]
    if (target && target !== day) setDay(target)
  }

  const name = summary?.name ?? board.data?.group.name
  const memberCount = summary?.member_count ?? board.data?.group.member_count
  const openInvite = useCallback(() => setInviteOpen(true), [])

  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item, index: page }) => (
      <View style={{ width: grid.width }}>
        <BoardPage
          groupId={groupId}
          day={item}
          isToday={page === 0}
          enabled={focused && Math.abs(page - index) <= 1}
          live={focused && page === index}
          bottomInset={navInset + 76}
          grid={grid}
          onInvite={openInvite}
        />
      </View>
    ),
    [groupId, focused, index, navInset, grid, openInvite],
  )

  return (
    <View className="flex-1">
      <View className="gap-3 pb-3 pt-1" style={{ paddingHorizontal: EDGE }}>
        {/* Equal sides, so the name sits in the middle of the screen rather
            than in the middle of whatever the buttons leave. */}
        <View className="flex-row items-center">
          <View style={{ width: HEADER_SIDE }} className="flex-row">
            <IconButton size="sm" variant="ghost" accessibilityLabel={t('back')} onPress={onBack}>
              <Icon set="ui" name="chevron-left" size={22} tintColor={colors.muted} />
            </IconButton>
          </View>
          <View className="min-w-0 flex-1 items-center">
            <Text variant="subtitle" numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {name ?? ' '}
            </Text>
            {memberCount !== undefined ? (
              <Text variant="micro">{t('members', { count: memberCount })}</Text>
            ) : null}
          </View>
          <View style={{ width: HEADER_SIDE }} className="flex-row justify-end">
            <IconButton
              size="sm"
              variant="ghost"
              accessibilityLabel={t('inviteFriends')}
              onPress={openInvite}
            >
              <Icon set="system" name="user-add" size={22} />
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              accessibilityLabel={t('settings')}
              onPress={() => router.push({ pathname: '/group/[id]', params: { id: groupId } })}
            >
              <Icon set="system" name="settings" size={22} />
            </IconButton>
          </View>
        </View>
        <GroupWeekStrip
          day={day}
          today={today}
          oldest={days[DAYS - 1] ?? today}
          onChange={setDay}
        />
      </View>

      <FlatList
        ref={pager}
        data={days}
        extraData={index}
        keyExtractor={(item) => item}
        horizontal
        inverted
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        initialScrollIndex={index}
        getItemLayout={(_, item) => ({
          length: grid.width,
          offset: grid.width * item,
          index: item,
        })}
        initialNumToRender={1}
        windowSize={3}
        maxToRenderPerBatch={1}
        renderItem={renderItem}
      />

      <ChatBar board={board.data} bottom={navInset + 8} onPress={() => setChatOpen(true)} />
      <ChatSheet
        groupId={groupId}
        groupName={name ?? ''}
        day={day}
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
      />
      <InviteSheet groupId={groupId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </View>
  )
}

type Open = { memberId: string; meal: GroupMeal }

const BoardPage = memo(function BoardPage({
  groupId,
  day,
  isToday,
  enabled,
  live,
  bottomInset,
  grid,
  onInvite,
}: {
  groupId: string
  day: string
  isToday: boolean
  enabled: boolean
  live: boolean
  bottomInset: number
  grid: Grid
  onInvite: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const board = useGroupBoard(groupId, day, enabled, live)
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<Open | null>(null)
  const onOpen = useCallback((memberId: string, meal: GroupMeal) => setOpen({ memberId, meal }), [])
  const onClose = useCallback(() => setOpen(null), [])
  const members = board.data?.members
  const names = useMemo(() => shortNames(members ?? []), [members])

  if (!board.data) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: EDGE }}>
        {board.isError || board.fetchStatus === 'paused' ? (
          <QueryNotice
            error={board.isError}
            paused={board.fetchStatus === 'paused'}
            retry={() => board.refetch()}
          />
        ) : (
          <View style={{ gap: GAP }}>
            {SKELETON_ROWS.map((row) => (
              <View key={row} style={{ height: grid.tile }}>
                <Skeleton className="h-full w-full rounded-tile" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    )
  }

  const all = board.data.members
  const shown = expanded ? all : all.slice(0, FOLDED_ROWS)
  const hidden = all.length - FOLDED_ROWS

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: EDGE }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: GAP }}>
        <ColumnHeaders grid={grid} />
        {shown.map((member) => (
          <MemberRow
            key={member.person.id}
            groupId={groupId}
            day={day}
            isToday={isToday}
            member={member}
            name={names.get(member.person.id) ?? member.person.name}
            grid={grid}
            onOpen={onOpen}
          />
        ))}
        {hidden > 0 ? (
          <Tappable
            className="min-h-sm flex-row items-center justify-center gap-1"
            onPress={() => setExpanded((value) => !value)}
            accessibilityRole="button"
          >
            <Text variant="caption" className="text-pandan-ink">
              {expanded ? t('showLess') : t('showMore', { count: hidden })}
            </Text>
            <Icon
              set="ui"
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              tintColor={colors.muted}
            />
          </Tappable>
        ) : null}
      </View>
      {all.length === 1 ? (
        <View className="items-center gap-md py-lg">
          <Text variant="meta" className="text-center">
            {t('inviteFirst')}
          </Text>
          <Button leftIcon={<Icon set="system" name="user-add" size={20} />} onPress={onInvite}>
            {t('inviteFriends')}
          </Button>
        </View>
      ) : null}
      <MealSheet
        groupId={groupId}
        day={day}
        meal={open?.meal ?? null}
        // The sheet follows the board's latest copy, so a reaction redraws it.
        member={open ? (all.find((m) => m.person.id === open.memberId) ?? null) : null}
        name={open ? (names.get(open.memberId) ?? '') : ''}
        onClose={onClose}
      />
    </ScrollView>
  )
})

function ColumnHeaders({ grid }: { grid: Grid }) {
  const { t } = useTranslation('groups')
  const label = (text: string, width: number) => (
    <Text
      variant="micro"
      className="text-center uppercase tracking-[0.6px]"
      style={{ width }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      maxFontSizeMultiplier={TILE_TEXT}
    >
      {text}
    </Text>
  )
  return (
    <View className="flex-row items-center pt-1" style={{ gap: GAP }} accessibilityElementsHidden>
      <View style={{ width: MEMBER_COLUMN }} />
      {GROUP_MEALS.map((meal) => (
        <View key={meal}>{label(t(`column.${meal}`), grid.tile)}</View>
      ))}
      {label(t('column.workout'), grid.workout)}
    </View>
  )
}

const MemberRow = memo(function MemberRow({
  groupId,
  day,
  isToday,
  member,
  name,
  grid,
  onOpen,
}: {
  groupId: string
  day: string
  isToday: boolean
  member: BoardMember
  name: string
  grid: Grid
  onOpen: (memberId: string, meal: GroupMeal) => void
}) {
  const { t } = useTranslation('groups')
  const viewer = useUserId()
  const isSelf = member.person.id === viewer
  const byMeal = useMemo(() => {
    const map: Record<GroupMeal, BoardEntry[]> = { breakfast: [], lunch: [], dinner: [] }
    for (const entry of member.entries) map[entry.meal].push(entry)
    return map
  }, [member.entries])

  return (
    <View
      className={cn('flex-row items-center rounded-tile', isSelf && 'bg-pandan-soft')}
      style={{ gap: GAP }}
    >
      <View className="items-center gap-0.5" style={{ width: MEMBER_COLUMN }}>
        <PersonAvatar person={member.person} />
        <Text
          variant="micro"
          className="text-ink"
          numberOfLines={1}
          maxFontSizeMultiplier={TILE_TEXT}
        >
          {isSelf ? t('you') : name}
        </Text>
      </View>
      {GROUP_MEALS.map((meal) => (
        <MealTile
          key={meal}
          groupId={groupId}
          day={day}
          meal={meal}
          member={member}
          name={name}
          entries={byMeal[meal]}
          grid={grid}
          isSelf={isSelf}
          isToday={isToday}
          onOpen={onOpen}
        />
      ))}
      <WorkoutCell workout={member.workout} height={grid.tile} width={grid.workout} />
    </View>
  )
})

function MealTile({
  groupId,
  day,
  meal,
  member,
  name,
  entries,
  grid,
  isSelf,
  isToday,
  onOpen,
}: {
  groupId: string
  day: string
  meal: GroupMeal
  member: BoardMember
  name: string
  entries: BoardEntry[]
  grid: Grid
  isSelf: boolean
  isToday: boolean
  onOpen: (memberId: string, meal: GroupMeal) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const router = useRouter()
  const viewer = useUserId()
  const [page, setPage] = useState(0)
  const size = grid.tile
  const box = { width: size, height: size }
  const shownPage = Math.min(page, Math.max(0, entries.length - 1))

  if (entries.length > 0) {
    const label = (entry: BoardEntry, index: number) =>
      [
        `${entry.name}, ${entry.kcal} ${t('common:unit.kcal')}`,
        entries.length > 1 ? t('position', { index: index + 1, count: entries.length }) : null,
        entry.likes > 0 ? `👍 ${entry.likes}` : null,
        entry.dislikes > 0 ? `👎 ${entry.dislikes}` : null,
      ]
        .filter(Boolean)
        .join(', ')
    return (
      <View className="overflow-hidden rounded-[14px] bg-surface-alt" style={box}>
        {/* Keyed on the foods, so one moved away or deleted starts the tile
            again at its first food rather than on a blank page. Several foods
            swipe here; on iOS the swipe stays in the tile, and the day changes
            from any other part of the board or the week strip. */}
        <ScrollView
          key={entries.map((entry) => entry.id).join()}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={entries.length > 1}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / size))
          }
        >
          {entries.map((entry, index) => (
            <Tappable
              key={entry.id}
              style={box}
              onPress={() => onOpen(member.person.id, meal)}
              accessibilityRole="button"
              accessibilityLabel={label(entry, index)}
            >
              <EntryFace entry={entry} meal={meal} ownerId={member.person.id} grid={grid} />
            </Tappable>
          ))}
        </ScrollView>
        {entries.length > 1 ? (
          <View
            className="absolute left-1.5 top-1.5 flex-row gap-1 rounded-full bg-black/35 px-1.5 py-1"
            pointerEvents="none"
          >
            {entries.map((entry, index) => (
              <View
                key={entry.id}
                className={cn(
                  'h-1.5 rounded-full',
                  index === shownPage ? 'w-3 bg-white' : 'w-1.5 bg-white/50',
                )}
              />
            ))}
          </View>
        ) : null}
      </View>
    )
  }

  if (isSelf) {
    return isToday ? (
      <Tappable
        className="items-center justify-center rounded-[14px] bg-surface"
        style={box}
        onPress={() => router.push('/log')}
        accessibilityRole="button"
        accessibilityLabel={t('logMeal')}
      >
        <Icon set="ui" name="plus" size={22} />
      </Tappable>
    ) : (
      <EmptyTile width={size} height={size} />
    )
  }

  const nudge = member.nudges[meal]
  if (nudge) {
    const by =
      nudge.by.id === viewer
        ? t('nudgedByYou')
        : t('nudgedBy', { name: nudge.by.name.split(' ')[0] })
    return (
      <View
        className="items-center justify-center gap-0.5 rounded-[14px] bg-surface-alt px-1"
        style={box}
        accessible
        accessibilityLabel={by}
      >
        <Icon set="system" name="bell" size={18} />
        <Text
          variant="micro"
          className="text-center"
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={TILE_TEXT}
        >
          {by}
        </Text>
      </View>
    )
  }
  if (member.nudgeable.includes(meal)) {
    return (
      <NudgeTile groupId={groupId} day={day} meal={meal} member={member} name={name} size={size} />
    )
  }
  return <EmptyTile width={size} height={size} />
}

const PHOTO_FADE = {
  experimental_backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.62))',
} as const
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const

function EntryFace({
  entry,
  meal,
  ownerId,
  grid,
}: {
  entry: BoardEntry
  meal: GroupMeal
  ownerId: string
  grid: Grid
}) {
  const { t } = useTranslation('common')
  const reacted = entry.likes > 0 || entry.dislikes > 0
  const photo = Boolean(entry.photo_path)
  return (
    <View className={cn('flex-1', !photo && MEAL_TINT[meal])}>
      <View
        className="absolute inset-0"
        style={photo ? undefined : { paddingBottom: grid.compact ? 14 : 22 }}
      >
        <EntryPicture entry={entry} ownerId={ownerId} iconSize={Math.round(grid.tile * 0.48)} />
      </View>
      {reacted ? (
        <View className="absolute right-1 top-1 flex-row items-center gap-1 rounded-full bg-surface/85 px-1.5 py-0.5">
          {entry.likes > 0 ? (
            <Text variant="micro" className="text-ink" maxFontSizeMultiplier={TILE_TEXT}>
              👍{entry.likes}
            </Text>
          ) : null}
          {entry.dislikes > 0 ? (
            <Text variant="micro" className="text-ink" maxFontSizeMultiplier={TILE_TEXT}>
              👎{entry.dislikes}
            </Text>
          ) : null}
        </View>
      ) : null}
      {/* On a photo the words sit on the picture over a dark fade; on a
          drawing they sit on its pastel. No strip, so the tile has no frame. */}
      <View
        className="absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-4"
        style={photo ? PHOTO_FADE : undefined}
        pointerEvents="none"
      >
        <Text
          variant="micro"
          className={photo ? 'text-white' : 'text-ink'}
          numberOfLines={1}
          style={photo ? TEXT_SHADOW : undefined}
          maxFontSizeMultiplier={TILE_TEXT}
        >
          {entry.name}
        </Text>
        {/* A narrow phone's tile keeps the name and drops the number. */}
        {grid.compact ? null : (
          <Text
            variant="micro"
            className={cn('text-[10px] leading-[12px]', photo ? 'text-white/85' : 'text-muted')}
            numberOfLines={1}
            style={photo ? TEXT_SHADOW : undefined}
            maxFontSizeMultiplier={TILE_TEXT}
          >
            {entry.kcal} {t('unit.kcal')}
          </Text>
        )}
      </View>
    </View>
  )
}

/** The whole empty tile is the button, not just the pill drawn in it. */
function NudgeTile({
  groupId,
  day,
  meal,
  member,
  name,
  size,
}: {
  groupId: string
  day: string
  meal: GroupMeal
  member: BoardMember
  name: string
  size: number
}) {
  const { t } = useTranslation('groups')
  const task = useGroupTask()
  const toast = useToast()
  const nudge = async () => {
    try {
      await task.run({ action: 'nudge', groupId, day, targetId: member.person.id, meal })
      track('Group Nudge Sent', { meal })
      toast.show({ title: t('nudgeSent'), tone: 'success' })
    } catch {
      // The task showed why.
    }
  }
  // Drawn like a food tile with no photo: a clay picture on a soft fill and the
  // label at the foot, so a row of them reads as part of the board rather than
  // as buttons dropped on it. The whole tile is the target.
  return (
    <Tappable
      className="items-center justify-center rounded-[14px] bg-hibiscus-soft"
      style={{ width: size, height: size, opacity: task.isPending ? 0.6 : 1 }}
      onPress={() => void nudge()}
      disabled={task.isPending}
      accessibilityRole="button"
      accessibilityLabel={t('nudgeLabel', { name, meal: t(`mealInSentence.${meal}`) })}
    >
      <View className="flex-1 items-center justify-center pt-1">
        <Icon set="system" name="wave" size={Math.round(size * 0.42)} />
      </View>
      <Text
        variant="micro"
        className="pb-1.5 text-hibiscus-ink"
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_TEXT}
      >
        {t('nudge')}
      </Text>
    </Tappable>
  )
}

function EmptyTile({ width, height }: { width: number; height: number }) {
  return (
    <View
      className="items-center justify-center rounded-[14px] bg-surface-alt"
      style={{ width, height }}
    >
      <View className="h-0.5 w-4 rounded-full bg-line-strong" />
    </View>
  )
}

function WorkoutCell({
  workout,
  height,
  width,
}: {
  workout: BoardMember['workout']
  height: number
  width: number
}) {
  const { t } = useTranslation(['activity'])
  if (!workout) return <EmptyTile width={width} height={height} />
  const name = workout.name ?? t(workoutKindKey(workout.kind))
  const duration = shortDuration(workout.duration_s)
  return (
    <View
      className="items-center justify-center gap-0.5 rounded-[14px] bg-hibiscus-soft px-1"
      style={{ width, height }}
      accessible
      accessibilityLabel={`${name}, ${duration}`}
    >
      <Icon {...workoutIcon(workout.kind)} size={26} />
      <Text
        variant="micro"
        className="text-ink"
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_TEXT}
      >
        {name}
      </Text>
      <Text
        variant="micro"
        className="text-[10px] leading-[12px]"
        numberOfLines={1}
        maxFontSizeMultiplier={TILE_TEXT}
      >
        {duration}
        {workout.count > 1 ? ` +${workout.count - 1}` : ''}
      </Text>
    </View>
  )
}

function ChatBar({
  board,
  bottom,
  onPress,
}: {
  board: GroupBoard | undefined
  bottom: number
  onPress: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const last = board?.chat.last
  const unread = board?.chat.unread ?? 0
  const insets = useSafeAreaInsets()
  const preview = last ? `${last.author.name.split(' ')[0]}: ${last.body}` : t('chatEmpty')
  return (
    <View
      className="absolute inset-x-0"
      style={{ bottom: Math.max(bottom, insets.bottom), paddingHorizontal: EDGE }}
      pointerEvents="box-none"
    >
      <Tappable
        className="min-h-[52px] flex-row items-center gap-3 rounded-tile border border-line bg-surface px-3"
        style={FLOAT_SHADOW}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[t('chat'), unread > 0 ? t('unread', { count: unread }) : null, preview]
          .filter(Boolean)
          .join(', ')}
      >
        <View>
          <Icon set="system" name="chat" size={26} />
          <CountBadge count={unread} className="absolute -right-2 -top-1.5 h-5 min-w-5 px-1" />
        </View>
        <Text
          variant="meta"
          className={cn('min-w-0 flex-1', unread > 0 && 'text-ink')}
          numberOfLines={1}
        >
          {preview}
        </Text>
        <Icon set="ui" name="chevron-up" size={18} tintColor={colors.muted} />
      </Tappable>
    </View>
  )
}
