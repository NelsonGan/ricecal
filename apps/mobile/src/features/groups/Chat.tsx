import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, TextInput, View } from 'react-native'
import { useUserId } from '@/data'
import { type GroupMessage, useGroupAction, useGroupMessages, useMyGroups } from '@/data/groups'
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
  const messages = useGroupMessages(groupId, day, true)
  const task = useGroupTask()
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<GroupMessage | null>(null)
  const block = useBlockAuthor()

  // Opening the chat reads it, which clears the bar's count. Leaving reads it
  // again only if something arrived while it was open.
  const action = useGroupAction()
  const markRead = action.mutate
  const seen = useRef(0)
  seen.current = messages.data?.length ?? 0
  useEffect(() => {
    markRead({ action: 'read', groupId })
    const opened = seen.current
    return () => {
      if (seen.current > opened) markRead({ action: 'read', groupId })
    }
  }, [groupId, markRead])

  // Sent messages are drawn at once from the outbox and swapped for the
  // server's rows as they arrive; the field never waits.
  const serverIds = useMemo(() => new Set((messages.data ?? []).map((m) => m.id)), [messages.data])
  const outbox = useOutbox(async (item) => {
    const id = await action.mutateAsync({
      action: 'message',
      groupId,
      day,
      body: item.body,
      requestId: item.requestId,
    })
    track('Group Message Sent', {})
    return typeof id === 'string' ? id : null
  }, serverIds)
  const send = () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    outbox.send(body)
  }

  // Newest first, for the inverted list: the outbox is newer than anything sent.
  const rows: ChatRow[] = [
    ...[...outbox.pending].reverse().map((item) => ({
      id: item.requestId,
      author: { id: viewer, name: '', handle: '', avatar_path: null },
      body: item.body,
      created_at: item.createdAt,
      mine: true,
      outgoing: item,
    })),
    ...[...(messages.data ?? [])].reverse(),
  ]
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
      footer={<Composer value={draft} onChange={setDraft} groupName={name} onSend={send} />}
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
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-gutter py-3"
          // Inverted, so the "footer" is drawn at the top of the thread: the
          // day, as a chip, where a messenger puts it.
          ListFooterComponent={<DayChip label={dayLabel} />}
          ListEmptyComponent={
            <View className="items-center py-xl" style={{ transform: [{ scaleY: -1 }] }}>
              <Text variant="meta">{t('chatEmpty')}</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            // Inverted: the row above is the next one in the array.
            const above = rows[index + 1]
            const below = rows[index - 1]
            return (
              <MessageRow
                message={item}
                first={above?.author.id !== item.author.id}
                last={below?.author.id !== item.author.id}
                onLongPress={() => (item.outgoing ? undefined : setSelected(item))}
                onRetry={() => item.outgoing && outbox.retry(item.outgoing.requestId)}
              />
            )
          }}
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

/** A pill field that grows to a few lines, and a round send button level with its last line. */
function Composer({
  value,
  onChange,
  groupName,
  onSend,
}: {
  value: string
  onChange: (value: string) => void
  groupName: string
  onSend: () => void
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const ready = value.trim().length > 0
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
        onPress={onSend}
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

function MessageRow({
  message,
  first,
  last,
  onLongPress,
  onRetry,
}: {
  message: ChatRow
  first: boolean
  last: boolean
  onLongPress: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const colors = useThemeColors()
  const time = format(parseISO(message.created_at), datePattern('time'))
  const state = message.outgoing?.state
  // Report, block and delete live behind a long press, which a screen reader
  // reaches as a named action.
  const a11y = {
    accessibilityLabel: [message.mine ? t('you') : message.author.name, message.body, time].join(
      ', ',
    ),
    accessibilityActions: [{ name: 'longpress', label: t('messageActions') }],
    onAccessibilityAction: () => onLongPress(),
  }
  const gap = first ? 'mt-3' : 'mt-1'
  if (message.mine) {
    return (
      <View className={cn('items-end', gap)}>
        <Tappable
          className="max-w-[78%]"
          onPress={state === 'failed' ? onRetry : undefined}
          onLongPress={onLongPress}
          delayLongPress={300}
          haptics={false}
          {...a11y}
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
  return (
    <View className={cn('flex-row items-end gap-2', gap)}>
      <View className="w-9">{last ? <PersonAvatar person={message.author} /> : null}</View>
      <View className="max-w-[78%] items-start">
        {first ? (
          <Text variant="micro" className="mb-1 ml-3 text-ink">
            {message.author.name}
          </Text>
        ) : null}
        <Tappable onLongPress={onLongPress} delayLongPress={300} haptics={false} {...a11y}>
          <View className={cn('rounded-[18px] bg-surface px-3.5 py-2', last && 'rounded-bl-[6px]')}>
            <Text variant="body" className="text-[16px] leading-[22px] text-ink">
              {message.body}
            </Text>
          </View>
        </Tappable>
        {last ? (
          <Text variant="micro" className="ml-3 mt-1">
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
