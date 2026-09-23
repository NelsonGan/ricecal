import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { type SocialNotification, useSocialNotifications, useSocialOnline } from '@/data/social'
import {
  SocialBar,
  SocialList,
  SocialPhoto,
  useSocialTask,
  useSocialTime,
} from '@/features/social/components'
import { cn, Icon, IconButton, Screen, Tappable, Text } from '@/ui'

function NotificationRow({
  item,
  visible,
  onPress,
}: {
  item: SocialNotification
  visible: boolean
  onPress: () => void
}) {
  const { t } = useTranslation('social')
  const message = t(
    item.kind === 'follow'
      ? 'notificationFollow'
      : item.kind === 'like'
        ? 'notificationLike'
        : 'notificationComment',
    { name: item.actor_display_name },
  )
  const time = useSocialTime(item.created_at)
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={[message, time, !item.read_at ? t('unread') : '']
        .filter(Boolean)
        .join(', ')}
      className={cn(
        'min-h-[68px] flex-row items-center gap-3 px-1 py-3',
        !item.read_at && 'bg-pandan-soft',
      )}
      onPress={onPress}
    >
      <SocialPhoto
        path={item.actor_avatar_path}
        avatar
        label={item.actor_display_name}
        visible={visible}
      />
      <View className="flex-1">
        <Text variant={item.read_at ? 'body' : 'label'}>{message}</Text>
        <Text variant="meta">{time}</Text>
      </View>
      {!item.read_at ? (
        <View className="h-2.5 w-2.5 rounded-full bg-pandan" accessibilityElementsHidden />
      ) : null}
    </Tappable>
  )
}

export default function NotificationsScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const notifications = useSocialNotifications()
  const action = useSocialTask()
  const online = useSocialOnline()
  const unread =
    notifications.data?.pages
      .flatMap((page) => page.rows)
      .filter((row) => !row.read_at)
      .map((row) => row.id) ?? []
  return (
    <Screen
      scroll={false}
      flush
      header={
        <SocialBar
          title={t('notifications')}
          action={
            unread.length ? (
              <IconButton
                size="sm"
                variant="ghost"
                accessibilityLabel={t('markRead')}
                disabled={!online}
                loading={action.isPending}
                onPress={() => action.press({ action: 'read', ids: unread })}
              >
                <Icon set="ui" name="check" size={22} />
              </IconButton>
            ) : undefined
          }
        />
      }
    >
      <SocialList
        query={notifications}
        rowKey={(item) => item.id}
        empty={t('emptyNotifications')}
        variant="rows"
        renderRow={(item, visible) => (
          <NotificationRow
            item={item}
            visible={visible}
            onPress={() => {
              if (!item.read_at && online) action.press({ action: 'read', ids: [item.id] })
              if (item.post_id)
                router.push({ pathname: '/social/post/[id]', params: { id: item.post_id } })
              else
                router.push({
                  pathname: '/social/profile/[id]',
                  params: { id: item.actor_id },
                })
            }}
          />
        )}
      />
    </Screen>
  )
}
