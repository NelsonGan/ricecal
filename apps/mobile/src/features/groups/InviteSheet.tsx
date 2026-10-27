import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInput, View } from 'react-native'
import { type GroupPerson, useGroupInviteSuggestions } from '@/data/groups'
import { track } from '@/lib/analytics'
import { Button, Sheet, Text, TextField, useToast } from '@/ui'
import { PersonAvatar, useGroupTask } from './parts'

/**
 * A username or an email, with the keyboard already up, and a few people the
 * viewer follows or is followed by to invite with one tap. An email only finds
 * someone who already has an account.
 *
 * Only as tall as what is in it, riding on the keyboard, rather than a
 * full-screen sheet: it is one field and a short list, and a page of empty
 * sheet above the keys said there was more to do here than there is.
 */
export function InviteSheet({
  groupId,
  visible,
  onClose,
}: {
  groupId: string
  visible: boolean
  onClose: () => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const [target, setTarget] = useState('')
  // Invited from the list while the sheet is open, drawn as done straight away;
  // the list itself drops them on its next read.
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set())
  const field = useRef<React.ComponentRef<typeof TextInput>>(null)
  const task = useGroupTask()
  const toast = useToast()
  const suggestions = useGroupInviteSuggestions(groupId, visible)
  // Its own flag rather than the mutation's, which a suggested invite also sets.
  const [typing, setTyping] = useState(false)
  const invite = async () => {
    const value = target.trim()
    if (!value || typing) return
    setTyping(true)
    try {
      await task.run({ action: 'invite', groupId, target: value })
      track('Group Invite Sent', {
        by: value.includes('@') && !value.startsWith('@') ? 'email' : 'handle',
      })
      toast.show({ title: t('inviteSent'), tone: 'success' })
      setTarget('')
    } catch {
      // The task showed why, and the field keeps what was typed.
    } finally {
      setTyping(false)
    }
  }
  const inviteSuggested = async (person: GroupPerson) => {
    try {
      await task.run({ action: 'invite', groupId, target: `@${person.handle}` })
      track('Group Invite Sent', { by: 'handle' })
      setSent((current) => new Set(current).add(person.id))
    } catch {
      // The task showed why.
    }
  }
  // The list as read for this opening, held while it is open. An invite
  // refetches it, and the person invited would vanish from under the finger
  // rather than read as done; held, their row turns to Invited instead. It is
  // read afresh on opening, since a copy cached from the last opening may
  // still list someone invited then.
  const [people, setPeople] = useState<GroupPerson[] | null>(null)
  const opened = useRef(0)
  const { refetch, data: loaded, dataUpdatedAt } = suggestions
  useEffect(() => {
    if (!visible) return
    opened.current = Date.now()
    // Joins a fetch that enabling the query already started, rather than
    // cancelling it and asking again.
    void refetch({ cancelRefetch: false })
  }, [visible, refetch])
  useEffect(() => {
    if (visible && loaded && people === null && dataUpdatedAt >= opened.current) {
      setPeople(loaded)
    }
  }, [visible, loaded, dataUpdatedAt, people])
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setSent(new Set())
        setPeople(null)
        onClose()
      }}
      closeLabel={t('common:action.close')}
      title={t('inviteFriends')}
      // `autoFocus` inside a window that has not been presented yet is
      // dropped, so the field is focused once the sheet is up (see `Sheet`).
      onShow={() => field.current?.focus()}
    >
      <View className="gap-md">
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <TextField
              ref={field}
              value={target}
              onChangeText={setTarget}
              placeholder={t('inviteField')}
              accessibilityLabel={t('inviteField')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => void invite()}
            />
          </View>
          <Button loading={typing} disabled={!target.trim()} onPress={() => void invite()}>
            {t('invite')}
          </Button>
        </View>
        {people?.length ? (
          <View className="gap-1">
            <Text variant="overline">{t('suggested')}</Text>
            {people.map((person) => {
              const done = sent.has(person.id)
              return (
                <View key={person.id} className="min-h-[52px] flex-row items-center gap-md">
                  <PersonAvatar person={person} />
                  <View className="min-w-0 flex-1">
                    <Text variant="label" numberOfLines={1}>
                      {person.name}
                    </Text>
                    <Text variant="caption" numberOfLines={1}>
                      @{person.handle}
                    </Text>
                  </View>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={done}
                    onPress={() => void inviteSuggested(person)}
                    accessibilityLabel={`${t('invite')} ${person.name}`}
                  >
                    {done ? t('invited') : t('invite')}
                  </Button>
                </View>
              )
            })}
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
