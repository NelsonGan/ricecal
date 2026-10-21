import { format, parseISO, subDays } from 'date-fns'
import { useIsFocused, useRouter } from 'expo-router'
import { memo, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dateKey, useUserId } from '@/data'
import {
  type GroupBoard as Board,
  type BoardEntry,
  type BoardMember,
  GROUP_MEALS,
  type GroupMeal,
  useGroupBoard,
} from '@/data/groups'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useThemeColors } from '@/theme/useTheme'
import {
  Button,
  CountBadge,
  cn,
  EmptyState,
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
import {
  EntryPicture,
  MEAL_TINT,
  PersonAvatar,
  shortDuration,
  useGroupTask,
  workoutIcon,
} from './parts'

/** How far back the pager goes. Matches what the photo signer will authorize. */
const DAYS = 60
/** Rows before "Show more": you and four friends. */
const FOLDED_ROWS = 5
const GAP = 4
/** Gutter and card padding around the grid, each side. */
const EDGE = 8
const MEMBER_COLUMN = 46
const WORKOUT_COLUMN = 54

const SKELETON_ROWS = ['a', 'b', 'c', 'd']

type Open = { member: BoardMember; meal: GroupMeal; index: number } | null

/**
 * One group, one page per day. Swiping sideways goes back a day; the chevrons
 * do the same for anyone who does not think to swipe. The chat for the day on
 * screen sits in a bar above the tabs and opens as a sheet.
 */
export function GroupBoardScreen({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const navInset = useNavInset()
  const focused = useIsFocused()
  const todayKey = dateKey(new Date())
  const days = useMemo(
    () => Array.from({ length: DAYS }, (_, index) => dateKey(subDays(parseISO(todayKey), index))),
    [todayKey],
  )
  const [index, setIndex] = useState(0)
  const pager = useRef<FlatList<string>>(null)
  const day = days[index] ?? todayKey
  const board = useGroupBoard(groupId, day, focused)
  const [chatOpen, setChatOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(DAYS - 1, next))
    setIndex(clamped)
    pager.current?.scrollToIndex({ index: clamped, animated: true })
  }
  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width)
    if (next !== index) setIndex(next)
  }

  const header = board.data?.group
  const dayLabel =
    index === 0
      ? t('today')
      : index === 1
        ? t('yesterday')
        : format(parseISO(day), datePattern('weekdayDayMonth'))

  return (
    <View className="flex-1">
      <View className="gap-2 px-gutter pb-2 pt-1">
        <View className="flex-row items-center gap-2">
          <IconButton size="sm" accessibilityLabel={t('back')} onPress={onBack}>
            <Icon set="ui" name="chevron-left" size={22} tintColor={colors.muted} />
          </IconButton>
          <View className="min-w-0 flex-1 items-center">
            <Text variant="subtitle" numberOfLines={1}>
              {header?.name ?? ' '}
            </Text>
            {header ? (
              <Text variant="micro">{t('members', { count: header.member_count })}</Text>
            ) : null}
          </View>
          <IconButton
            size="sm"
            variant="ghost"
            accessibilityLabel={t('inviteFriends')}
            onPress={() => setInviteOpen(true)}
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
        <View className="flex-row items-center justify-between">
          <IconButton
            size="xs"
            variant="subtle"
            accessibilityLabel={t('previousDay')}
            disabled={index >= DAYS - 1}
            onPress={() => go(index + 1)}
          >
            <Icon set="ui" name="chevron-left" size={18} tintColor={colors.muted} />
          </IconButton>
          <Text variant="label" accessibilityLiveRegion="polite">
            {dayLabel}
          </Text>
          <IconButton
            size="xs"
            variant="subtle"
            accessibilityLabel={t('nextDay')}
            disabled={index === 0}
            onPress={() => go(index - 1)}
          >
            <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
          </IconButton>
        </View>
      </View>

      <FlatList
        ref={pager}
        data={days}
        keyExtractor={(item) => item}
        horizontal
        inverted
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, item) => ({ length: width, offset: width * item, index: item })}
        initialNumToRender={1}
        windowSize={3}
        maxToRenderPerBatch={1}
        renderItem={({ item, index: page }) => (
          <View style={{ width }}>
            <BoardPage
              groupId={groupId}
              day={item}
              isToday={page === 0}
              active={focused && Math.abs(page - index) <= 1}
              bottomInset={navInset + 76}
              onInvite={() => setInviteOpen(true)}
            />
          </View>
        )}
      />

      <ChatBar board={board.data} bottom={navInset + 8} onPress={() => setChatOpen(true)} />
      <ChatSheet
        groupId={groupId}
        groupName={header?.name ?? ''}
        day={day}
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
      />
      <InviteSheet groupId={groupId} visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </View>
  )
}

