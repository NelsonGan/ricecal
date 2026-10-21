import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { GROUP_CAPACITY, type GroupPerson, useGroupDetails } from '@/data/groups'
import { ReorderSheet } from '@/features/workouts/ReorderSheet'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Icon,
  IconButton,
  RadioGroup,
  Screen,
  SegmentedControl,
  Sheet,
  SkeletonRow,
  Switch,
  Text,
  TextField,
} from '@/ui'
import { InviteSheet } from './InviteSheet'
import { GroupIcon, PersonAvatar, useGroupTask } from './parts'
import { setOpenGroup } from './store'

export function GroupSettingsScreen({ groupId }: { groupId: string }) {
  const { t } = useTranslation(['groups', 'common'])
  const viewer = useUserId()
  const colors = useThemeColors()
  const router = useRouter()
  const back = useBack('/groups')
  const details = useGroupDetails(groupId)
  const task = useGroupTask()
  const [name, setName] = useState('')
  const [reordering, setReordering] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [removing, setRemoving] = useState<GroupPerson | null>(null)
  const group = details.data
  const isLeader = group?.leader_id === viewer
  const others = group?.members.filter((member) => member.id !== viewer) ?? []

  // The field follows the saved name, including a rename from another phone.
  const savedName = group?.name
  useEffect(() => {
    if (savedName) setName(savedName)
  }, [savedName])

  const leave = async (newLeader?: string) => {
    try {
      await task.run({ action: 'leave', groupId, newLeader })
      setLeaving(false)
      setOpenGroup(viewer, null)
      router.replace('/groups')
    } catch {
      // The task showed why.
    }
  }

  return (
    <Screen
      header={<AppBar title={t('settings')} onBack={back} backLabel={t('common:action.back')} />}
    >
      {!group ? (
        details.isError ? (
          <EmptyState
            title={t('loadFailed')}
            action={
              <Button variant="secondary" onPress={() => void details.refetch()}>
                {t('retry')}
              </Button>
            }
          />
        ) : (
          <View className="gap-3">
            <SkeletonRow />
            <SkeletonRow />
          </View>
        )
      ) : (
        <View className="gap-lg pb-xl">
          <Card>
            <View className="flex-row items-center gap-md">
              <View className="h-14 w-14 items-center justify-center rounded-tile bg-pandan-soft">
                <GroupIcon name={group.icon_name} size={40} />
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="subtitle" numberOfLines={1}>
                  {group.name}
                </Text>
                <Text variant="meta">{t('members', { count: group.members.length })}</Text>
              </View>
            </View>
            {isLeader ? (
              <>
                <View className="flex-row items-center gap-2">
                  <View className="min-w-0 flex-1">
                    <TextField
                      value={name}
                      onChangeText={setName}
                      maxLength={40}
                      accessibilityLabel={t('name')}
                    />
                  </View>
                  {name.trim() && name.trim() !== group.name ? (
                    <Button
                      size="sm"
                      onPress={() => task.press({ action: 'update', groupId, name: name.trim() })}
                    >
                      {t('save')}
                    </Button>
                  ) : null}
                </View>
                <SegmentedControl
                  options={[
                    { value: 'private', label: t('private') },
                    { value: 'public', label: t('public') },
                  ]}
                  value={group.is_public ? 'public' : 'private'}
                  onChange={(value) =>
                    task.press({ action: 'update', groupId, isPublic: value === 'public' })
                  }
                />
                <Text variant="meta">{group.is_public ? t('publicHint') : t('privateHint')}</Text>
              </>
            ) : null}
          </Card>

          <Card>
            <View className="flex-row items-center gap-md">
              <View className="min-w-0 flex-1">
                <Text variant="label">{t('notifications')}</Text>
                <Text variant="meta">{t('notificationsHint')}</Text>
              </View>
              <Switch
                value={group.notify}
                onValueChange={(notify) => task.press({ action: 'preferences', groupId, notify })}
                accessibilityLabel={t('notifications')}
              />
            </View>
          </Card>

          <Card
            title={t('settingsMembers')}
            action={
              others.length > 1 ? (
                <Button size="sm" variant="ghost" onPress={() => setReordering(true)}>
                  {t('reorder')}
                </Button>
              ) : undefined
            }
          >
            <Text variant="meta">{t('orderHint')}</Text>
            {group.members.map((member) => (
              <View key={member.id} className="flex-row items-center gap-md">
                <PersonAvatar person={member} />
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={1}>
                    {member.id === viewer ? t('you') : member.name}
                  </Text>
                  <Text variant="caption" numberOfLines={1}>
                    @{member.handle}
                  </Text>
                </View>
                {member.id === group.leader_id ? (
                  <Badge tone="kaya" size="sm">
                    {t('leaderBadge')}
                  </Badge>
                ) : null}
                {isLeader && member.id !== viewer ? (
                  <IconButton
                    size="xs"
                    hitSlop={8}
                    variant="ghost"
                    onPress={() => setRemoving(member)}
                    accessibilityLabel={`${t('remove')} ${member.name}`}
                  >
                    <Icon set="ui" name="close" size={16} tintColor={colors.muted} />
                  </IconButton>
                ) : null}
              </View>
            ))}
            {group.invites.map((person) => (
              <View key={person.id} className="flex-row items-center gap-md opacity-60">
                <PersonAvatar person={person} />
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text variant="caption">{t('invited')}</Text>
                </View>
              </View>
            ))}
            {group.members.length < GROUP_CAPACITY ? (
              <Button
                fullWidth
                variant="secondary"
                leftIcon={<Icon set="system" name="user-add" size={20} />}
                onPress={() => setInviting(true)}
              >
                {t('inviteFriends')}
              </Button>
            ) : null}
          </Card>

          <Button fullWidth variant="danger" onPress={() => setLeaving(true)}>
            {t('leave')}
          </Button>
        </View>
      )}

      <ReorderSheet
        visible={reordering}
        title={t('reorder')}
        items={others.map((member) => ({
          key: member.id,
          name: member.name,
          leading: <PersonAvatar person={member} />,
        }))}
        onClose={() => setReordering(false)}
        onDone={(order) => task.press({ action: 'preferences', groupId, order })}
      />
      <InviteSheet groupId={groupId} visible={inviting} onClose={() => setInviting(false)} />
      <ConfirmSheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) task.press({ action: 'remove', groupId, userId: removing.id })
          setRemoving(null)
        }}
        title={t('removeTitle', { name: removing?.name ?? '' })}
        description={t('removeBody')}
        confirmLabel={t('remove')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
      />
      {isLeader && others.length > 0 ? (
        <PassLeaderSheet
          visible={leaving}
          members={others}
          busy={task.isPending}
          onClose={() => setLeaving(false)}
          onLeave={(id) => void leave(id)}
        />
      ) : (
        <ConfirmSheet
          visible={leaving}
          onClose={() => setLeaving(false)}
          onConfirm={() => void leave()}
          title={t('leaveTitle', { name: group?.name ?? '' })}
          description={others.length === 0 ? t('leaveLast') : t('leaveBody')}
          confirmLabel={t('leave')}
          cancelLabel={t('common:action.cancel')}
          tone="danger"
        />
      )}
    </Screen>
  )
}

function PassLeaderSheet({
  visible,
  members,
  busy,
  onClose,
  onLeave,
}: {
  visible: boolean
  members: GroupPerson[]
  busy: boolean
  onClose: () => void
  onLeave: (newLeader: string) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const [pick, setPick] = useState<string>(members[0]?.id ?? '')
  const chosen = members.find((member) => member.id === pick) ?? members[0]
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('pickLeader')}
      footer={
        <Button
          fullWidth
          variant="danger"
          loading={busy}
          disabled={!chosen}
          onPress={() => chosen && onLeave(chosen.id)}
        >
          {t('leaveAndPass', { name: chosen?.name.split(' ')[0] ?? '' })}
        </Button>
      }
    >
      <RadioGroup
        value={chosen?.id ?? ''}
        onChange={setPick}
        options={members.map((member) => ({ value: member.id, label: member.name }))}
      />
    </Sheet>
  )
}
