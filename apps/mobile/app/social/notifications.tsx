import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSocialNotifications, useSocialOnline } from '@/data/social'
import { SocialBar, SocialList, SocialPhoto, useSocialTask } from '@/features/social/components'
import { Button, Screen, Tappable, Text } from '@/ui'

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
    <Screen scroll={false} flush header={<SocialBar title={t('notifications')} />}>
      <SocialList
        query={notifications}
        rowKey={(item) => item.id}
        empty={t('emptyNotifications')}
        header={
          unread.length ? (
            <Button
              size="sm"
              variant="neutral"
              loading={action.isPending}
              disabled={!online}
              onPress={() => action.press({ action: 'read', ids: unread })}
            >
              {t('markRead')}
            </Button>
          ) : undefined
        }
        renderRow={(item, visible) => (
          <Tappable
            accessibilityLabel={t(
              item.kind === 'follow'
                ? 'notificationFollow'
                : item.kind === 'like'
                  ? 'notificationLike'
                  : 'notificationComment',
              { name: item.actor_display_name },
            )}
            className="flex-row items-center gap-3 rounded-md bg-surface p-3"
            onPress={() => {
              if (!item.read_at && online) action.press({ action: 'read', ids: [item.id] })
              if (item.post_id)
                router.push({ pathname: '/social/post/[id]', params: { id: item.post_id } })
              else router.push({ pathname: '/social/profile/[id]', params: { id: item.actor_id } })
            }}
          >
            <SocialPhoto
              path={item.actor_avatar_path}
              avatar
              label={item.actor_display_name}
              visible={visible}
            />
            <View className="flex-1">
              <Text variant={item.read_at ? 'body' : 'label'}>
                {t(
                  item.kind === 'follow'
                    ? 'notificationFollow'
                    : item.kind === 'like'
                      ? 'notificationLike'
                      : 'notificationComment',
                  { name: item.actor_display_name },
                )}
              </Text>
            </View>
          </Tappable>
        )}
      />
    </Screen>
  )
}
