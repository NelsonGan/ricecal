import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Platform, TextInput, View } from 'react-native'
import { useUserId } from '@/data'
import {
  type GroupMessage,
  ownMessage,
  useGroupAction,
  useGroupChatLive,
  useGroupMessages,
  useMyGroups,
} from '@/data/groups'
import { useBlockAuthor } from '@/data/moderation'
import { type Outgoing, useOutbox } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { AppBar, cn, Dialog, Icon, Screen, Spinner, Tappable, Text } from '@/ui'
import { PersonAvatar, useGroupTask } from './parts'

/**
 * A day's chat, as a screen of its own laid out the way every messenger is:
 * the thread fills the page from the bottom and the composer sits on the
 * keyboard. A sheet put the composer under the keyboard, since a sheet's body
 * does not move for it; `Screen` lifts its footer with the keyboard and pads
 * the thread out of the way.
 *
 * One thread per day page keeps it about that day's food; older days stay
 * readable by paging back on the board.
 */
export function ChatScreen({ groupId, day }: { groupId: string; day: string }) {
  const { t } = useTranslation(['groups', 'common', 'social'])
  const back = useBack('/groups')
  const viewer = useUserId()
  const name = useMyGroups().data?.find((group) => group.id === groupId)?.name ?? ''
  const live = useGroupChatLive(groupId, day)
  const messages = useGroupMessages(groupId, day, live)
  const task = useGroupTask()
  const [selected, setSelected] = useState<GroupMessage | null>(null)
  const block = useBlockAuthor()

  // Opening the chat reads it, which clears the bar's count. Leaving reads it
  // again only if the thread changed while it was open, judged from the thread
  // as it first loaded rather than the empty one at mount, and then refetches
  // the board so its preview is the latest message rather than the one before.
  const action = useGroupAction()
  const markRead = action.mutate
  const latest = messages.data?.at(-1)?.id ?? null
  const seen = useRef<{ first?: string | null; now: string | null }>({ now: null })
  if (messages.data) {
    if (seen.current.first === undefined) seen.current.first = latest
    seen.current.now = latest
  }
  useEffect(() => {
    markRead({ action: 'read', groupId })
    const thread = seen.current
    return () => {
      if (thread.first !== undefined && thread.now !== thread.first) {
        markRead({ action: 'read', groupId, day })
      }
    }
  }, [groupId, day, markRead])

  // Sent messages are drawn at once from the outbox and swapped for the
  // server's rows as they arrive; the field never waits.
  const serverIds = useMemo(() => new Set((messages.data ?? []).map((m) => m.id)), [messages.data])
  const outbox = useOutbox(
    `group:${groupId}:${day}`,
    async (item) => {
      const id = await action.mutateAsync({
        action: 'message',
        groupId,
        day,
        body: item.body,
        requestId: item.requestId,
      })
      track('Group Message Sent', {})
      return typeof id === 'string' ? id : null
    },
    serverIds,
  )
  const { send, retry } = outbox

  // Newest first, for the inverted list: the outbox is newer than anything sent.
  const rows = useMemo<ChatRow[]>(
    () => [
      ...[...outbox.pending].reverse().map((item) => ({
        ...ownMessage(viewer, item.requestId, item.body, item.createdAt),
        outgoing: item,
      })),
      ...[...(messages.data ?? [])].reverse(),
    ],
    [outbox.pending, messages.data, viewer],
  )
  const renderItem = useCallback(
    ({ item, index }: { item: ChatRow; index: number }) => (
      // Inverted: the row above is the next one in the array.
      <MessageRow
        message={item}
        first={rows[index + 1]?.author.id !== item.author.id}
        last={rows[index - 1]?.author.id !== item.author.id}
        onSelect={setSelected}
        onRetry={retry}
      />
    ),
    [rows, retry],
  )
  const at = parseISO(day)
  const dayLabel = isToday(at)
    ? t('common:date.today')
    : isYesterday(at)
      ? t('common:date.yesterday')
      : format(at, datePattern('weekdayDayMonth'))

  return (
    <Screen
      scroll={false}
      flush
      header={
        <AppBar
          onBack={back}
          backLabel={t('common:action.back')}
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
      footer={<Composer groupName={name} onSend={send} />}
    >
      {messages.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : !messages.data && (messages.isError || messages.fetchStatus === 'paused') ? (
        <View className="flex-1 justify-center px-gutter">
          <QueryNotice
            error={messages.isError}
            paused={messages.fetchStatus === 'paused'}
            retry={() => messages.refetch()}
          />
        </View>
      ) : (
        <FlatList
          className="flex-1"
          inverted
          data={rows}
          keyExtractor={(message) => message.id}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-gutter py-3"
          // Inverted, so the "footer" is drawn at the top of the thread: the
          // day, as a chip, where a messenger puts it.
          ListFooterComponent={<DayChip label={dayLabel} />}
          ListEmptyComponent={
            // The list flips this itself, on both platforms.
            <View className="items-center py-xl">
              <Text variant="meta">{t('chatEmpty')}</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}
      <Dialog
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={t('messageActions')}
        description={selected?.body}
        cancelLabel={t('common:action.cancel')}
        actions={
          selected?.mine
            ? [
                {
                  key: 'delete',
                  label: t('deleteMessage'),
                  tone: 'danger',
                  onPress: () =>
                    task.press({ action: 'deleteMessage', groupId, day, messageId: selected.id }),
                },
              ]
            : selected
              ? [
                  {
                    key: 'report',
                    label: t('report'),
                    onPress: () =>
                      task.press({ action: 'reportMessage', groupId, day, messageId: selected.id }),
                  },
                  {
                    key: 'block',
                    label: t('social:block'),
                    tone: 'danger',
                    onPress: () => block.mutate(selected.author.id),
                  },
                ]
              : []
        }
      />
    </Screen>
  )
}

function DayChip({ label }: { label: string }) {
  return (
    <View className="items-center pb-3 pt-1">
      <View className="rounded-full bg-surface-alt px-3 py-1">
        <Text variant="micro">{label}</Text>
      </View>
    </View>
  )
}

/**
 * A pill field that grows to a few lines, and a round send button level with
 * its last line. It holds its own draft, so typing redraws the field and not
 * the thread above it.
 */
function Composer({ groupName, onSend }: { groupName: string; onSend: (body: string) => void }) {
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
    <View className="flex-row items-end gap-2">
      <View className="min-h-[44px] min-w-0 flex-1 justify-center rounded-[22px] border border-line bg-surface px-4">
        <TextInput
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
      <Tappable
        className={cn(
          'h-[44px] w-[44px] items-center justify-center rounded-full',
          ready ? 'bg-pandan' : 'bg-disabled',
        )}
        disabled={!ready}
        onPress={send}
        accessibilityRole="button"
        accessibilityLabel={t('send')}
        accessibilityState={{ disabled: !ready }}
      >
        <Icon
          set="ui"
          name="arrow-up"
          size={22}
          tintColor={ready ? colors.onPandan : colors.onDisabled}
        />
      </Tappable>
    </View>
  )
}

/**
 * One message. The author's picture and name show once at the start of a run
 * of their messages, and the time once at its end, as messengers do, so a
 * burst of short messages reads as one thought rather than a column of stamps.
 */
type ChatRow = GroupMessage & { outgoing?: Outgoing }

/** The small face beside a bubble, and where the bubble starts after it. */
const AVATAR = 30
const BUBBLE_INDENT = AVATAR + 8

const MessageRow = memo(function MessageRow({
  message,
  first,
  last,
  onSelect,
  onRetry,
}: {
  message: ChatRow
  first: boolean
  last: boolean
  onSelect: (message: GroupMessage) => void
  onRetry: (requestId: string) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const colors = useThemeColors()
  const time = format(parseISO(message.created_at), datePattern('time'))
  const outgoing = message.outgoing
  const state = outgoing?.state
  // Report, block and delete live behind a long press, which a screen reader
  // reaches as a named action. A message still on its way has none of them.
  const onLongPress = outgoing ? undefined : () => onSelect(message)
  const a11y = {
    accessibilityLabel: [message.mine ? t('you') : message.author.name, message.body, time].join(
      ', ',
    ),
    accessibilityActions: onLongPress ? [{ name: 'longpress', label: t('messageActions') }] : [],
    onAccessibilityAction: onLongPress,
  }
  const gap = first ? 'mt-3' : 'mt-1'
  if (message.mine) {
    return (
      <View className={cn('items-end', gap)}>
        <Tappable
          className="max-w-[78%]"
          onPress={state === 'failed' && outgoing ? () => onRetry(outgoing.requestId) : undefined}
          onLongPress={onLongPress}
          delayLongPress={300}
          haptics={false}
          {...a11y}
          accessibilityRole={state === 'failed' ? 'button' : undefined}
          accessibilityHint={state === 'failed' ? t('common:delivery.failed') : undefined}
        >
          <View
            className={cn(
              'rounded-[18px] bg-pandan px-3.5 py-2',
              last && 'rounded-br-[6px]',
              state === 'sending' && 'opacity-70',
              state === 'failed' && 'opacity-50',
            )}
          >
            <Text variant="body" className="text-[16px] leading-[22px] text-on-pandan">
              {message.body}
            </Text>
          </View>
        </Tappable>
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
  return (
    <View className={gap}>
      {first ? (
        <Text variant="micro" className="mb-1 text-ink" style={{ marginLeft: BUBBLE_INDENT + 6 }}>
          {message.author.name}
        </Text>
      ) : null}
      <View className="flex-row items-end gap-2">
        <View style={{ width: AVATAR }}>
          {last ? <PersonAvatar person={message.author} size="xs" /> : null}
        </View>
        <Tappable
          className="max-w-[78%]"
          onLongPress={onLongPress}
          delayLongPress={300}
          haptics={false}
          {...a11y}
        >
          <View className={cn('rounded-[18px] bg-surface px-3.5 py-2', last && 'rounded-bl-[6px]')}>
            <Text variant="body" className="text-[16px] leading-[22px] text-ink">
              {message.body}
            </Text>
          </View>
        </Tappable>
      </View>
      {last ? (
        <Text variant="micro" className="mt-1" style={{ marginLeft: BUBBLE_INDENT + 6 }}>
          {time}
        </Text>
      ) : null}
    </View>
  )
})
