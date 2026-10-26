import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Card, Skeleton } from '@/ui'

/**
 * Loading shapes for the Groups screens, each drawn as the thing it stands in
 * for, so nothing jumps when the answer lands. A generic list row in place of a
 * group card made the list grow by half its height as it arrived.
 */

const slots = (count: number) => ['a', 'b', 'c', 'd'].slice(0, count)

function Loading({ children, className }: { children: React.ReactNode; className?: string }) {
  const { t } = useTranslation('social')
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('loading')} className={className}>
      {children}
    </View>
  )
}

/** A group card: icon tile, name, member line, faces, today's progress. */
export function GroupCardSkeleton() {
  return (
    <Loading className="gap-3">
      <Card>
        <View className="flex-row items-center gap-md">
          <Skeleton width={56} height={56} rounded={false} className="rounded-tile" />
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton width="55%" height={15} />
            <Skeleton width="40%" height={11} />
            <View className="flex-row py-1">
              {['a', 'b', 'c', 'd'].map((face, index) => (
                <View key={face} style={{ marginLeft: index ? -10 : 0 }}>
                  <Skeleton width={40} height={40} rounded={false} className="rounded-[14px]" />
                </View>
              ))}
            </View>
            <Skeleton width="45%" height={10} />
            <Skeleton height={6} />
          </View>
        </View>
      </Card>
    </Loading>
  )
}

/** The public list's rows: icon, name and count, and a Join button. */
export function PublicGroupsSkeleton() {
  return (
    <Loading>
      <Card flush>
        {slots(2).map((slot, index) => (
          <View key={slot} className={index ? 'border-t border-line' : undefined}>
            <View className="flex-row items-center gap-md px-card py-3">
              <Skeleton width={36} height={36} rounded={false} className="rounded-[12px]" />
              <View className="min-w-0 flex-1 gap-2">
                <Skeleton width="50%" height={14} />
                <Skeleton width="30%" height={10} />
              </View>
              <Skeleton width={68} height={36} rounded={false} className="rounded-full" />
            </View>
          </View>
        ))}
      </Card>
    </Loading>
  )
}

/** An invite: the group, who sent it, and its two buttons. */
export function InviteSkeleton() {
  return (
    <Loading>
      <View className="gap-3 rounded-tile border border-line bg-surface p-3">
        <View className="flex-row items-center gap-md">
          <Skeleton width={40} height={40} rounded={false} className="rounded-[12px]" />
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton width="50%" height={14} />
            <Skeleton width="70%" height={10} />
          </View>
        </View>
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Skeleton height={40} rounded={false} className="rounded-full" />
          </View>
          <View className="flex-1">
            <Skeleton height={40} rounded={false} className="rounded-full" />
          </View>
        </View>
      </View>
    </Loading>
  )
}

/** Settings: the group's card, the switch, and the member list. */
export function SettingsSkeleton() {
  return (
    <Loading className="gap-lg">
      <Card>
        <View className="flex-row items-center gap-md">
          <Skeleton width={56} height={56} rounded={false} className="rounded-tile" />
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton width="55%" height={18} />
            <Skeleton width="30%" height={11} />
          </View>
        </View>
      </Card>
      <Card>
        <View className="flex-row items-center gap-md">
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton width="30%" height={14} />
            <Skeleton width="55%" height={11} />
          </View>
          <Skeleton width={52} height={32} />
        </View>
      </Card>
      <Card>
        {slots(4).map((slot) => (
          <View key={slot} className="flex-row items-center gap-md">
            <Skeleton width={40} height={40} rounded={false} className="rounded-[14px]" />
            <View className="min-w-0 flex-1 gap-2">
              <Skeleton width="45%" height={14} />
              <Skeleton width="25%" height={10} />
            </View>
          </View>
        ))}
      </Card>
    </Loading>
  )
}
