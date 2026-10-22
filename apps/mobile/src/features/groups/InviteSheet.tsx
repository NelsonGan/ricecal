import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { track } from '@/lib/analytics'
import { Button, Sheet, TextField, useToast } from '@/ui'
import { useGroupTask } from './parts'

/** A username or an email. An email only finds someone who already has an account. */
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
  const task = useGroupTask()
  const toast = useToast()
  const invite = async () => {
    const value = target.trim()
    if (!value) return
    try {
      await task.run({ action: 'invite', groupId, target: value })
      track('Group Invite Sent', {
        by: value.includes('@') && !value.startsWith('@') ? 'email' : 'handle',
      })
      toast.show({ title: t('inviteSent'), tone: 'success' })
      setTarget('')
    } catch {
      // The task showed why, and the field keeps what was typed.
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('inviteFriends')}
      fullHeight
      scrollable={false}
    >
      <View className="gap-md">
        <TextField
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
        <Button
          fullWidth
          loading={task.isPending}
          disabled={!target.trim()}
          onPress={() => void invite()}
        >
          {t('invite')}
        </Button>
      </View>
    </Sheet>
  )
}
