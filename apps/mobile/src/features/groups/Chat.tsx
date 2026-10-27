import { format, isToday, isYesterday, parseISO } from 'date-fns'
import * as Haptics from 'expo-haptics'
import { useFocusEffect, useIsFocused } from 'expo-router'
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppState,
  FlatList,
  Platform,
  type ScrollViewProps,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { KeyboardChatScrollView } from 'react-native-keyboard-controller'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUserId } from '@/data'
import {
  type ChatFood,
  type ChatQuote,
  type ChatWorkout,
  type GroupMessage,
  MESSAGE_REACTIONS,
  type MessageReaction,
  ownMessage,
  type RecentFoodPost,
  useGroupAction,
  useGroupChatLive,
  useGroupDetails,
  useGroupThread,
  useMyGroups,
  useReadAsItArrives,
  useRecentFoodPosts,
  useRecentWorkouts,
} from '@/data/groups'
import { useBlockAuthor } from '@/data/moderation'
import { count, distance, duration } from '@/features/activity/format'
import { showsDistance, workoutIcon, workoutKindKey } from '@/features/activity/workoutKind'
import { type Outgoing, useOutbox } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { dismissGroupChatNotifications, showingGroupChat } from '@/lib/notifications'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  cn,
  footerKeyboardOffset,
  Icon,
  IconButton,
  Screen,
  SegmentedControl,
  Sheet,
  Skeleton,
  Spinner,
  Tappable,
  Text,
} from '@/ui'
import { MacroChips } from './MealSheet'
import {
  EntryPicture,
  PersonAvatarLink,
  useGroupTask,
  useOpenGroupWorkout,
  useOpenProfile,
} from './parts'

/** Whether the app is in front, rather than behind the notification shade or in the background. */
function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    )
    return () => subscription.remove()
  }, [])
  return active
}

/** What a send carries besides its text, drawn with it while it is on its way. */
type SendMeta = { replyTo?: ChatQuote; food?: ChatFood; workout?: ChatWorkout }

/** The quote a reply draws of the message it answers. */
const quoteOf = (message: GroupMessage): ChatQuote => ({
  id: message.id,
  author: message.author,
  body: message.body,
  is_food: Boolean(message.food),
})

/** One of the viewer's posts as the card it becomes once sent. */
const foodOf = (post: RecentFoodPost): ChatFood => ({
  post_id: post.id,
  name: post.food_name ?? '',
  icon_set: post.icon_set,
  icon_name: post.icon_name,
  photo_path: post.photo_path,
  serving_label: null,
  logged_at: post.created_at,
  kcal: post.kcal ?? 0,
  carbs_g: post.carbs_g ?? 0,
  protein_g: post.protein_g ?? 0,
  fat_g: post.fat_g ?? 0,
})

/**
 * A group's chat, as a screen of its own laid out the way every messenger is:
 * the thread fills the page from the bottom and the composer sits on the
 * keyboard. A sheet put the composer under the keyboard, since a sheet's body
 * does not move for it; `Screen` lifts its footer with the keyboard and the
 * thread scrolls itself out of the way in the same frames.
 *
 * One thread for the group, as any group chat is. It opens on the newest page
 * and reads the one before as the viewer scrolls up; a chip marks where each
 * day starts. A message is answered by swiping it right, as on WhatsApp, and
 * reacted to with a double tap (a heart) or from the menu a long press opens,
 * as on Instagram. The + beside the field shares one of the viewer's recent
 * food posts as a card.
 */
