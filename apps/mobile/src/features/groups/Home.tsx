import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshControl, ScrollView, View } from 'react-native'
import { useUserId } from '@/data'
import {
  GROUP_CAPACITY,
  type GroupInvite,
  type GroupSummary,
  useGroupInviteCount,
  useGroupInvites,
  useMyGroups,
  usePublicGroups,
} from '@/data/groups'
import { ScreenTitle } from '@/features/shared'
import { QueryNotice } from '@/features/social/components'
import { track } from '@/lib/analytics'
import { ensureNotificationPermission } from '@/lib/notifications'
import { registerPushToken } from '@/lib/push'
import { useDebouncedValue } from '@/lib/use-debounce'
import { slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import {
  AvatarGroup,
  Badge,
  Button,
  Card,
  ConfirmSheet,
  CountBadge,
  EmptyState,
  Icon,
  IconButton,
  ProgressBar,
  SearchField,
  SegmentedControl,
  Sheet,
  Tappable,
  Text,
  TextField,
  useNavInset,
  useToast,
} from '@/ui'
import { GROUP_ICONS, GroupIcon, PersonAvatar, useGroupTask } from './parts'
import { GroupCardSkeleton, InviteSkeleton, PublicGroupsSkeleton } from './Skeletons'

/** Ask once a group exists, when a nudge has somewhere to come from. */
async function askForPush(userId: string) {
  if (await ensureNotificationPermission()) await registerPushToken(userId)
}

export function GroupsHome({ onOpen }: { onOpen: (groupId: string) => void }) {
  const { t } = useTranslation('groups')
  const groups = useMyGroups()
  const invites = useGroupInviteCount()
  const inviteCount = invites.data ?? 0
  // The count polls slowly; landing on the tab is a good moment to ask again.
  useFocusEffect(
    useCallback(() => {
      void invites.refetch()
    }, [invites.refetch]),
  )
  const [creating, setCreating] = useState(false)
  const [invitesOpen, setInvitesOpen] = useState(false)
  const navInset = useNavInset()
  const list = groups.data ?? []

  return (
    <ScrollView
      contentContainerClassName="gap-lg px-gutter pt-1"
      contentContainerStyle={{ paddingBottom: navInset + 24 }}
      refreshControl={
        <RefreshControl refreshing={groups.isRefetching} onRefresh={() => void groups.refetch()} />
      }
    >
      <ScreenTitle
        title={t('title')}
        trailing={
          <View className="flex-row items-center gap-2">
            <IconButton
              size="sm"
              variant="neutral"
              accessibilityLabel={inviteCount ? `${t('invites')}, ${inviteCount}` : t('invites')}
              onPress={() => setInvitesOpen(true)}
            >
              <View className="h-6 w-6 items-center justify-center">
                <Icon set="ui" name="mail" size={22} />
                <CountBadge
                  count={inviteCount}
                  className="absolute -right-2.5 -top-2.5 h-5 min-w-5 px-1"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              </View>
            </IconButton>
            <IconButton
              size="sm"
              variant="primary"
              accessibilityLabel={t('newGroup')}
              onPress={() => setCreating(true)}
            >
              <Icon set="ui" name="plus" size={22} />
            </IconButton>
          </View>
        }
      />

      {groups.isLoading ? (
        <GroupCardSkeleton />
      ) : !groups.data && (groups.isError || groups.fetchStatus === 'paused') ? (
        <QueryNotice
          error={groups.isError}
          paused={groups.fetchStatus === 'paused'}
          retry={() => groups.refetch()}
        />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={{ set: 'food', name: 'rice-bowl' }}
            title={t('emptyTitle')}
            description={t('emptyBody')}
            action={<Button onPress={() => setCreating(true)}>{t('startGroup')}</Button>}
          />
        </Card>
      ) : (
        <View className="gap-3">
          <Text variant="overlineSm">{t('yourGroups')}</Text>
          {list.map((group) => (
            <GroupCard key={group.id} group={group} onPress={() => onOpen(group.id)} />
          ))}
        </View>
      )}

      <PublicGroups onJoined={onOpen} />

      <CreateGroupSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          onOpen(id)
        }}
      />
      <InvitesSheet visible={invitesOpen} onClose={() => setInvitesOpen(false)} onJoined={onOpen} />
    </ScrollView>
  )
}

