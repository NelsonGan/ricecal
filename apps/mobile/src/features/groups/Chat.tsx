import { format, isToday, isYesterday, parseISO } from 'date-fns'
import * as Haptics from 'expo-haptics'
import { useFocusEffect, useIsFocused, useNavigation } from 'expo-router'
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppState,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  type ScrollViewProps,
  TextInput,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { KeyboardChatScrollView } from 'react-native-keyboard-controller'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
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
  useGroupChatPresence,
  useGroupDetails,
  useGroupThread,
  useMyGroups,
  useReadAsItArrives,
  useRecentFoodPosts,
  useRecentWorkouts,
} from '@/data/groups'
import { useBlockAuthor } from '@/data/moderation'
import { REPORT_REASONS, type ReportReason } from '@/data/types'
import { count, distance, duration } from '@/features/activity/format'
import { showsDistance, workoutIcon, workoutKindKey } from '@/features/activity/workoutKind'
import { type Outgoing, useOutbox } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { showTabUnder, useBack } from '@/lib/navigation'
import { dismissGroupChatNotifications, showingGroupChat } from '@/lib/notifications'
import { useTheme, useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Button,
  cn,
  footerKeyboardOffset,
  Icon,
  IconButton,
  RadioGroup,
  Screen,
  SegmentedControl,
  Sheet,
  Skeleton,
  Spinner,
  Tappable,
  Text,
} from '@/ui'
import { MacroChips, Thumbs, useVote } from './MealSheet'
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
 * reacted to with a double tap (a heart), as on Instagram, or from the emoji
 * bar a long press opens over it, as on WhatsApp. The + beside the field shares one of the viewer's recent
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
  const focused = useIsFocused()
  const online = useGroupChatPresence(groupId, focused)
  const live = useGroupChatLive(groupId)
  const { thread, loadOlder, loadingOlder } = useGroupThread(groupId, live)
  const messages = thread.data?.messages
  const task = useGroupTask()
  // The emoji bar a long press opens over the thread, and the sheet its ⋯ opens.
  const [picked, setPicked] = useState<Picked | null>(null)
  const [menu, setMenu] = useState<GroupMessage | null>(null)
  // The ⋯ sheet waits for the dimmed layer to finish closing: two native
  // modals at once is one too many on iOS.
  const menuNext = useRef<GroupMessage | null>(null)
  const [replying, setReplying] = useState<GroupMessage | null>(null)
  const [picking, setPicking] = useState(false)
  const block = useBlockAuthor()
  const field = useRef<React.ComponentRef<typeof TextInput>>(null)
  const list = useRef<FlatList<ChatItem>>(null)
  // Sending lands the viewer on what they sent, as a messenger does, however
  // far up the thread they had scrolled. Inverted, so the newest is offset 0,
  // except on iOS with the keyboard up: the keyboard is a top inset there and
  // the newest sits at minus its height. Scrolling to 0 dropped the thread
  // behind the keyboard on every send, which read as the chat jumping away.
  const inset = useRef(0)
  const onInset = useCallback((insets: { top: number }) => {
    inset.current = insets.top
  }, [])
  const toNewest = useCallback(
    () =>
      list.current?.scrollToOffset({
        offset: Platform.OS === 'ios' ? -inset.current : 0,
        animated: true,
      }),
    [],
  )
  // The same two switches as the group's settings: chat messages (with
  // nudges), and the foods and workouts members share. Unknown until the
  // details load, and the bell waits for them rather than guess.
  const details = useGroupDetails(groupId).data
  const notify = details?.notify
  const notifyUpdates = details?.notify_updates ?? notify
  const [muting, setMuting] = useState(false)

  // Pushes for this thread stay quiet while it is on screen.
  useFocusEffect(useCallback(() => showingGroupChat(groupId), [groupId]))

  // Once the screen has slid in: a chat opened from its notification, which
  // is pushed over whatever tab was showing, puts the Groups tab under itself
  // so back lands on the board, and only then brings up the keyboard. The
  // keyboard rising during the push, and the board drawn under it, were the
  // dropped frames of opening a chat from a notification.
  const navigation = useNavigation()
  useEffect(() => {
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      showTabUnder(navigation as unknown as Parameters<typeof showTabUnder>[0], 'groups')
      if (reply) field.current?.focus()
    }
    const unsubscribe = navigation.addListener('transitionEnd' as never, settle)
    // A screen that is not pushed (the first one of a deep link) has no
    // transition to end. Well past any push, so a slow phone's slide is not
    // cut into by the keyboard.
    const fallback = setTimeout(settle, 1500)
    return () => {
      unsubscribe()
      clearTimeout(fallback)
    }
  }, [navigation, reply])

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
  const closePicker = useCallback(() => setPicked(null), [])
  const vote = useVote()

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
          onPick={setPicked}
          onRetry={retry}
          onReply={startReply}
          onHeart={heart}
          onVote={vote}
          groupId={groupId}
        />
      ),
    [rows, retry, startReply, heart, vote, groupId],
  )
  // The thread rises with the composer as a scroll offset rather than a smaller
  // frame. The shell's padding relaid the screen out every frame, and the
  // composer followed the keys a beat behind them.
  const bottomInset = useSafeAreaInsets().bottom
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView
        {...props}
        inverted
        offset={footerKeyboardOffset(bottomInset)}
        onContentInsetChange={onInset}
      />
    ),
    [bottomInset, onInset],
  )
  return (
    <Screen
      scroll={false}
      keyboardAvoid="footer"
      flush
      headerGap={false}
      headerTopGap={false}
      header={
        <AppBar
          className="pt-0"
          onBack={back}
          backLabel={t('common:action.back')}
          action={
            notify === undefined || notifyUpdates === undefined ? undefined : (
              <IconButton
                size="sm"
                variant="ghost"
                accessibilityLabel={t('notifications')}
                onPress={() => setMuting(true)}
              >
                <Icon set="system" name={notify || notifyUpdates ? 'bell' : 'bell-off'} size={22} />
              </IconButton>
            )
          }
          titleContent={
            <View className="items-center">
              <Text variant="label" numberOfLines={1}>
                {name || t('chat')}
              </Text>
              {online !== null ? (
                <Text variant="micro" accessibilityLiveRegion="polite">
                  {t('online', { count: online })}
                </Text>
              ) : null}
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
      <ReactionBar
        picked={picked}
        onClose={closePicker}
        onReact={(message, emoji) => {
          react(message, message.my_reaction === emoji ? null : emoji)
          setPicked(null)
        }}
        onMore={(message) => {
          setPicked(null)
          // Android has no onDismiss, and no trouble with one modal after another.
          if (Platform.OS === 'ios') menuNext.current = message
          else setMenu(message)
        }}
        onClosed={() => {
          if (menuNext.current) setMenu(menuNext.current)
          menuNext.current = null
        }}
      />
      <MessageMenu
        message={menu}
        onClose={() => setMenu(null)}
        onReply={() => {
          if (menu) startReply(menu)
          setMenu(null)
        }}
        onDelete={() => {
          if (menu) task.press({ action: 'deleteMessage', groupId, messageId: menu.id })
          setMenu(null)
        }}
        onReport={(reason) => {
          if (menu) task.press({ action: 'reportMessage', groupId, messageId: menu.id, reason })
          setMenu(null)
        }}
        onBlock={() => {
          if (menu) block.mutate(menu.author.id)
          setMenu(null)
        }}
      />
      <NotifySheet
        visible={muting}
        notify={notify ?? true}
        notifyUpdates={notifyUpdates ?? true}
        onClose={() => setMuting(false)}
        onChange={(next) => {
          task.press({ action: 'preferences', groupId, ...next })
          setMuting(false)
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
  replying,
  onCancelReply,
}: {
  ref: React.Ref<React.ComponentRef<typeof TextInput>>
  groupName: string
  onSend: (body: string) => void
  onAttach: () => void
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
        {/* A plain +, as WhatsApp draws it: no circle, so the field gets the
            width. Narrow to look at, a full 44pt to a thumb. */}
        <Tappable
          className="h-[44px] w-[28px] items-center justify-center"
          // Level with the send button's middle, which is taller.
          style={{ marginBottom: (SEND - 44) / 2 }}
          hitSlop={{ top: 6, bottom: 6, left: 10, right: 4 }}
          onPress={onAttach}
          accessibilityRole="button"
          accessibilityLabel={t('shareFood')}
        >
          <Icon set="ui" name="plus" size={20} tintColor={colors.muted} />
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

/** The thread's side padding (`px-gutter`), and how much of a row a bubble may take (`max-w-[78%]`). */
const GUTTER = 20
const BUBBLE_MAX = 0.78

/** The small face beside a bubble, and where the bubble starts after it. */
const AVATAR = 30
const BUBBLE_INDENT = AVATAR + 8

/** Where something is drawn on screen. */
type Box = { x: number; y: number; width: number; height: number }
/**
 * A long-pressed message: where its bubble is on screen, where its row (its
 * reactions and time) ends, and whether it ends its run, which shapes the
 * bubble's corner.
 */
type Picked = { message: GroupMessage; bubble: Box; rowBottom: number; last: boolean }

/** Swiped and let go, a row glides back rather than springing past its place. */
const SETTLE = { duration: 180, easing: Easing.out(Easing.cubic) }

const MessageRow = memo(function MessageRow({
  message,
  first,
  last,
  onPick,
  onRetry,
  onReply,
  onHeart,
  onVote,
  groupId,
}: {
  message: ChatRow
  groupId: string
  first: boolean
  last: boolean
  onPick: (picked: Picked) => void
  onRetry: (requestId: string) => void
  onReply: (message: GroupMessage) => void
  onHeart: (message: GroupMessage) => void
  onVote: (entryId: string, mine: -1 | 0 | 1, value: -1 | 1) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const colors = useThemeColors()
  const openProfile = useOpenProfile()
  const openWorkout = useOpenGroupWorkout(groupId)
  const shared = message.workout
  const food = message.food
  const time = format(parseISO(message.created_at), datePattern('time'))
  const outgoing = message.outgoing
  const state = outgoing?.state
  const reactions = message.reactions ?? []
  const gap = first ? 'mt-3' : 'mt-1'
  const content = <MessageContent message={message} last={last} faded={state} />
  // The whole row slides, face and name with the bubble, as WhatsApp's does,
  // and the reply arrow comes in on its left. Moving only the bubble slid it
  // over the face, with the arrow drawn on top of both. Your own bubbles sit
  // against the right edge, where a short one left no room to drag right, so
  // they slide left instead and the arrow comes in on their right.
  const shift = useSharedValue(0)
  const sliding = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }))
  // The bar lines up with the bubble's side and sits above its top, or below
  // the whole row (its reactions and time too) when there is no room above.
  const bubbleBox = useRef<ViewInstance>(null)
  const rowBox = useRef<ViewInstance>(null)
  // The layer is a window of its own, which takes the keyboard down with it;
  // the thread then slid down under a copy left where the message had been.
  // So the keyboard goes first, as WhatsApp's does, and the message is
  // measured once the thread has settled.
  const pick = useCallback(() => {
    const measure = () =>
      bubbleBox.current?.measureInWindow((x, y, width, height) =>
        rowBox.current?.measureInWindow((_rx, rowY, _rw, rowHeight) =>
          onPick({ message, bubble: { x, y, width, height }, rowBottom: rowY + rowHeight, last }),
        ),
      )
    if (!Keyboard.isVisible()) {
      measure()
      return
    }
    let done = false
    const settle = () => {
      if (done) return
      done = true
      hidden.remove()
      clearTimeout(fallback)
      // A frame for the list's own scroll to land with the keyboard.
      requestAnimationFrame(measure)
    }
    const hidden = Keyboard.addListener('keyboardDidHide', settle)
    const fallback = setTimeout(settle, 500)
    Keyboard.dismiss()
  }, [message, onPick, last])
  const pop = usePop(message.my_reaction ?? null, reactions.length > 0)
  // A message still on its way has no actions: it has no id to act on yet.
  const actionable = !outgoing
  const bubble = actionable ? (
    <MessageGestures
      message={message}
      shift={shift}
      onMenu={pick}
      onReply={onReply}
      onHeart={onHeart}
      onOpen={shared ? () => openWorkout(shared, message.author.id) : undefined}
      onVote={
        food?.entry_id && !message.mine
          ? (value) => onVote(food.entry_id as string, food.mine ?? 0, value)
          : undefined
      }
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
  // The reactions sit on the bubble's lower corner toward the middle of the
  // screen, half over it, as messengers tuck them; a strip of page colour
  // round the chip cuts it out of the bubble. Drawn over the bubble rather than
  // in a row of their own, which left them floating loose under a tall card.
  const pill =
    reactions.length > 0 ? (
      <Animated.View
        className="absolute"
        style={[{ bottom: -PILL_TUCK }, message.mine ? { left: 6 } : { right: 6 }, pop]}
      >
        <ReactionPill reactions={reactions} mine={message.my_reaction ?? null} onPress={pick} />
      </Animated.View>
    ) : null
  // The room the tucked chip takes under the bubble, kept clear of the time.
  const tucked = pill ? { marginTop: PILL_TUCK + 2 } : undefined
  if (message.mine) {
    return (
      <Animated.View className={cn('items-end', gap)} style={sliding}>
        <View ref={rowBox} collapsable={false} className="items-end">
          <View ref={bubbleBox} collapsable={false} className="max-w-[78%]">
            <ReplyArrow shift={shift} side="right" />
            {bubble}
            {pill}
          </View>
          {state === 'failed' ? (
            <View className="mr-1 mt-1 flex-row items-center gap-1" style={tucked}>
              <Icon set="ui" name="warning" size={12} tintColor={colors.hibiscusInk} />
              <Text variant="micro" className="text-hibiscus-ink">
                {t('common:delivery.failed')}
              </Text>
            </View>
          ) : state === 'sending' ? (
            <Text variant="micro" className="mr-1 mt-1" style={tucked}>
              {t('common:delivery.sending')}
            </Text>
          ) : last ? (
            <Text variant="micro" className="mr-1 mt-1" style={tucked}>
              {time}
            </Text>
          ) : tucked ? (
            <View style={tucked} />
          ) : null}
        </View>
      </Animated.View>
    )
  }
  // The face sits level with the bottom of its bubble, as messengers draw it,
  // so the name above and the time below are set off the row rather than
  // inside it; inside, the time pushed the face below the bubble it belongs to.
  // The face and the name open the author's feed.
  return (
    <Animated.View className={gap} style={sliding}>
      <View ref={rowBox} collapsable={false}>
        {first ? (
          <Tappable
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
          <ReplyArrow shift={shift} side="left" />
          <View style={{ width: AVATAR }}>
            {last ? <PersonAvatarLink person={message.author} size="xs" /> : null}
          </View>
          <View ref={bubbleBox} collapsable={false} className="max-w-[78%]">
            {bubble}
            {pill}
          </View>
        </View>
        {last ? (
          <Text
            variant="micro"
            className="mt-1"
            style={[{ marginLeft: BUBBLE_INDENT + 6 }, tucked]}
          >
            {time}
          </Text>
        ) : tucked ? (
          <View style={tucked} />
        ) : null}
      </View>
    </Animated.View>
  )
})

/**
 * The reaction pill's pop when the viewer's own reaction lands, as a double
 * tap or the bar gives it: it grows in from small when it is new, or swells
 * and settles when it was already there. A big heart drawn over the bubble
 * used to do this job, and it was clipped by the rows around it, covered the
 * text it was reacting to and sprang about; Instagram's own chat pops the
 * reaction under the bubble instead.
 */
function usePop(mine: string | null, shown: boolean) {
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const before = useRef({ mine, shown })
  // Before paint, so a pill that has just appeared is never drawn full size
  // for a frame before it shrinks to grow in.
  useLayoutEffect(() => {
    const was = before.current
    before.current = { mine, shown }
    if (reduceMotion || !mine || mine === was.mine) return
    scale.value = withSequence(
      withTiming(was.shown ? 1.25 : 0.4, { duration: 0 }),
      withTiming(was.shown ? 1.25 : 1.15, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) }),
    )
  }, [mine, shown, reduceMotion, scale])
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
}

/**
 * The arrow a swipe to reply uncovers: left of someone else's face, or right of
 * your own bubble, whichever side the row slides away from. It rides with the
 * row and fades in as the swipe nears the point where letting go answers.
 */
function ReplyArrow({ shift, side }: { shift: SharedValue<number>; side: 'left' | 'right' }) {
  const shown = useAnimatedStyle(() => {
    const pulled = Math.abs(shift.value)
    return {
      opacity: interpolate(pulled, [16, REPLY_AT], [0, 1], 'clamp'),
      transform: [{ scale: interpolate(pulled, [16, REPLY_AT], [0.7, 1], 'clamp') }],
    }
  })
  return (
    <Animated.View
      className="absolute bottom-0 top-0 justify-center"
      style={[{ [side]: -(ARROW + 8) }, shown]}
      pointerEvents="none"
    >
      <View
        className="items-center justify-center rounded-full bg-surface-alt"
        style={{ width: ARROW, height: ARROW }}
      >
        <Icon set="ui" name="reply" size={18} />
      </View>
    </Animated.View>
  )
}
const ARROW = 32

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
        <FoodCard food={message.food} ownerId={message.author.id} mine={message.mine} />
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
  const colors = useThemeColors()
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
        {/* It opens: the same chevron a row that goes somewhere wears. */}
        <Icon set="ui" name="chevron-right" size={16} tintColor={colors.muted} />
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

/**
 * A food shared into the chat: its photo across the card, with a like and a
 * dislike on its corner as the board gives them, then its numbers.
 */
function FoodCard({ food, ownerId, mine }: { food: ChatFood; ownerId: string; mine: boolean }) {
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
        {/* The board's own thumbs, on the photo's corner so the card keeps its
            two lines. A friend's food takes a like or a dislike; yours shows
            the same pills with what friends said, and nothing to press. */}
        {food.entry_id ? (
          <View className="absolute right-2 top-2">
            <Thumbs
              entryId={food.entry_id}
              likes={food.likes ?? 0}
              dislikes={food.dislikes ?? 0}
              mine={food.mine ?? 0}
              isSelf={mine}
              pills
              inGesture
            />
          </View>
        ) : null}
      </View>
      {/* Two lines under the photo: the name with its calories on the right,
          then the macros. */}
      <View className="gap-2 p-3">
        <View className="flex-row items-baseline gap-2">
          <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
            {food.name}
          </Text>
          <Text className="font-body-black text-[16px] leading-[21px] text-heading">
            {Math.round(food.kcal).toLocaleString()}{' '}
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </Text>
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
      hitSlop={6}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-0.5 rounded-full border-2 border-canvas px-1.5 py-0.5',
        mine ? 'bg-pandan-soft' : 'bg-surface',
      )}
      style={PILL_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={reactions
        .map((reaction) => t('reactionCount', { emoji: reaction.emoji, count: reaction.count }))
        .join(', ')}
    >
      {reactions.slice(0, 3).map((reaction) => (
        // An emoji's box is taller than Nunito's at the same size: at 18px of
        // leading the top of every face was cut off flat.
        <Text key={reaction.emoji} className="text-[14px] leading-[21px]">
          {reaction.emoji}
        </Text>
      ))}
      {total > 1 ? (
        <Text variant="micro" className="ml-0.5 font-body-bold text-muted">
          {total}
        </Text>
      ) : null}
    </Tappable>
  )
}

/** How far the reaction chip hangs below its bubble. */
const PILL_TUCK = 16
const PILL_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 2,
}

/** How far a row must be dragged before letting go answers it. */
const REPLY_AT = 56

/**
 * The gestures on a sent message. A drag toward the middle (right for someone
 * else's, left for yours) pulls the row along and uncovers the reply arrow; let go past it and the composer quotes the
 * message, as WhatsApp does. A double tap hearts it, as Instagram does. A long
 * press opens the emoji bar. A screen reader reaches all three as named actions.
 */
function MessageGestures({
  message,
  shift,
  label,
  onMenu,
  onReply,
  onHeart,
  onOpen,
  onVote,
  children,
}: {
  message: GroupMessage
  /** How far the row is pulled, which the row draws. */
  shift: SharedValue<number>
  label: string
  onMenu: () => void
  onReply: (message: GroupMessage) => void
  onHeart: (message: GroupMessage) => void
  /** What a single tap opens: a workout card's workout. Most messages open nothing. */
  onOpen?: () => void
  /** A friend's food card's like and dislike, as screen-reader actions. */
  onVote?: (value: -1 | 1) => void
  children: ReactNode
}) {
  const { t } = useTranslation('groups')
  const armed = useSharedValue(false)

  const tick = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }
  const reply = () => onReply(message)
  // Toward the middle of the screen: right for someone else's, left for yours.
  const way = message.mine ? -1 : 1
  const pan = Gesture.Pan()
    // One way only, and only after a clear sideways intent, so the thread's
    // vertical scroll is never taken.
    .activeOffsetX(14 * way)
    .failOffsetX(-14 * way)
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      // Follows the finger, then resists past the point where it counts.
      const x = Math.max(0, event.translationX * way)
      shift.value = way * (x < REPLY_AT ? x : REPLY_AT + (x - REPLY_AT) * 0.25)
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
      shift.value = withTiming(0, SETTLE)
    })
  // Felt both ways, so taking a heart back is not a tap that did nothing.
  const heart = () => {
    tick()
    onHeart(message)
  }
  // A finger held past a tap's length fails the double tap at once, so the
  // long press below is not kept waiting for it.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .maxDelay(250)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success) heart()
    })
  const longPress = Gesture.LongPress()
    .minDuration(300)
    .runOnJS(true)
    .onStart(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})
      onMenu()
    })
  // A card that opens something (a workout) answers a plain tap at once, dimmed
  // under the finger like any button, so it reads as one. Waiting out a double
  // tap made it feel dead; its heart is in the emoji bar instead.
  const pressed = useSharedValue(0)
  const singleTap = Gesture.Tap()
    .enabled(Boolean(onOpen))
    .onBegin(() => {
      pressed.value = withTiming(1, { duration: 80 })
    })
    .onFinalize(() => {
      pressed.value = withTiming(0, { duration: 160 })
    })
    .onEnd((_event, success) => {
      if (success && onOpen) {
        runOnJS(tick)()
        runOnJS(onOpen)()
      }
    })
  const gesture = Gesture.Race(
    pan,
    onOpen ? Gesture.Exclusive(longPress, singleTap) : Gesture.Exclusive(doubleTap, longPress),
  )

  const dimmed = useAnimatedStyle(() => ({ opacity: 1 - pressed.value * 0.3 }))
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={dimmed}
        accessible
        accessibilityLabel={label}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityActions={[
          ...(onOpen ? [{ name: 'activate' as const }] : []),
          { name: 'longpress', label: t('messageActions') },
          { name: 'reply', label: t('reply') },
          { name: 'heart', label: t('heart') },
          ...(onVote
            ? [
                { name: 'like', label: t('like') },
                { name: 'dislike', label: t('dislike') },
              ]
            : []),
        ]}
        onAccessibilityAction={(event) => {
          const name = event.nativeEvent.actionName
          if (name === 'activate') onOpen?.()
          else if (name === 'reply') onReply(message)
          else if (name === 'heart') onHeart(message)
          else if (name === 'like') onVote?.(1)
          else if (name === 'dislike') onVote?.(-1)
          else onMenu()
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  )
}