export function ChatScreen({
  groupId,
  reply = false,
}: {
  groupId: string
  /** Opened from its notification, so the keyboard comes up to answer it. */
  reply?: boolean
}) {
  const { t } = useTranslation(['groups', 'common', 'social'])
  const back = useBack('/groups')
  const viewer = useUserId()
  const name = useMyGroups().data?.find((group) => group.id === groupId)?.name ?? ''
  const live = useGroupChatLive(groupId)
  const { thread, loadOlder, loadingOlder } = useGroupThread(groupId, live)
  const messages = thread.data?.messages
  const task = useGroupTask()
  const [selected, setSelected] = useState<GroupMessage | null>(null)
  const [replying, setReplying] = useState<GroupMessage | null>(null)
  const [picking, setPicking] = useState(false)
  const block = useBlockAuthor()
  const field = useRef<React.ComponentRef<typeof TextInput>>(null)
  const list = useRef<FlatList<ChatItem>>(null)
  // Sending lands the viewer on what they sent, as a messenger does, however
  // far up the thread they had scrolled. Inverted, so the newest is offset 0.
  const toNewest = useCallback(
    () => list.current?.scrollToOffset({ offset: 0, animated: true }),
    [],
  )
  // The same switch as the group's settings: off, neither this chat's
  // messages nor nudges ring the phone. Unknown until the details load, and
  // the bell waits for them rather than guess.
  const notify = useGroupDetails(groupId).data?.notify

  // Pushes for this thread stay quiet while it is on screen.
  useFocusEffect(useCallback(() => showingGroupChat(groupId), [groupId]))

  // Opening the chat reads it once the thread is on screen, which clears the
  // bar's count: read before the first page landed, a message written in
  // between would be shown and still be pushed. Leaving reads it
  // again only if the thread changed while it was open, judged from the thread
  // as it first loaded rather than the empty one at mount, and then rereads the
  // board's chat bar so its preview is the latest message rather than the one before.
  const action = useGroupAction()
  const markRead = action.mutate
  const latest = messages?.at(-1)?.id ?? null
  const seen = useRef<{ first?: string | null; now: string | null }>({ now: null })
  if (messages) {
    if (seen.current.first === undefined) seen.current.first = latest
    seen.current.now = latest
  }
  const loaded = messages !== undefined
  useEffect(() => {
    if (loaded) markRead({ action: 'read', groupId })
  }, [loaded, groupId, markRead])
  useEffect(() => {
    void dismissGroupChatNotifications(groupId)
    const opened = seen.current
    return () => {
      if (opened.first !== undefined && opened.now !== opened.first) {
        markRead({ action: 'read', groupId, refresh: true })
      }
    }
  }, [groupId, markRead])

  // A message from someone else that lands while the thread is in front of the
  // viewer is read there and then, so its push, sent a few seconds later, does
  // not ring this phone about what its owner just watched arrive.
  const focused = useIsFocused()
  const active = useAppActive()
  useReadAsItArrives(
    groupId,
    messages?.at(-1)?.mine === false ? latest : null,
    seen.current.first,
    focused && active,
  )
  // Back in front with this chat open, anything it rang for meanwhile has been read.
  useEffect(() => {
    if (focused && active) void dismissGroupChatNotifications(groupId)
  }, [focused, active, groupId])

  // Sent messages are drawn at once from the outbox and swapped for the
  // server's rows as they arrive; the field never waits.
  const serverIds = useMemo(() => new Set((messages ?? []).map((m) => m.id)), [messages])
  const outbox = useOutbox<SendMeta>(
    `group:${groupId}`,
    async (item) => {
      const id = await action.mutateAsync({
        action: 'message',
        groupId,
        body: item.body,
        requestId: item.requestId,
        replyTo: item.meta?.replyTo?.id,
        postId: item.meta?.food?.post_id,
        workout: item.meta?.workout,
        sent: {
          reply_to: item.meta?.replyTo ?? null,
          food: item.meta?.food ?? null,
          workout: item.meta?.workout ?? null,
        },
      })
      track('Group Message Sent', {})
      return typeof id === 'string' ? id : null
    },
    serverIds,
  )
  const { send, retry } = outbox
  const sendText = useCallback(
    (body: string) => {
      send(body, replying ? { replyTo: quoteOf(replying) } : undefined)
      setReplying(null)
      toNewest()
    },
    [send, replying, toNewest],
  )
  // The server writes a shared thing's body (its name and its calories or
  // minutes), which is what a push and an older app read. A reply being
  // written is answered by what is shared, rather than left to quote whatever
  // is typed next.
  const share = useCallback(
    (shared: Pick<SendMeta, 'food' | 'workout'>) => {
      setPicking(false)
      send('', { ...shared, ...(replying ? { replyTo: quoteOf(replying) } : {}) })
      setReplying(null)
      toNewest()
    },
    [send, replying, toNewest],
  )
  const sendFood = useCallback((post: RecentFoodPost) => share({ food: foodOf(post) }), [share])
  const sendWorkout = useCallback((workout: ChatWorkout) => share({ workout }), [share])

  const openPicker = useCallback(() => setPicking(true), [])
  const cancelReply = useCallback(() => setReplying(null), [])
  const startReply = useCallback((message: GroupMessage) => {
    setReplying(message)
    field.current?.focus()
  }, [])
  const react = useCallback(
    (message: GroupMessage, emoji: MessageReaction | null) => {
      task.press({ action: 'reactMessage', groupId, messageId: message.id, emoji })
    },
    [task.press, groupId],
  )
  // A double tap gives a heart, and a second double tap takes it back.
  const heart = useCallback(
    (message: GroupMessage) => react(message, message.my_reaction === '❤️' ? null : '❤️'),
    [react],
  )

  // Newest first, for the inverted list: the outbox is newer than anything sent.
  // A chip goes above the first message of each day; above the oldest one held
  // only once there is nothing older, since the page before may continue its day.
  const more = thread.data?.more ?? false
  const rows = useMemo<ChatItem[]>(() => {
    const newestFirst: ChatRow[] = [
      ...[...outbox.pending].reverse().map((item) => ({
        ...ownMessage(viewer, item.requestId, item.body, item.createdAt, {
          reply_to: item.meta?.replyTo ?? null,
          food: item.meta?.food ?? null,
          workout: item.meta?.workout ?? null,
        }),
        outgoing: item,
      })),
      ...[...(messages ?? [])].reverse(),
    ]
    const items: ChatItem[] = []
    newestFirst.forEach((message, index) => {
      items.push(message)
      const day = localDay(message.created_at)
      const older = newestFirst[index + 1]
      if (older ? localDay(older.created_at) !== day : !more) {
        items.push({ id: `day:${day}`, day })
      }
    })
    return items
  }, [outbox.pending, messages, viewer, more])
  const renderItem = useCallback(
    ({ item, index }: { item: ChatItem; index: number }) =>
      'day' in item ? (
        <DayChip day={item.day} />
      ) : (
        // Inverted: the row above is the next one in the array. A day chip
        // between two messages starts a new run, as it has no author.
        <MessageRow
          message={item}
          first={authorOf(rows[index + 1]) !== item.author.id}
          last={authorOf(rows[index - 1]) !== item.author.id}
          onSelect={setSelected}
          onRetry={retry}
          onReply={startReply}
          onHeart={heart}
          groupId={groupId}
        />
      ),
    [rows, retry, startReply, heart, groupId],
  )
  // The thread rises with the composer as a scroll offset rather than a smaller
  // frame. The shell's padding relaid the screen out every frame, and the
  // composer followed the keys a beat behind them.
  const bottomInset = useSafeAreaInsets().bottom
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView {...props} inverted offset={footerKeyboardOffset(bottomInset)} />
    ),
    [bottomInset],
  )
  return (
    <Screen
      scroll={false}
      keyboardAvoid="footer"
      flush
      header={
        <AppBar
          onBack={back}
          backLabel={t('common:action.back')}
          action={
            notify === undefined ? undefined : (
              <IconButton
                size="sm"
                variant="ghost"
                accessibilityLabel={notify ? t('muteChat') : t('unmuteChat')}
                onPress={() => task.press({ action: 'preferences', groupId, notify: !notify })}
              >
                <Icon set="system" name={notify ? 'bell' : 'bell-off'} size={22} />
              </IconButton>
            )
          }
          titleContent={
            <View className="items-center">
              <Text variant="label" numberOfLines={1}>
                {name || t('chat')}
              </Text>
              <Text variant="micro">{t('chat')}</Text>
            </View>
          }
        />
      }
      footer={
        <Composer
          ref={field}
          groupName={name}
          onSend={sendText}
          onAttach={openPicker}
          autoFocus={reply}
          replying={replying}
          onCancelReply={cancelReply}
        />
      }
    >
      {thread.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : !messages && (thread.isError || thread.fetchStatus === 'paused') ? (
        <View className="flex-1 justify-center px-gutter">
          <QueryNotice
            error={thread.isError}
            paused={thread.fetchStatus === 'paused'}
            retry={() => thread.refetch()}
          />
        </View>
      ) : (
        <FlatList
          ref={list}
          className="flex-1"
          inverted
          renderScrollComponent={renderScrollComponent}
          data={rows}
          keyExtractor={(item) => item.id}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-gutter py-3"
          // Inverted, so the end is the top of the thread: scrolling up reads
          // the page before, with a spinner while it comes.
          onEndReached={more ? loadOlder : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingOlder ? (
              <View className="items-center py-3">
                <Spinner />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            // The list flips this itself, on both platforms.
            <View className="items-center py-xl">
              <Text variant="meta">{t('chatEmpty')}</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}
      <MessageMenu
        message={selected}
        onClose={() => setSelected(null)}
        onReact={(emoji) => {
          if (!selected) return
          react(selected, selected.my_reaction === emoji ? null : emoji)
          setSelected(null)
        }}
        onReply={() => {
          if (selected) startReply(selected)
          setSelected(null)
        }}
        onDelete={() => {
          if (selected) task.press({ action: 'deleteMessage', groupId, messageId: selected.id })
          setSelected(null)
        }}
        onReport={() => {
          if (selected) task.press({ action: 'reportMessage', groupId, messageId: selected.id })
          setSelected(null)
        }}
        onBlock={() => {
          if (selected) block.mutate(selected.author.id)
          setSelected(null)
        }}
      />
      <SharePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPickFood={sendFood}
        onPickWorkout={sendWorkout}
      />
    </Screen>
  )
}

/** The phone's own calendar day a message was written on, as `yyyy-MM-dd`. */
function localDay(createdAt: string): string {
  return format(parseISO(createdAt), 'yyyy-MM-dd')
}

/** "Today", "Yesterday" or the date, as the thread names a day. */
function dayLabel(at: Date, today: string, yesterday: string): string {
  if (isToday(at)) return today
  if (isYesterday(at)) return yesterday
  return format(at, datePattern('weekdayDayMonth'))
}

function DayChip({ day }: { day: string }) {
  const { t } = useTranslation('common')
  const label = dayLabel(parseISO(day), t('date.today'), t('date.yesterday'))
  return (
    <View className="items-center pb-3 pt-1">
      <View className="rounded-full bg-surface-alt px-3 py-1">
        <Text variant="micro">{label}</Text>
      </View>
    </View>
  )
}

/** The send button's size, larger than the field's height so a thumb finds it. */
const SEND = 48

/**
 * A pill field that grows to a few lines, a + on its left that shares a food,
 * and a round send button level with its last line. It holds its own draft,
 * so typing redraws the field and not the thread above it. A reply being
 * written shows what it answers above the field.
 */
const Composer = memo(function Composer({
  ref,
  groupName,
  onSend,
  onAttach,
  autoFocus,
  replying,
  onCancelReply,
}: {
  ref: React.Ref<React.ComponentRef<typeof TextInput>>
  groupName: string
  onSend: (body: string) => void
  onAttach: () => void
  autoFocus: boolean
  replying: GroupMessage | null
  onCancelReply: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const [value, onChange] = useState('')
  const ready = value.trim().length > 0
  const send = () => {
    const body = value.trim()
    if (!body) return
    onChange('')
    onSend(body)
  }
  const placeholder = groupName ? t('message', { name: groupName }) : t('send')
  return (
    <View className="gap-2">
      {replying ? (
        <View className="flex-row items-center gap-2 rounded-[16px] bg-surface-alt py-2 pl-3 pr-1">
          <View className="w-[3px] self-stretch rounded-full bg-pandan" />
          <View className="min-w-0 flex-1">
            <Text variant="micro" className="text-pandan-ink" numberOfLines={1}>
              {replying.mine
                ? t('replyingToSelf')
                : t('replyingTo', { name: replying.author.name })}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {replying.body}
            </Text>
          </View>
          <IconButton
            size="xs"
            variant="ghost"
            hitSlop={8}
            onPress={onCancelReply}
            accessibilityLabel={t('cancelReply')}
          >
            <Icon set="ui" name="close" size={16} tintColor={colors.muted} />
          </IconButton>
        </View>
      ) : null}
      <View className="flex-row items-end gap-2">
        <Tappable
          className="h-[44px] w-[44px] items-center justify-center rounded-full bg-surface-alt"
          // Level with the send button's middle, which is taller.
          style={{ marginBottom: (SEND - 44) / 2 }}
          hitSlop={6}
          onPress={onAttach}
          accessibilityRole="button"
          accessibilityLabel={t('shareFood')}
        >
          <Icon set="ui" name="plus" size={22} tintColor={colors.muted} />
        </Tappable>
        <View
          className="min-h-[44px] min-w-0 flex-1 justify-center rounded-[22px] border border-line bg-surface px-4"
          style={{ marginBottom: (SEND - 44) / 2 }}
        >
          <TextInput
            ref={ref}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={colors.faint}
            multiline
            maxLength={500}
            autoFocus={autoFocus}
            accessibilityLabel={placeholder}
            className="max-h-[120px] py-2.5 font-body text-[16px] leading-[21px] text-ink"
          />
        </View>
        {/* Bigger than the field is tall and with slop all round, since a
            44pt circle at the screen's corner was easy to miss. */}
        <Tappable
          className={cn(
            'items-center justify-center rounded-full',
            ready ? 'bg-pandan' : 'bg-disabled',
          )}
          style={{ width: SEND, height: SEND }}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
          disabled={!ready}
          onPress={send}
          accessibilityRole="button"
          accessibilityLabel={t('send')}
          accessibilityState={{ disabled: !ready }}
        >
          {/* The plane points up and right; nudged so it sits in the middle. */}
          <View style={{ marginLeft: -2, marginTop: 1 }}>
            <Icon
              set="ui"
              name="send"
              size={24}
              tintColor={ready ? colors.onPandan : colors.onDisabled}
            />
          </View>
        </Tappable>
      </View>
    </View>
  )
})

/**
 * One message. The author's picture and name show once at the start of a run
 * of their messages, and the time once at its end, as messengers do, so a
 * burst of short messages reads as one thought rather than a column of stamps.
 */
type ChatRow = GroupMessage & { outgoing?: Outgoing<SendMeta> }
/** A message, or the chip that starts a day. */
type ChatItem = ChatRow | { id: string; day: string }
const authorOf = (item: ChatItem | undefined) => (item && 'author' in item ? item.author.id : null)

/** The small face beside a bubble, and where the bubble starts after it. */
const AVATAR = 30
const BUBBLE_INDENT = AVATAR + 8

const MessageRow = memo(function MessageRow({
  message,
  first,
  last,
  onSelect,
  onRetry,
  onReply,
  onHeart,
  groupId,
}: {
  message: ChatRow
  groupId: string
  first: boolean
  last: boolean
  onSelect: (message: GroupMessage) => void
  onRetry: (requestId: string) => void
  onReply: (message: GroupMessage) => void
  onHeart: (message: GroupMessage) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const colors = useThemeColors()
  const openProfile = useOpenProfile()
  const openWorkout = useOpenGroupWorkout(groupId)
  const shared = message.workout
  const time = format(parseISO(message.created_at), datePattern('time'))
  const outgoing = message.outgoing
  const state = outgoing?.state
  const reactions = message.reactions ?? []
  const gap = first ? 'mt-3' : 'mt-1'
  const content = <MessageContent message={message} last={last} faded={state} />
  // A message still on its way has no actions: it has no id to act on yet.
  const actionable = !outgoing
  const bubble = actionable ? (
    <MessageGestures
      message={message}
      onMenu={onSelect}
      onReply={onReply}
      onHeart={onHeart}
      onOpen={shared ? () => openWorkout(shared) : undefined}
      label={[message.mine ? t('you') : message.author.name, message.body, time].join(', ')}
    >
      {content}
    </MessageGestures>
  ) : state === 'failed' && outgoing ? (
    <Tappable
      onPress={() => onRetry(outgoing.requestId)}
      accessibilityRole="button"
      accessibilityLabel={message.body}
      accessibilityHint={t('common:delivery.failed')}
    >
      {content}
    </Tappable>
  ) : (
    content
  )
  const pill =
    reactions.length > 0 ? (
      <ReactionPill
        reactions={reactions}
        mine={message.my_reaction ?? null}
        onPress={() => onSelect(message)}
      />
    ) : null
  if (message.mine) {
    return (
      <View className={cn('items-end', gap)}>
        <View className="max-w-[78%]">{bubble}</View>
        {pill ? <View className="-mt-1.5 mr-2">{pill}</View> : null}
        {state === 'failed' ? (
          <View className="mr-1 mt-1 flex-row items-center gap-1">
            <Icon set="ui" name="warning" size={12} tintColor={colors.hibiscusInk} />
            <Text variant="micro" className="text-hibiscus-ink">
              {t('common:delivery.failed')}
            </Text>
          </View>
        ) : state === 'sending' ? (
          <Text variant="micro" className="mr-1 mt-1">
            {t('common:delivery.sending')}
          </Text>
        ) : last ? (
          <Text variant="micro" className="mr-1 mt-1">
            {time}
          </Text>
        ) : null}
      </View>
    )
  }
  // The face sits level with the bottom of its bubble, as messengers draw it,
  // so the name above and the time below are set off the row rather than
  // inside it; inside, the time pushed the face below the bubble it belongs to.
  // The face and the name open the author's feed.
  return (
    <View className={gap}>
      {first ? (
        <Tappable
          haptics={false}
          className="mb-1 self-start"
          style={{ marginLeft: BUBBLE_INDENT + 6 }}
          onPress={() => openProfile(message.author.id)}
          accessibilityRole="button"
          accessibilityLabel={t('openProfile', { name: message.author.name })}
        >
          <Text variant="micro" className="text-ink">
            {message.author.name}
          </Text>
        </Tappable>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View style={{ width: AVATAR }}>
          {last ? <PersonAvatarLink person={message.author} size="xs" /> : null}
        </View>
        <View className="max-w-[78%]">{bubble}</View>
      </View>
      {pill ? (
        <View className="-mt-1.5 self-start" style={{ marginLeft: BUBBLE_INDENT + 6 }}>
          {pill}
        </View>
      ) : null}
      {last ? (
        <Text variant="micro" className="mt-1" style={{ marginLeft: BUBBLE_INDENT + 6 }}>
          {time}
        </Text>
      ) : null}
    </View>
  )
})

/** A bubble's inside: the quote it answers, then its text, or a food's card. */
function MessageContent({
  message,
  last,
  faded,
}: {
  message: GroupMessage
  last: boolean
  faded?: 'sending' | 'failed'
}) {
  const fade = faded === 'sending' ? 'opacity-70' : faded === 'failed' ? 'opacity-50' : undefined
  if (message.workout) {
    return (
      <View className={cn('gap-1', fade)}>
        {message.reply_to ? <Quote quote={message.reply_to} mine={false} /> : null}
        <WorkoutCard workout={message.workout} />
      </View>
    )
  }
  if (message.food) {
    // A food card has no bubble around it, so its quote is drawn on the page
    // in the plain colours whoever sent it.
    return (
      <View className={cn('gap-1', fade)}>
        {message.reply_to ? <Quote quote={message.reply_to} mine={false} /> : null}
        <FoodCard food={message.food} ownerId={message.author.id} />
      </View>
    )
  }
  const quote = message.reply_to ? <Quote quote={message.reply_to} mine={message.mine} /> : null
  return (
    <View
      className={cn(
        'rounded-[18px] px-3.5 py-2',
        message.mine ? 'bg-pandan' : 'bg-surface',
        last && (message.mine ? 'rounded-br-[6px]' : 'rounded-bl-[6px]'),
        fade,
      )}
    >
      {quote}
      <Text
        variant="body"
        className={cn('text-[16px] leading-[22px]', message.mine ? 'text-on-pandan' : 'text-ink')}
      >
        {message.body}
      </Text>
    </View>
  )
}

/** The message a reply answers, quoted at the top of its bubble with a bar down its side. */
function Quote({ quote, mine }: { quote: ChatQuote; mine: boolean }) {
  const { t } = useTranslation('groups')
  return (
    <View
      className={cn(
        'mb-1.5 mt-0.5 flex-row gap-2 overflow-hidden rounded-[10px] py-1.5 pl-2 pr-2.5',
        mine ? 'bg-black/10' : 'bg-surface-alt',
      )}
      accessible
      accessibilityLabel={t('quoting', { name: quote.author.name, body: quote.body })}
    >
      <View className={cn('w-[3px] rounded-full', mine ? 'bg-on-pandan' : 'bg-pandan')} />
      <View className="min-w-0 shrink">
        <Text
          variant="micro"
          numberOfLines={1}
          className={mine ? 'text-on-pandan' : 'text-pandan-ink'}
        >
          {quote.author.name}
        </Text>
        <Text
          variant="caption"
          numberOfLines={2}
          className={mine ? 'text-on-pandan opacity-80' : undefined}
        >
          {quote.body}
        </Text>
      </View>
    </View>
  )
}

/** "Morning run", or the kind in the reader's language when it has no name of its own. */
function useWorkoutName() {
  // As an array, which is how the kind keys carry their namespace.
  const { t } = useTranslation(['activity'])
  return (workout: Pick<ChatWorkout, 'name' | 'kind'>) =>
    workout.name ?? t(workoutKindKey(workout.kind))
}

/**
 * A workout shared into the chat: its kind's drawing and name on a band in the
 * colour workouts wear on the board, then up to three figures underneath. A
 * run gets its distance; a logger workout its exercises and sets; either what
 * it burned when that is known.
 */
function WorkoutCard({ workout }: { workout: ChatWorkout }) {
  const { t } = useTranslation(['groups', 'common'])
  const { width } = useWindowDimensions()
  const name = useWorkoutName()(workout)
  const cardWidth = Math.min(280, Math.round(width * 0.7))
  const far = showsDistance(workout.kind) ? distance(workout.distance_m) : null
  const stats = [
    { key: 'time', label: t('statTime'), value: duration(workout.duration_s) },
    far ? { key: 'distance', label: t('statDistance'), value: far } : null,
    workout.source === 'workout' && workout.exercises
      ? { key: 'exercises', label: t('statExercises'), value: count(workout.exercises) }
      : null,
    workout.source === 'workout' && workout.sets
      ? { key: 'sets', label: t('statSets'), value: count(workout.sets) }
      : null,
    workout.kcal
      ? {
          key: 'kcal',
          label: t('statActive'),
          value: `${count(workout.kcal)} ${t('common:unit.kcal')}`,
        }
      : null,
  ]
    .filter((stat) => stat !== null)
    .slice(0, 3)
  return (
    <View
      className="overflow-hidden rounded-[18px] border border-line bg-surface"
      style={{ width: cardWidth }}
    >
      <View className="flex-row items-center gap-3 bg-hibiscus-soft px-3 py-3">
        <Icon {...workoutIcon(workout.kind)} size={44} />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="meta" numberOfLines={1}>
            {postedAt(workout.started_at, t('common:date.today'), t('common:date.yesterday'))}
          </Text>
        </View>
      </View>
      <View className="flex-row py-3">
        {stats.map((stat, index) => (
          <View
            key={stat.key}
            className={cn('min-w-0 flex-1 items-center px-2', index > 0 && 'border-l border-line')}
          >
            <Text variant="micro" numberOfLines={1}>
              {stat.label}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              className="font-body-black text-[16px] leading-[21px] text-ink"
            >
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** A food shared into the chat: its photo across the card, then its numbers. */
function FoodCard({ food, ownerId }: { food: ChatFood; ownerId: string }) {
  const { t } = useTranslation(['groups', 'common'])
  const { width } = useWindowDimensions()
  // Most of a phone's width, as the mockup's card is, and no wider on a tablet.
  const cardWidth = Math.min(280, Math.round(width * 0.7))
  return (
    <View
      className="overflow-hidden rounded-[18px] border border-line bg-surface"
      style={{ width: cardWidth }}
    >
      <View
        className={cn('w-full overflow-hidden', !food.photo_path && 'bg-pandan-soft')}
        style={{ height: Math.round(cardWidth * 0.75) }}
      >
        <EntryPicture entry={food} ownerId={ownerId} iconSize={96} />
      </View>
      <View className="gap-1.5 p-3">
        <Text variant="label" numberOfLines={2}>
          {food.name}
        </Text>
        <View className="flex-row items-baseline gap-1">
          <Text className="font-display text-[22px] leading-[28px] text-heading">
            {Math.round(food.kcal).toLocaleString()}
          </Text>
          <Text variant="caption">{t('common:unit.kcal')}</Text>
        </View>
        <MacroChips food={food} compact />
      </View>
    </View>
  )
}

/** The emoji under a bubble: up to three kinds, and how many there are when more than one. */
function ReactionPill({
  reactions,
  mine,
  onPress,
}: {
  reactions: { emoji: string; count: number }[]
  mine: string | null
  onPress: () => void
}) {
  const { t } = useTranslation('groups')
  const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0)
  return (
    <Tappable
      haptics={false}
      hitSlop={6}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-0.5 rounded-full border px-1.5 py-0.5',
        mine ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
      accessibilityRole="button"
      accessibilityLabel={reactions
        .map((reaction) => t('reactionCount', { emoji: reaction.emoji, count: reaction.count }))
        .join(', ')}
    >
      {reactions.slice(0, 3).map((reaction) => (
        <Text key={reaction.emoji} className="text-[14px] leading-[18px]">
          {reaction.emoji}
        </Text>
      ))}
      {total > 1 ? (
        <Text variant="micro" className="ml-0.5 text-ink">
          {total}
        </Text>
      ) : null}
    </Tappable>
  )
}

/** How far a bubble must be dragged right before letting go answers it. */
const REPLY_AT = 56

/**
 * The gestures on a sent message. A drag to the right pulls the bubble along
 * and shows the reply arrow; let go past it and the composer quotes the
 * message, as WhatsApp does. A double tap hearts it, as Instagram does, with
 * the heart popping over the bubble. A long press opens the menu. A screen
 * reader reaches all three as named actions.
 */
function MessageGestures({
  message,
  label,
  onMenu,
  onReply,
  onHeart,
  onOpen,
  children,
}: {
  message: GroupMessage
  label: string
  onMenu: (message: GroupMessage) => void
  onReply: (message: GroupMessage) => void
  onHeart: (message: GroupMessage) => void
  /** What a single tap opens: a workout card's workout. Most messages open nothing. */
  onOpen?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation('groups')
  const reduceMotion = useReducedMotion()
  const shift = useSharedValue(0)
  const armed = useSharedValue(false)
  const pop = useSharedValue(0)

  const tick = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }
  const reply = () => onReply(message)
  const pan = Gesture.Pan()
    // Rightward only, and only after a clear sideways intent, so the thread's
    // vertical scroll is never taken.
    .activeOffsetX(14)
    .failOffsetX(-14)
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Follows the finger, then resists past the point where it counts.
      const x = Math.max(0, event.translationX)
      shift.value = x < REPLY_AT ? x : REPLY_AT + (x - REPLY_AT) * 0.25
      const past = x >= REPLY_AT
      if (past !== armed.value) {
        armed.value = past
        if (past) runOnJS(tick)()
      }
    })
    .onEnd((_event, success) => {
      if (success && armed.value) runOnJS(reply)()
    })
    .onFinalize(() => {
      armed.value = false
      shift.value = withSpring(0, { damping: 18, stiffness: 240 })
    })
  const heart = () => {
    const giving = message.my_reaction !== '❤️'
    if (giving && !reduceMotion) {
      pop.value = 0.4
      pop.value = withSpring(1, { damping: 10, stiffness: 260 })
      pop.value = withDelay(500, withTiming(0, { duration: 200 }))
    }
    if (giving) tick()
    onHeart(message)
  }
  // A finger held past a tap's length fails the double tap at once, so the
  // long press below is not kept waiting for it.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDelay(250)
    .runOnJS(true)
    .onEnd(heart)
  const longPress = Gesture.LongPress()
    .minDuration(300)
    .runOnJS(true)
    .onStart(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      onMenu(message)
    })
  // A single tap only once a double tap and a hold have both been ruled out,
  // so tapping twice hearts a workout card rather than opening it.
  const singleTap = Gesture.Tap()
    .enabled(Boolean(onOpen))
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) onOpen?.()
    })
  const gesture = Gesture.Race(pan, Gesture.Exclusive(doubleTap, longPress, singleTap))

  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }))
  const arrow = useAnimatedStyle(() => ({
    opacity: interpolate(shift.value, [12, REPLY_AT], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(shift.value, [12, REPLY_AT], [0.6, 1], 'clamp') }],
  }))
  const popped = useAnimatedStyle(() => ({
    opacity: pop.value > 0.05 ? 1 : 0,
    transform: [{ scale: pop.value }],
  }))
  return (
    <View>
      <Animated.View
        className="absolute bottom-0 top-0 justify-center"
        style={[{ left: -36 }, arrow]}
        pointerEvents="none"
      >
        <View className="h-8 w-8 items-center justify-center rounded-full bg-surface-alt">
          <Icon set="ui" name="reply" size={18} />
        </View>
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={moving}
          accessible
          accessibilityLabel={label}
          accessibilityRole={onOpen ? 'button' : undefined}
          accessibilityActions={[
            ...(onOpen ? [{ name: 'activate' as const }] : []),
            { name: 'longpress', label: t('messageActions') },
            { name: 'reply', label: t('reply') },
            { name: 'heart', label: t('heart') },
          ]}
          onAccessibilityAction={(event) => {
            const name = event.nativeEvent.actionName
            if (name === 'activate') onOpen?.()
            else if (name === 'reply') onReply(message)
            else if (name === 'heart') onHeart(message)
            else onMenu(message)
          }}
        >
          {children}
          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
            style={popped}
          >
            <Text className="text-[40px] leading-[48px]">❤️</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

/**
 * What a long press opens: the reactions in a row along the top, as Instagram
 * puts them, then reply and what moderation needs (delete your own; report or
 * block someone else's, since anything one person writes for another needs both).
 */
function MessageMenu({
  message,
  onClose,
  onReact,
  onReply,
  onDelete,
  onReport,
  onBlock,
}: {
  message: GroupMessage | null
  onClose: () => void
  onReact: (emoji: MessageReaction) => void
  onReply: () => void
  onDelete: () => void
  onReport: () => void
  onBlock: () => void
}) {
  const { t } = useTranslation(['groups', 'common', 'social'])
  // What the sheet was showing, kept while it slides away.
  const shown = useRef<GroupMessage | null>(null)
  if (message) shown.current = message
  const current = shown.current
  return (
    <Sheet
      visible={message !== null}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      description={current?.body}
    >
      <View className="gap-md">
        <View className="flex-row justify-between rounded-full bg-surface-alt px-2 py-1.5">
          {MESSAGE_REACTIONS.map((emoji) => {
            const chosen = current?.my_reaction === emoji
            return (
              <Tappable
                key={emoji}
                onPress={() => onReact(emoji)}
                className={cn(
                  'h-12 w-12 items-center justify-center rounded-full',
                  chosen && 'bg-pandan-soft',
                )}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={t('reactWith', { emoji })}
              >
                <Text className="text-[28px] leading-[34px]">{emoji}</Text>
              </Tappable>
            )
          })}
        </View>
        <Button
          fullWidth
          variant="secondary"
          leftIcon={<Icon set="ui" name="reply" size={20} />}
          onPress={onReply}
        >
          {t('reply')}
        </Button>
        {current?.mine ? (
          <Button fullWidth variant="danger" onPress={onDelete}>
            {t('deleteMessage')}
          </Button>
        ) : (
          <>
            <Button fullWidth variant="secondary" onPress={onReport}>
              {t('report')}
            </Button>
            <Button fullWidth variant="danger" onPress={onBlock}>
              {t('social:block')}
            </Button>
          </>
        )}
      </View>
    </Sheet>
  )
}

/**
 * The + beside the field: the viewer's last five food posts, or their last
 * five workouts (logged in the app or recorded by a health store), one tap to
 * share. Opens on food, the thing most shared.
 */
function SharePicker({
  visible,
  onClose,
  onPickFood,
  onPickWorkout,
}: {
  visible: boolean
  onClose: () => void
  onPickFood: (post: RecentFoodPost) => void
  onPickWorkout: (workout: ChatWorkout) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const [tab, setTab] = useState<'food' | 'workouts'>('food')
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        onClose()
        setTab('food')
      }}
      closeLabel={t('common:action.close')}
      title={t('share')}
    >
      <View className="gap-md">
        <SegmentedControl
          options={[
            { value: 'food', label: t('tabFood') },
            { value: 'workouts', label: t('tabWorkouts') },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t('share')}
        />
        {tab === 'food' ? (
          <FoodChoices visible={visible} onPick={onPickFood} />
        ) : (
          <WorkoutChoices visible={visible} onPick={onPickWorkout} />
        )}
      </View>
    </Sheet>
  )
}

/** Three grey rows while a list of choices loads. */
function ChoicesSkeleton() {
  return (
    <View className="gap-3">
      {[0, 1, 2].map((key) => (
        <View key={key} className="flex-row items-center gap-3">
          <Skeleton rounded={false} width={56} height={56} className="rounded-[14px]" />
          <Skeleton width={160} height={14} />
        </View>
      ))}
    </View>
  )
}

/** One thing to share: its picture, name, when, and a figure on the right. */
function Choice({
  picture,
  name,
  when,
  figure,
  first,
  onPress,
}: {
  picture: ReactNode
  name: string
  when: string
  figure: string
  first: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('groups')
  return (
    <Tappable
      onPress={onPress}
      className={cn('flex-row items-center gap-3 py-2.5', !first && 'border-t border-line')}
      accessibilityRole="button"
      accessibilityLabel={t('shareThis', { name })}
    >
      {picture}
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {when}
        </Text>
      </View>
      <Text variant="label">{figure}</Text>
    </Tappable>
  )
}

function FoodChoices({
  visible,
  onPick,
}: {
  visible: boolean
  onPick: (post: RecentFoodPost) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const viewer = useUserId()
  const posts = useRecentFoodPosts(visible)
  if (posts.isLoading) return <ChoicesSkeleton />
  if (!posts.data && (posts.isError || posts.fetchStatus === 'paused')) {
    return (
      <QueryNotice
        error={posts.isError}
        paused={posts.fetchStatus === 'paused'}
        retry={() => posts.refetch()}
      />
    )
  }
  if (!posts.data?.length) {
    return (
      <Text variant="meta" className="py-md text-center">
        {t('shareFoodEmpty')}
      </Text>
    )
  }
  return (
    <View>
      {posts.data.map((post, index) => (
        <Choice
          key={post.id}
          first={index === 0}
          onPress={() => onPick(post)}
          name={post.food_name ?? ''}
          when={postedAt(post.created_at, t('common:date.today'), t('common:date.yesterday'))}
          figure={`${count(post.kcal ?? 0)} ${t('common:unit.kcal')}`}
          picture={
            <View
              className={cn(
                'h-14 w-14 overflow-hidden rounded-[14px]',
                !post.photo_path && 'bg-pandan-soft',
              )}
            >
              <EntryPicture entry={foodOf(post)} ownerId={viewer} iconSize={36} />
            </View>
          }
        />
      ))}
    </View>
  )
}

function WorkoutChoices({
  visible,
  onPick,
}: {
  visible: boolean
  onPick: (workout: ChatWorkout) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const workouts = useRecentWorkouts(visible)
  const nameOf = useWorkoutName()
  if (workouts.isLoading) return <ChoicesSkeleton />
  if (!workouts.data && (workouts.isError || workouts.fetchStatus === 'paused')) {
    return (
      <QueryNotice
        error={workouts.isError}
        paused={workouts.fetchStatus === 'paused'}
        retry={() => workouts.refetch()}
      />
    )
  }
  if (!workouts.data?.length) {
    return (
      <Text variant="meta" className="py-md text-center">
        {t('shareWorkoutEmpty')}
      </Text>
    )
  }
  return (
    <View>
      {workouts.data.map((workout, index) => (
        <Choice
          key={`${workout.source}:${workout.id}`}
          first={index === 0}
          onPress={() => onPick(workout)}
          name={nameOf(workout)}
          when={postedAt(workout.started_at, t('common:date.today'), t('common:date.yesterday'))}
          figure={duration(workout.duration_s)}
          picture={
            <View className="h-14 w-14 items-center justify-center rounded-[14px] bg-hibiscus-soft">
              <Icon {...workoutIcon(workout.kind)} size={36} />
            </View>
          }
        />
      ))}
    </View>
  )
}

/** "Today, 12:42", "Yesterday, 19:05" or a date, for a post or a workout. */
function postedAt(createdAt: string, today: string, yesterday: string): string {
  const at = parseISO(createdAt)
  const day = dayLabel(at, today, yesterday)
  // The time only beside a relative day; a date is enough on its own.
  return isToday(at) || isYesterday(at) ? `${day}, ${format(at, datePattern('time'))}` : day
}