function GroupCard({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  const { t } = useTranslation('groups')
  const colors = useThemeColors()
  return (
    <Card
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        group.name,
        t('members', { count: group.member_count }),
        group.is_public ? t('public') : t('private'),
        t('loggedToday', { logged: group.logged_today, count: group.member_count }),
      ].join(', ')}
    >
      <View className="flex-row items-center gap-md">
        <View className="h-14 w-14 items-center justify-center rounded-tile bg-pandan-soft">
          <GroupIcon name={group.icon_name} size={40} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text variant="label" numberOfLines={1} className="shrink">
              {group.name}
            </Text>
            {group.is_leader ? (
              <Badge tone="kaya" size="sm">
                {t('leaderBadge')}
              </Badge>
            ) : null}
          </View>
          <Text variant="caption" numberOfLines={1}>
            {t('members', { count: group.member_count })} ·{' '}
            {group.is_public ? t('public') : t('private')}
          </Text>
          <AvatarGroup
            names={group.members.map((person) => person.name)}
            total={group.member_count}
            max={4}
            renderAvatar={(_, index) => {
              const person = group.members[index]
              // A picture has no slab under it, so it is lifted to sit level
              // with the initials beside it, as the "+N" tile is.
              return person?.avatar_path ? (
                <View style={{ marginBottom: slab.md }}>
                  <PersonAvatar person={person} />
                </View>
              ) : undefined
            }}
            className="py-1"
          />
          <Text variant="micro">
            {t('loggedToday', { logged: group.logged_today, count: group.member_count })}
          </Text>
          <ProgressBar
            value={group.member_count ? group.logged_today / group.member_count : 0}
            height={6}
          />
        </View>
        <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
      </View>
    </Card>
  )
}

function PublicGroups({ onJoined }: { onJoined: (groupId: string) => void }) {
  const { t } = useTranslation(['groups', 'common', 'logging'])
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 300)
  const groups = usePublicGroups(debounced)
  const userId = useUserId()
  const task = useGroupTask()
  const toast = useToast()
  const [reporting, setReporting] = useState<{ id: string; name: string } | null>(null)
  const join = async (groupId: string) => {
    try {
      await task.run({ action: 'join', groupId })
      track('Group Joined', { via: 'public' })
      void askForPush(userId)
      onJoined(groupId)
    } catch {
      // The task showed why.
    }
  }
  const rows = groups.data ?? []
  return (
    <View className="gap-3">
      <Text variant="overlineSm">{t('publicGroups')}</Text>
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={t('searchPublic')}
        onClear={() => setQuery('')}
        clearLabel={t('logging:search.clear')}
      />
      {groups.isLoading ? (
        <PublicGroupsSkeleton />
      ) : !groups.data && (groups.isError || groups.fetchStatus === 'paused') ? (
        <QueryNotice
          error={groups.isError}
          paused={groups.fetchStatus === 'paused'}
          retry={() => groups.refetch()}
        />
      ) : rows.length === 0 ? (
        <Text variant="meta" className="py-2 text-center">
          {t('noPublic')}
        </Text>
      ) : (
        <Card flush>
          {rows.map((group, index) => (
            // A name is written by its leader and read by strangers, so it can
            // be reported: a long press, or the screen reader's action.
            <Tappable
              key={group.id}
              haptics={false}
              onLongPress={() => setReporting({ id: group.id, name: group.name })}
              accessibilityActions={[{ name: 'longpress', label: t('report') }]}
              onAccessibilityAction={() => setReporting({ id: group.id, name: group.name })}
              className={index > 0 ? 'border-t border-line' : undefined}
            >
              <View className="flex-row items-center gap-md px-card py-3">
                <GroupIcon name={group.icon_name} size={36} />
                <View className="min-w-0 flex-1">
                  <Text variant="label" numberOfLines={1}>
                    {group.name}
                  </Text>
                  {/* Full is said beside the count it follows from, and Join
                      stays where it always is, greyed, so the row does not
                      change shape when the tenth person joins. */}
                  <Text variant="caption" numberOfLines={1}>
                    {t('members', { count: group.member_count })}
                    {group.member_count >= GROUP_CAPACITY ? (
                      <Text variant="caption" className="font-body-bold text-hibiscus-ink">
                        {` · ${t('full')}`}
                      </Text>
                    ) : null}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={group.member_count >= GROUP_CAPACITY}
                  onPress={() => void join(group.id)}
                >
                  {t('join')}
                </Button>
              </View>
            </Tappable>
          ))}
        </Card>
      )}
      <ConfirmSheet
        visible={reporting !== null}
        onClose={() => setReporting(null)}
        onConfirm={() => {
          if (reporting) {
            task.press({ action: 'reportGroup', groupId: reporting.id })
            toast.show({ title: t('reportedGroup'), tone: 'success' })
          }
          setReporting(null)
        }}
        title={t('reportGroup', { name: reporting?.name ?? '' })}
        confirmLabel={t('report')}
        cancelLabel={t('common:action.cancel')}
        tone="danger"
      />
    </View>
  )
}

function CreateGroupSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: (groupId: string) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string>(GROUP_ICONS[0])
  const [privacy, setPrivacy] = useState<'private' | 'public'>('private')
  const userId = useUserId()
  const task = useGroupTask()
  const create = async () => {
    try {
      const id = await task.run({
        action: 'create',
        name: name.trim(),
        iconName: icon,
        isPublic: privacy === 'public',
      })
      track('Group Created', { visibility: privacy })
      setName('')
      void askForPush(userId)
      if (typeof id === 'string') onCreated(id)
    } catch {
      // The task showed why; the sheet keeps the draft.
    }
  }
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('newGroup')}
      footer={
        <Button
          fullWidth
          loading={task.isPending}
          disabled={!name.trim()}
          onPress={() => void create()}
        >
          {t('create')}
        </Button>
      }
    >
      <View className="gap-lg">
        <TextField
          label={t('name')}
          value={name}
          onChangeText={setName}
          placeholder={t('namePlaceholder')}
          maxLength={40}
          autoCapitalize="words"
        />
        <View className="gap-2">
          <Text variant="label">{t('icon')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {GROUP_ICONS.map((option) => (
              <Tappable
                key={option}
                onPress={() => setIcon(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: icon === option }}
                accessibilityLabel={`${t('icon')} ${GROUP_ICONS.indexOf(option) + 1}`}
                className={
                  icon === option
                    ? 'h-14 w-14 items-center justify-center rounded-tile border-2 border-pandan bg-pandan-soft'
                    : 'h-14 w-14 items-center justify-center rounded-tile border border-line bg-surface'
                }
              >
                <GroupIcon name={option} size={36} />
              </Tappable>
            ))}
          </View>
        </View>
        <View className="gap-2">
          <SegmentedControl
            options={[
              { value: 'private', label: t('private') },
              { value: 'public', label: t('public') },
            ]}
            value={privacy}
            onChange={setPrivacy}
          />
          <Text variant="meta">{privacy === 'private' ? t('privateHint') : t('publicHint')}</Text>
        </View>
      </View>
    </Sheet>
  )
}

function InvitesSheet({
  visible,
  onClose,
  onJoined,
}: {
  visible: boolean
  onClose: () => void
  onJoined: (groupId: string) => void
}) {
  const { t } = useTranslation(['groups', 'common'])
  const invites = useGroupInvites(visible)
  const rows = invites.data ?? []
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('invites')}
    >
      {invites.isLoading ? (
        <InviteSkeleton />
      ) : !invites.data && (invites.isError || invites.fetchStatus === 'paused') ? (
        <QueryNotice
          error={invites.isError}
          paused={invites.fetchStatus === 'paused'}
          retry={() => invites.refetch()}
        />
      ) : rows.length === 0 ? (
        <Text variant="meta" className="py-lg text-center">
          {t('noInvites')}
        </Text>
      ) : (
        <View className="gap-3">
          {rows.map((invite) => (
            <InviteRow
              key={invite.group_id}
              invite={invite}
              onJoined={(id) => {
                onClose()
                onJoined(id)
              }}
            />
          ))}
        </View>
      )}
    </Sheet>
  )
}

function InviteRow({
  invite,
  onJoined,
}: {
  invite: GroupInvite
  onJoined: (groupId: string) => void
}) {
  const { t } = useTranslation('groups')
  const userId = useUserId()
  const task = useGroupTask()
  const respond = async (accept: boolean) => {
    try {
      await task.run({ action: 'respond', groupId: invite.group_id, accept })
      if (accept) {
        track('Group Joined', { via: 'invite' })
        void askForPush(userId)
        onJoined(invite.group_id)
      }
    } catch {
      // The task showed why.
    }
  }
  const full = invite.member_count >= GROUP_CAPACITY
  return (
    <View className="gap-3 rounded-tile border border-line bg-surface p-3">
      <View className="flex-row items-center gap-md">
        <GroupIcon name={invite.icon_name} size={40} />
        <View className="min-w-0 flex-1">
          <Text variant="label" numberOfLines={1}>
            {invite.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {t('invitedBy', { name: invite.inviter.name })} ·{' '}
            {t('members', { count: invite.member_count })}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          size="sm"
          disabled={full || task.isPending}
          onPress={() => void respond(true)}
        >
          {full ? t('full') : t('join')}
        </Button>
        <Button
          className="flex-1"
          size="sm"
          variant="secondary"
          disabled={task.isPending}
          onPress={() => void respond(false)}
        >
          {t('decline')}
        </Button>
      </View>
    </View>
  )
}
