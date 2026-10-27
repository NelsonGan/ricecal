import * as Haptics from 'expo-haptics'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useUserId } from '@/data'
import { GROUP_CAPACITY, type GroupPerson, useGroupDetails } from '@/data/groups'
import { reslot } from '@/features/shared/reslot'
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
  IconButton,
  RadioGroup,
  Screen,
  SegmentedControl,
  Sheet,
  Switch,
  Text,
  TextField,
} from '@/ui'
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

          <Card title={t('settingsMembers')}>
            {/* The viewer's own row heads every board they see, so it stays
                put; the rest are dragged into the order the board draws them. */}
            {group.members
              .filter((member) => member.id === viewer)
              .map((member) => (
                <MemberLine
                  key={member.id}
                  member={member}
                  name={t('you')}
                  leader={member.id === group.leader_id}
                />
              ))}
            <SortableMembers
              key={others.map((member) => member.id).join()}
              members={others}
              onReorder={(order) => task.press({ action: 'preferences', groupId, order })}
              renderRow={(member, handle) => (
                <MemberLine
                  member={member}
                  name={member.name}
                  leader={member.id === group.leader_id}
                  trailing={
                    <>
                      {isLeader ? (
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
                      {handle}
                    </>
                  }
                />
              )}
            />
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
        <Badge tone="kaya" size="sm">
          {t('leaderBadge')}
        </Badge>
      ) : null}
      {trailing}
    </View>
  )
}

/** A row's height in the sortable list, so where each one lands is arithmetic. */
const ROW = 60

/**
 * The other members in the viewer's own board order, put in a new one by
 * dragging the handle at a row's end, right where they are listed. The order
 * is saved as the finger lifts. It used to take a Reorder button and a sheet,
 * which hid a two-second change behind two taps.
 *
 * The handle is the only part that drags, so the page still scrolls under a
 * thumb anywhere else, and the face still opens a profile.
 */
function SortableMembers({
  members,
  onReorder,
  renderRow,
}: {
  members: GroupPerson[]
  onReorder: (order: string[]) => void
  renderRow: (member: GroupPerson, handle: ReactNode) => ReactNode
}) {
  // The rows in the order they had when this list was drawn; a saved order
  // redraws it under a new key, so a drag never fights a refetch mid-move.
  // What each row shows still comes from the latest read, so a new name or
  // picture is not held back until the next reorder.
  const [shown] = useState(members)
  const latest = new Map(members.map((member) => [member.id, member]))
  const slots = useSharedValue<Record<string, number>>(
    Object.fromEntries(shown.map((member, index) => [member.id, index])),
  )
  const before = useRef(shown.map((member) => member.id).join())
  const commit = () => {
    const at = slots.value
    const order = [...shown]
      .sort((a, b) => (at[a.id] ?? 0) - (at[b.id] ?? 0))
      .map((member) => member.id)
    if (order.join() === before.current) return
    before.current = order.join()
    onReorder(order)
  }
  if (shown.length === 0) return null
  return (
    <View style={{ height: shown.length * ROW }}>
      {shown.map((member, index) => (
        <SortableRow
          key={member.id}
          member={latest.get(member.id) ?? member}
          initialSlot={index}
          slots={slots}
          count={shown.length}
          movable={shown.length > 1}
          onDrop={commit}
          renderRow={renderRow}
        />
      ))}
    </View>
  )
}

function SortableRow({
  member,
  initialSlot,
  slots,
  count,
  movable,
  onDrop,
  renderRow,
}: {
  member: GroupPerson
  initialSlot: number
  slots: SharedValue<Record<string, number>>
  count: number
  movable: boolean
  onDrop: () => void
  renderRow: (member: GroupPerson, handle: ReactNode) => ReactNode
}) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  const key = member.id
  const top = useSharedValue(initialSlot * ROW)
  const dragging = useSharedValue(false)
  const from = useSharedValue(0)

  // Every row but the one under the finger glides to its slot as the order changes.
  useAnimatedReaction(
    () => slots.value[key],
    (slot, previous) => {
      if (slot === undefined || slot === previous) return
      if (!dragging.value) top.value = withTiming(slot * ROW, { duration: 160 })
    },
  )
  const tick = () => {
    void Haptics.selectionAsync().catch(() => {})
  }
  const pan = Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      dragging.value = true
      from.value = top.value
      runOnJS(tick)()
    })
    .onUpdate((event) => {
      top.value = Math.max(0, Math.min((count - 1) * ROW, from.value + event.translationY))
      const next = reslot(slots.value, key, Math.round(top.value / ROW))
      if (next === slots.value) return
      slots.value = next
      runOnJS(tick)()
    })
    .onFinalize(() => {
      if (!dragging.value) return
      dragging.value = false
      top.value = withTiming((slots.value[key] ?? 0) * ROW, { duration: 160 })
      runOnJS(onDrop)()
    })
  // A screen reader's way: swipe up on the handle for earlier, down for later.
  const nudge = (by: -1 | 1) => {
    const at = slots.value[key]
    if (at === undefined) return
    slots.value = reslot(slots.value, key, Math.max(0, Math.min(count - 1, at + by)))
    onDrop()
  }
  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: dragging.value ? 10 : 0,
    transform: [{ scale: withTiming(dragging.value ? 1.03 : 1, { duration: 120 }) }],
    shadowOpacity: withTiming(dragging.value ? 0.16 : 0, { duration: 120 }),
  }))
  const handle = movable ? (
    <GestureDetector gesture={pan}>
      <View
        className="h-[44px] w-[40px] items-center justify-center"
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('reorderMember', { name: member.name })}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          nudge(event.nativeEvent.actionName === 'increment' ? -1 : 1)
        }
      >
        <Icon set="ui" name="reorder" size={22} tintColor={colors.muted} />
      </View>
    </GestureDetector>
  ) : null
  return (
    <Animated.View
      className="absolute inset-x-0 justify-center rounded-md bg-surface"
      style={[
        {
          height: ROW,
          shadowColor: '#000',
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      {renderRow(member, handle)}
    </Animated.View>
  )
}
