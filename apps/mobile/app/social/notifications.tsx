import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { type SocialNotification, useSeeNotifications, useSocialNotifications } from '@/data/social'
import { SocialBar, SocialList, SocialPhoto, useSocialTime } from '@/features/social/components'
import { cn, Screen, Tappable, Text } from '@/ui'

function NotificationRow({
  item,
  fresh,
  visible,
  onPress,
}: {
  item: SocialNotification
  /** New on this visit: still drawn as unread after opening marked it seen. */
  fresh: boolean
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
  const unread = fresh || !item.read_at
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={[message, time, unread ? t('unread') : ''].filter(Boolean).join(', ')}
      className={cn(
        'min-h-[68px] flex-row items-center gap-3 px-1 py-3',
        unread && 'bg-pandan-soft',
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
        <Text variant={unread ? 'label' : 'body'}>{message}</Text>
        <Text variant="meta">{time}</Text>
      </View>
      {unread ? (
        <View className="h-2.5 w-2.5 rounded-full bg-pandan" accessibilityElementsHidden />
      ) : null}
    </Tappable>
  )
}

export default function NotificationsScreen() {
  const { t } = useTranslation('social')
  const router = useRouter()
  const notifications = useSocialNotifications()
  const rows = notifications.data?.pages.flatMap((page) => page.rows) ?? []
  // What was unread when it was first drawn this visit keeps its highlight, so
  // marking it seen on opening does not wipe out which ones are new.
  const fresh = useRef(new Set<string>()).current
  for (const row of rows) if (!row.read_at) fresh.add(row.id)
  useSeeNotifications(
    rows[0]?.created_at,
    rows.some((row) => !row.read_at),
  )
  return (
    <Screen scroll={false} flush header={<SocialBar title={t('notifications')} />}>
      <SocialList
        query={notifications}
        rowKey={(item) => item.id}
        empty={t('emptyNotifications')}
        variant="rows"
        renderRow={(item, visible) => (
          <NotificationRow
            item={item}
            fresh={fresh.has(item.id)}
            visible={visible}
            onPress={() => {
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
