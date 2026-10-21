import { format, parseISO } from 'date-fns'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, View } from 'react-native'
import { type GroupMessage, useGroupAction, useGroupMessages } from '@/data/groups'
import { useBlockAuthor } from '@/data/moderation'
import { socialRequestId } from '@/features/social/request-id'
import { track } from '@/lib/analytics'
import { datePattern } from '@/lib/dates'
import { useThemeColors } from '@/theme/useTheme'
import { cn, Dialog, Icon, IconButton, Sheet, Spinner, Tappable, Text, TextField } from '@/ui'
import { PersonAvatar, useGroupTask } from './parts'

/**
 * The chat for the day on the board. One thread per day keeps it about that
 * day's food; older days stay readable by paging back.
 */
export function ChatSheet({
  groupId,
  groupName,
  day,
  visible,
  onClose,
}: {
  groupId: string
  groupName: string
  day: string
  visible: boolean
  onClose: () => void
}) {
  const { t } = useTranslation(['groups', 'common', 'social'])
  const messages = useGroupMessages(groupId, day, visible)
  const task = useGroupTask()
  const [draft, setDraft] = useState('')
  // One id per draft, so a retried send is the same message on the server.
  const [requestId, setRequestId] = useState(socialRequestId)
  const [selected, setSelected] = useState<GroupMessage | null>(null)
  const block = useBlockAuthor()
  const colors = useThemeColors()

  // Opening the chat reads it, which clears the bar's count, and so does
  // closing it, for whatever arrived while it was open.
  const markRead = useGroupAction().mutate
  useEffect(() => {
    if (!visible) return
    markRead({ action: 'read', groupId })
    return () => markRead({ action: 'read', groupId })
  }, [visible, groupId, markRead])

  const send = async () => {
    const body = draft.trim()
    if (!body) return
    setDraft('')
    try {
      await task.run({ action: 'message', groupId, day, body, requestId })
      track('Group Message Sent', {})
      setRequestId(socialRequestId())
    } catch {
      setDraft(body)
    }
  }

  const rows = [...(messages.data ?? [])].reverse()

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('chat')}
      description={format(parseISO(day), datePattern('weekdayDayMonth'))}
      titleAction={
        <IconButton
          size="sm"
          variant="subtle"
          accessibilityLabel={t('common:action.close')}
          onPress={onClose}
        >
          <Icon set="ui" name="close" size={18} tintColor={colors.muted} />
        </IconButton>
      }
      fullHeight
      scrollable={false}
      fillBody
      footer={
        <View className="flex-row items-end gap-2">
          <View className="min-w-0 flex-1">
            <TextField
              value={draft}
              onChangeText={setDraft}
              placeholder={t('message', { name: groupName })}
              maxLength={500}
              multiline
              accessibilityLabel={t('message', { name: groupName })}
            />
          </View>
          <IconButton
            variant="primary"
            accessibilityLabel={t('send')}
            disabled={!draft.trim()}
            onPress={() => void send()}
          >
            <Icon set="system" name="send" size={22} />
          </IconButton>
        </View>
      }
    >
      {messages.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      ) : rows.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text variant="meta">{t('chatEmpty')}</Text>
        </View>
      ) : (
        <FlatList
          className="flex-1"
          inverted
          data={rows}
          keyExtractor={(message) => message.id}
          contentContainerClassName="gap-3 py-2"
          renderItem={({ item, index }) => (
            <MessageRow
              message={item}
              // Inverted, so the row above is the next one in the array.
              showAuthor={rows[index + 1]?.author.id !== item.author.id}
              onLongPress={() => setSelected(item)}
            />
          )}
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
    </Sheet>
  )
}

function MessageRow({
  message,
  showAuthor,
  onLongPress,
}: {
  message: GroupMessage
  showAuthor: boolean
  onLongPress: () => void
}) {
  const time = format(parseISO(message.created_at), datePattern('time'))
  if (message.mine) {
    return (
      <Tappable
        className="max-w-[80%] self-end"
        onLongPress={onLongPress}
        delayLongPress={300}
        haptics={false}
        accessibilityHint={time}
      >
        <View
          className={cn(
            'rounded-tile rounded-br-md bg-pandan px-3.5 py-2',
            message.pending && 'opacity-60',
          )}
        >
          <Text variant="body" className="text-on-pandan">
            {message.body}
          </Text>
        </View>
        <Text variant="micro" className="mt-0.5 self-end">
          {time}
        </Text>
      </Tappable>
    )
  }
  return (
    <View className="flex-row items-end gap-2">
      <View className="w-10">{showAuthor ? <PersonAvatar person={message.author} /> : null}</View>
      <Tappable
        className="max-w-[78%]"
        onLongPress={onLongPress}
        delayLongPress={300}
        haptics={false}
      >
        {showAuthor ? (
          <Text variant="micro" className="mb-0.5 text-ink">
            {message.author.name}
          </Text>
        ) : null}
        <View className="rounded-tile rounded-bl-md bg-surface-alt px-3.5 py-2">
          <Text variant="body">{message.body}</Text>
        </View>
        <Text variant="micro" className="mt-0.5">
          {time}
        </Text>
      </Tappable>
    </View>
  )
}
