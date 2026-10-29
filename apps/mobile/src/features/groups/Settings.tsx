import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useUserId } from '@/data'
import { GROUP_CAPACITY, type GroupPerson, useGroupDetails } from '@/data/groups'
import { QueryNotice } from '@/features/social/components'
import { useBack } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import {
  AppBar,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  Icon,
  RadioGroup,
  Screen,
  SegmentedControl,
  Sheet,
  Switch,
  Tappable,
  Text,
  TextField,
} from '@/ui'
import { GroupIconPicker } from './IconPicker'
import { InviteSheet } from './InviteSheet'
import { GroupIcon, PersonAvatar, PersonAvatarLink, useGroupTask } from './parts'
import { SettingsSkeleton } from './Skeletons'
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
  const [inviting, setInviting] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [removing, setRemoving] = useState<GroupPerson | null>(null)
  const [choosingIcon, setChoosingIcon] = useState(false)
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
        details.isError || details.fetchStatus === 'paused' ? (
          // Paused is offline with nothing cached, which would wait for ever.
          <QueryNotice
            error={details.isError}
            paused={details.fetchStatus === 'paused'}
            retry={() => details.refetch()}
          />
        ) : (
          <SettingsSkeleton />
        )
      ) : (
        <View className="gap-lg pb-xl">
          <Card>
            <View className="flex-row items-center gap-md">
              <Tappable
                disabled={!isLeader}
                onPress={() => setChoosingIcon(true)}
                accessibilityRole={isLeader ? 'button' : undefined}
                accessibilityLabel={isLeader ? t('changeIcon') : undefined}
                className="h-14 w-14 items-center justify-center overflow-hidden rounded-tile bg-pandan-soft"
              >
                {group.icon_path ? (
                  <GroupIcon name={group.icon_name} path={group.icon_path} fill />
                ) : (
                  <GroupIcon name={group.icon_name} size={40} />
                )}
                {isLeader ? (
                  <View className="absolute bottom-0.5 right-0.5 h-5 w-5 items-center justify-center rounded-full bg-surface">
                    <Icon set="ui" name="edit" size={13} tintColor={colors.muted} />
                  </View>
                ) : null}
              </Tappable>
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

          <Card title={t('settingsMembers')}>
            {/* The viewer's own row heads every board they see; the rest follow
                in the board's order, whoever logged a food or a workout last
                first. One block, so the card's gap does not open between rows. */}
            <View>
              {group.members
                .filter((member) => member.id === viewer)
                .map((member) => (
                  <View key={member.id} className="justify-center" style={{ height: ROW }}>
                    <MemberLine
                      member={member}
                      name={t('you')}
                      leader={member.id === group.leader_id}
                    />
                  </View>
                ))}
              {others.map((member) => (
                <View key={member.id} className="justify-center" style={{ height: ROW }}>
                  <MemberLine
                    member={member}
                    name={member.name}
                    leader={member.id === group.leader_id}
                    trailing={
                      isLeader ? (
                        // Plain rather than an IconButton, whose raised edge
                        // left room underneath and sat the cross off centre.
                        <Tappable
                          className="h-[44px] w-[36px] items-center justify-center"
                          onPress={() => setRemoving(member)}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('remove')} ${member.name}`}
                        >
                          <Icon set="ui" name="close" size={14} tintColor={colors.faint} />
                        </Tappable>
                      ) : null
                    }
                  />
                </View>
              ))}
            </View>
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
      {group && isLeader ? (
        <Sheet
          visible={choosingIcon}
          onClose={() => setChoosingIcon(false)}
          closeLabel={t('common:action.close')}
          title={t('changeIcon')}
        >
          <GroupIconPicker
            value={{ name: group.icon_name, path: group.icon_path }}
            beforePaywall={() => setChoosingIcon(false)}
            onChange={(choice) => {
              setChoosingIcon(false)
              task.press(
                choice.path
                  ? { action: 'update', groupId, iconPath: choice.path }
                  : { action: 'update', groupId, iconName: choice.name },
              )
            }}
          />
        </Sheet>
      ) : null}
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

/** One member: their face (which opens their feed), name and handle, and what the row offers. */
function MemberLine({
  member,
  name,
  leader,
  trailing,
}: {
  member: GroupPerson
  name: string
  leader: boolean
  trailing?: ReactNode
}) {
  const { t } = useTranslation('groups')
  return (
    <View className="h-[56px] flex-row items-center gap-md">
      <PersonAvatarLink person={member} />
      <View className="min-w-0 flex-1">
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" numberOfLines={1}>
          @{member.handle}
        </Text>
      </View>
      {leader ? (
        // Centred on the row; a badge sits at the top of one by default.
        <Badge tone="kaya" size="sm" className="self-center">
          {t('leaderBadge')}
        </Badge>
      ) : null}
      {trailing}
    </View>
  )
}

/** A member row's height, the same for the viewer's and everyone else's. */
const ROW = 60
