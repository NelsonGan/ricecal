import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { count } from '@/features/activity/format'
import { SplitFigure } from '@/features/shared/SplitFigure'
import { ReplayMask } from '@/lib/replay-mask'
import { Button, Card, Icon, Skeleton, Text } from '@/ui'

export type ActivityCardProps = {
  /**
   * The day's steps from the phone's health store. Null when no store reported
   * the day, which draws no figure at all: zero steps on an account with no
   * store would be a claim about the user rather than about the phone.
   */
  steps: number | null | undefined
  /** The day has not answered yet. */
  loading?: boolean
  className?: string
}

/**
 * Movement on Today: the day's steps, and the way into Workouts.
 *
 * It shares the column beside the ring with water, under it. The steps used to
 * sit opposite "Your day" over the meal list, a caption beside a heading about
 * something else; here they are a figure with a heading of their own. The
 * Workouts button was a small square tile beside the water band, and is now
 * the card's one action, labelled, at its foot.
 */
export function ActivityCard({ steps, loading = false, className }: ActivityCardProps) {
  const { t } = useTranslation(['logging', 'common'])
  const router = useRouter()

  return (
    // No `flex-1` inside: the card is sized by what it holds, and the water card
    // above it takes whatever height is left. A `flex-1` surface has a basis of
    // nothing, so in a column whose height is still being settled it measured
    // as empty and the water card grew over it.
    <Card className={className} contentClassName="gap-2.5 px-4 pt-3.5 pb-4">
      <View className="gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Icon set="scenes" name="sneakers" size={20} />
          <Text variant="label" className="shrink" numberOfLines={1}>
            {t('logging:today.activity')}
          </Text>
        </View>
        {loading ? (
          <Skeleton height={32} className="w-3/4" />
        ) : typeof steps === 'number' ? (
          // Kept out of replays: a step count is Apple Health or Health Connect
          // data.
          <ReplayMask>
            <SplitFigure
              text={t('logging:today.steps', { count: steps, steps: count(steps) })}
              figure={count(steps)}
            />
          </ReplayMask>
        ) : null}
      </View>

      <Button
        variant="secondary"
        size="sm"
        fullWidth
        leftIcon={<Icon set="body" name="dumbbell" size={22} />}
        onPress={() => router.push('/workouts')}
      >
        {t('common:nav.workouts')}
      </Button>
    </Card>
  )
}