function BoardPage({
  groupId,
  day,
  isToday,
  active,
  bottomInset,
  onInvite,
}: {
  groupId: string
  day: string
  isToday: boolean
  active: boolean
  bottomInset: number
  onInvite: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const board = useGroupBoard(groupId, day, active)
  const [expanded, setExpanded] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const { width } = useWindowDimensions()
  // The grid runs nearly edge to edge on the page itself, with no card around
  // it, so the tiles get the width rather than margins and frames.
  const tile = Math.floor((width - EDGE * 2 - MEMBER_COLUMN - WORKOUT_COLUMN - GAP * 4) / 3)

  if (!board.data) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: EDGE }}>
        {board.isError ? (
          <EmptyState
            title={t('loadFailed')}
            action={
              <Button variant="secondary" onPress={() => void board.refetch()}>
                {t('retry')}
              </Button>
            }
          />
        ) : (
          <View className="gap-2 rounded-card bg-surface p-2">
            {SKELETON_ROWS.map((row) => (
              <View key={row} style={{ height: tile }}>
                <Skeleton className="h-full w-full rounded-tile" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    )
  }

  const members = board.data.members
  const shown = expanded ? members : members.slice(0, FOLDED_ROWS)
  const hidden = members.length - FOLDED_ROWS

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: bottomInset, paddingHorizontal: EDGE }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: GAP }}>
        <ColumnHeaders tile={tile} />
        {shown.map((member) => (
          <MemberRow
            key={member.person.id}
            groupId={groupId}
            day={day}
            isToday={isToday}
            member={member}
            tile={tile}
            onOpen={(meal, index) => setOpen({ member, meal, index })}
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
      {members.length === 1 ? (
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
        open={open}
        // The sheet follows the board's latest copy, so a reaction redraws it.
        member={
          open ? (members.find((m) => m.person.id === open.member.person.id) ?? open.member) : null
        }
        onClose={() => setOpen(null)}
      />
    </ScrollView>
  )
}

function ColumnHeaders({ tile }: { tile: number }) {
  const { t } = useTranslation('groups')
  const label = (text: string, width: number) => (
    <Text
      variant="micro"
      className="text-center uppercase tracking-[0.6px]"
      style={{ width }}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {text}
    </Text>
  )
  return (
    <View className="flex-row items-center pt-1" style={{ gap: GAP }}>
      <View style={{ width: MEMBER_COLUMN }} />
      {GROUP_MEALS.map((meal) => (
        <View key={meal}>{label(t(meal), tile)}</View>
      ))}
      {label(t('workout'), WORKOUT_COLUMN)}
    </View>
  )
}

const MemberRow = memo(function MemberRow({
  groupId,
  day,
  isToday,
  member,
  tile,
  onOpen,
}: {
  groupId: string
  day: string
  isToday: boolean
  member: BoardMember
  tile: number
  onOpen: (meal: GroupMeal, index: number) => void
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
        <Text variant="micro" className="text-ink" numberOfLines={1}>
          {isSelf ? t('you') : member.person.name.split(' ')[0]}
        </Text>
      </View>
      {GROUP_MEALS.map((meal) => (
        <MealTile
          key={meal}
          groupId={groupId}
          day={day}
          meal={meal}
          member={member}
          entries={byMeal[meal]}
          size={tile}
          isSelf={isSelf}
          isToday={isToday}
          onOpen={(index) => onOpen(meal, index)}
        />
      ))}
      <WorkoutCell workout={member.workout} height={tile} />
    </View>
  )
})

function MealTile({
  groupId,
  day,
  meal,
  member,
  entries,
  size,
  isSelf,
  isToday,
  onOpen,
}: {
  groupId: string
  day: string
  meal: GroupMeal
  member: BoardMember
  entries: BoardEntry[]
  size: number
  isSelf: boolean
  isToday: boolean
  onOpen: (index: number) => void
}) {
  const { t } = useTranslation('groups')
  const router = useRouter()
  const viewer = useUserId()
  const [page, setPage] = useState(0)
  const box = { width: size, height: size }

  if (entries.length > 0) {
    return (
      <View className="overflow-hidden rounded-[14px] bg-surface-alt" style={box}>
        <ScrollView
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
              onPress={() => onOpen(index)}
              accessibilityRole="button"
              accessibilityLabel={`${entry.name}, ${entry.kcal} kcal`}
            >
              <EntryFace entry={entry} meal={meal} ownerId={member.person.id} size={size} />
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
                  index === page ? 'w-3 bg-white' : 'w-1.5 bg-white/50',
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
      <EmptyTile size={size} />
    )
  }

  const nudge = member.nudges[meal]
  if (nudge) {
    return (
      <View
        className="items-center justify-center gap-0.5 rounded-[14px] bg-surface-alt px-1"
        style={box}
      >
        <Icon set="system" name="bell" size={18} />
        <Text variant="micro" className="text-center" numberOfLines={2}>
          {nudge.by.id === viewer
            ? t('nudgedByYou')
            : t('nudgedBy', { name: nudge.by.name.split(' ')[0] })}
        </Text>
      </View>
    )
  }
  if (member.nudgeable.includes(meal)) {
    return <NudgeTile groupId={groupId} day={day} meal={meal} member={member} size={size} />
  }
  return <EmptyTile size={size} />
}

function EntryFace({
  entry,
  meal,
  ownerId,
  size,
}: {
  entry: BoardEntry
  meal: GroupMeal
  ownerId: string
  size: number
}) {
  const reacted = entry.likes > 0 || entry.dislikes > 0
  const photo = Boolean(entry.photo_path)
  return (
    <View className={cn('flex-1', !photo && MEAL_TINT[meal])}>
      <View className="absolute inset-0" style={photo ? undefined : { paddingBottom: 22 }}>
        <EntryPicture entry={entry} ownerId={ownerId} iconSize={Math.round(size * 0.48)} />
      </View>
      {reacted ? (
        <View className="absolute right-1 top-1 flex-row items-center gap-1 rounded-full bg-surface/85 px-1.5 py-0.5">
          {entry.likes > 0 ? (
            <Text variant="micro" className="text-ink">
              👍{entry.likes}
            </Text>
          ) : null}
          {entry.dislikes > 0 ? (
            <Text variant="micro" className="text-ink">
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
        >
          {entry.name}
        </Text>
        <Text
          variant="micro"
          className={cn('text-[10px] leading-[12px]', photo ? 'text-white/85' : 'text-muted')}
          numberOfLines={1}
          style={photo ? TEXT_SHADOW : undefined}
        >
          {entry.kcal} kcal
        </Text>
      </View>
    </View>
  )
}

const PHOTO_FADE = {
  experimental_backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.62))',
} as const
const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
} as const

function NudgeTile({
  groupId,
  day,
  meal,
  member,
  size,
}: {
  groupId: string
  day: string
  meal: GroupMeal
  member: BoardMember
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
  return (
    <View
      className="items-center justify-center rounded-[14px] bg-surface-alt"
      style={{ width: size, height: size }}
    >
      <Tappable
        className="min-h-[32px] flex-row items-center rounded-full bg-hibiscus-soft px-2"
        onPress={() => void nudge()}
        disabled={task.isPending}
        accessibilityRole="button"
        accessibilityLabel={t('nudgeLabel', { name: member.person.name, meal: t(meal) })}
      >
        <Text variant="micro" className="text-hibiscus-ink">
          👋 {t('nudge')}
        </Text>
      </Tappable>
    </View>
  )
}

function EmptyTile({ size }: { size: number }) {
  return (
    <View
      className="items-center justify-center rounded-[14px] bg-surface-alt"
      style={{ width: size, height: size }}
    >
      <View className="h-0.5 w-4 rounded-full bg-line-strong" />
    </View>
  )
}

function WorkoutCell({ workout, height }: { workout: BoardMember['workout']; height: number }) {
  if (!workout) {
    return (
      <View
        className="items-center justify-center rounded-[14px] bg-surface-alt"
        style={{ width: WORKOUT_COLUMN, height }}
      >
        <View className="h-0.5 w-4 rounded-full bg-line-strong" />
      </View>
    )
  }
  return (
    <View
      className="items-center justify-center gap-0.5 rounded-[14px] bg-hibiscus-soft px-1"
      style={{ width: WORKOUT_COLUMN, height }}
      accessible
      accessibilityLabel={`${workout.name}, ${shortDuration(workout.duration_s)}`}
    >
      <Icon {...workoutIcon(workout.kind)} size={26} />
      <Text variant="micro" className="text-ink" numberOfLines={1}>
        {workout.name}
      </Text>
      <Text variant="micro" className="text-[10px] leading-[12px]" numberOfLines={1}>
        {shortDuration(workout.duration_s)}
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
  board: Board | undefined
  bottom: number
  onPress: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const last = board?.chat.last
  const unread = board?.chat.unread ?? 0
  const insets = useSafeAreaInsets()
  return (
    <View
      className="absolute inset-x-0"
      style={{ bottom: Math.max(bottom, insets.bottom), paddingHorizontal: EDGE }}
      pointerEvents="box-none"
    >
      <Tappable
        className="min-h-[52px] flex-row items-center gap-3 rounded-tile border border-line bg-surface px-3"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('chat')}
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
          {last ? `${last.author.name.split(' ')[0]}: ${last.body}` : t('chatEmpty')}
        </Text>
        <Icon set="ui" name="chevron-up" size={18} tintColor={colors.muted} />
      </Tappable>
    </View>
  )
}