/** One emoji's key in the bar, and the bar itself: six emoji and the ⋯ after them. */
const KEY = 40
const BAR_W = 7 * KEY + 6 * 2 + 2 * 6 + 2
const BAR_H = KEY + 2 * 6 + 2
/** The room kept between the bar, its bubble and the thread's edges. */
const BAR_GAP = 8

/** The bar fades in growing from just under its size, and fades out. */
const barIn = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 140 }),
      transform: [{ scale: withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }) }],
    },
  }
}

/**
 * What a long press opens, as WhatsApp draws it: everything dims but the
 * message, drawn again in place over the dim, and the six emoji in a row just
 * above it (under its row when there is no room above), lined up with its
 * side, with a ⋯ for the rest. A tap anywhere else closes it. Reply has its
 * swipe, so the ⋯ sheet is only for what moderation needs.
 *
 * Its own window, as a sheet is, so the dim covers the header and the composer
 * too; the list itself cannot lift one row above a layer laid over it.
 */
function ReactionBar({
  picked,
  onClose,
  onReact,
  onMore,
  onClosed,
}: {
  picked: Picked | null
  onClose: () => void
  onReact: (message: GroupMessage, emoji: MessageReaction) => void
  onMore: (message: GroupMessage) => void
  /** Once the layer has gone, which on iOS is when another modal may open. */
  onClosed: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const { colors, isDark } = useTheme()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // What it was showing, kept while it fades away.
  const shown = useRef<Picked | null>(null)
  if (picked) shown.current = picked
  const current = shown.current
  let body: ReactNode = null
  if (current) {
    const { message, bubble, rowBottom, last } = current
    const side = message.mine ? bubble.x + bubble.width - BAR_W : bubble.x
    const left = Math.max(BAR_GAP, Math.min(side, width - BAR_W - BAR_GAP))
    const above = bubble.y - BAR_H - BAR_GAP
    const top =
      above >= insets.top + BAR_GAP
        ? above
        : Math.min(rowBottom + BAR_GAP, height - insets.bottom - BAR_H - BAR_GAP)
    body = (
      <>
        <Tappable
          haptics={false}
          // Darker on a dark theme, where the sheets' 40% barely shows
          // against a near-black thread and the held message stood out little.
          className={cn('absolute inset-0', isDark ? 'bg-black/60' : 'bg-black/40')}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common:action.close')}
        />
        {/* The message itself, undimmed, exactly where it sits in the thread. */}
        {/* Laid out under the thread's own limit and pinned by its outer
            edge, so it wraps exactly as the original: pinned to the measured
            width, which is rounded, the text came out a line taller. */}
        <View
          pointerEvents="none"
          className={cn('absolute', message.mine ? 'items-end' : 'items-start')}
          style={{
            top: bubble.y,
            width: BUBBLE_MAX * (width - 2 * GUTTER),
            ...(message.mine ? { right: width - bubble.x - bubble.width } : { left: bubble.x }),
          }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View>
            <MessageContent message={message} last={last} />
            {/* Its reactions too, where the row tucks them: drawn over the
                dim without them, the bubble covered the top half of the pill. */}
            {message.reactions?.length ? (
              <View
                className="absolute"
                style={[{ bottom: -PILL_TUCK }, message.mine ? { left: 6 } : { right: 6 }]}
              >
                <ReactionPill
                  reactions={message.reactions}
                  mine={message.my_reaction ?? null}
                  onPress={() => {}}
                />
              </View>
            ) : null}
          </View>
        </View>
        <Animated.View
          key={message.id}
          entering={barIn}
          className="absolute flex-row items-center gap-0.5 rounded-full border border-line bg-surface p-1.5"
          style={[{ left, top, width: BAR_W, height: BAR_H }, BAR_SHADOW]}
        >
          {MESSAGE_REACTIONS.map((emoji) => {
            const chosen = message.my_reaction === emoji
            return (
              <Tappable
                key={emoji}
                onPress={() => onReact(message, emoji)}
                className={cn(
                  'items-center justify-center rounded-full',
                  chosen && 'bg-pandan-soft',
                )}
                style={{ width: KEY, height: KEY }}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={t('reactWith', { emoji })}
              >
                <Text className="text-[26px] leading-[32px]">{emoji}</Text>
              </Tappable>
            )
          })}
          <Tappable
            onPress={() => onMore(message)}
            className="items-center justify-center rounded-full bg-surface-alt"
            style={{ width: KEY, height: KEY }}
            accessibilityRole="button"
            accessibilityLabel={t('messageActions')}
          >
            <Icon set="ui" name="more-horizontal" size={20} tintColor={colors.muted} />
          </Tappable>
        </Animated.View>
      </>
    )
  }
  return (
    <Modal
      visible={picked !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={onClosed}
    >
      {/* A modal is its own window, which gesture-handler's root does not
          reach on Android; the food card's thumbs are gesture taps. */}
      <GestureHandlerRootView style={{ flex: 1 }}>{body}</GestureHandlerRootView>
    </Modal>
  )
}

const BAR_SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.14,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
}

type Mute = 'none' | 'chat' | 'updates' | 'all'

/** The bell's choices: hear everything, or mute chat, updates or both. */
function NotifySheet({
  visible,
  notify,
  notifyUpdates,
  onClose,
  onChange,
}: {
  visible: boolean
  notify: boolean
  notifyUpdates: boolean
  onClose: () => void
  onChange: (next: { notify: boolean; notifyUpdates: boolean }) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const value: Mute = notify ? (notifyUpdates ? 'none' : 'updates') : notifyUpdates ? 'chat' : 'all'
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('notifications')}
    >
      <RadioGroup<Mute>
        value={value}
        options={[
          { value: 'none', label: t('muteNone') },
          { value: 'chat', label: t('muteChatOnly') },
          { value: 'updates', label: t('muteUpdatesOnly') },
          { value: 'all', label: t('muteAll') },
        ]}
        onChange={(next) =>
          onChange({
            notify: next === 'none' || next === 'updates',
            notifyUpdates: next === 'none' || next === 'chat',
          })
        }
      />
    </Sheet>
  )
}

/**
 * What the emoji bar's ⋯ opens: reply, and what moderation needs (delete your
 * own; report or block someone else's, since anything one person writes for
 * another needs both). Report asks why in the same sheet, as the feed does.
 */
function MessageMenu({
  message,
  onClose,
  onReply,
  onDelete,
  onReport,
  onBlock,
}: {
  message: GroupMessage | null
  onClose: () => void
  onReply: () => void
  onDelete: () => void
  onReport: (reason: ReportReason) => void
  onBlock: () => void
}) {
  const { t } = useTranslation(['groups', 'common', 'social', 'recipes'])
  // What the sheet was showing, kept while it slides away.
  const shown = useRef<GroupMessage | null>(null)
  if (message) shown.current = message
  const current = shown.current
  const [reporting, setReporting] = useState(false)
  // Back on the menu for the next message, however this one closed.
  useEffect(() => {
    if (!message) setReporting(false)
  }, [message])
  return (
    <Sheet
      visible={message !== null}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={reporting ? t('social:reportTitle') : undefined}
      description={reporting ? undefined : current?.body}
      scrollResetKey={reporting ? 'report' : 'menu'}
    >
      {reporting ? (
        <View className="gap-md">
          {REPORT_REASONS.map((reason) => (
            <Button key={reason} fullWidth variant="secondary" onPress={() => onReport(reason)}>
              {t(`recipes:report.${reason}`)}
            </Button>
          ))}
        </View>
      ) : (
        <View className="gap-md">
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
              <Button fullWidth variant="secondary" onPress={() => setReporting(true)}>
                {t('report')}
              </Button>
              <Button fullWidth variant="danger" onPress={onBlock}>
                {t('social:block')}
              </Button>
            </>
          )}
        </View>
      )}
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
  // Back on food for the next opening, however this one closed: picking
  // closes it without going through onClose.
  useEffect(() => {
    if (!visible) setTab('food')
  }, [visible])
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
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
