import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type ThemeColors, useThemeColors } from '@/theme/useTheme'
import { Badge, type BadgeTone, Card, Icon, type IconProps, Skeleton, Tappable, Text } from '@/ui'

export type TrendCardProps = {
  icon: IconProps
  title: string
  /**
   * Drawn in place of the icon and title: the first card's Calories and
   * Protein switch, which names the card as it picks it.
   */
  heading?: ReactNode
  /** Where the heading leads: the entries behind the figure. */
  onOpen?: () => void
  /** Replaces the arrow: the weight card's Add pill. */
  action?: ReactNode
  /** The range's figure, its unit, and the pill that says whether it was good. */
  figure?: { value: string; unit: string }
  chip?: ReactNode
  loading?: boolean
  /**
   * Why the figures are not here: a request held while offline, which resumes
   * by itself, or one that failed, which gets a retry. Without it a failed
   * request was a skeleton that never ended.
   */
  problem?: 'offline' | 'unreachable' | null
  onRetry?: () => void
  children?: ReactNode
}

/**
 * One metric on the Trends screen: a heading, the range's figure, then the
 * line. Every card has the same three rows in the same places, so the four
 * read as one sheet rather than four layouts, and the eye can run down the
 * figures without reading a word.
 *
 * The heading row is a list row: the whole width opens the entries behind
 * the card, with the app's arrow at the far edge where every other row that
 * goes somewhere has it. Squeezed in beside the title it read as part of the
 * word.
 */
export function TrendCard({
  icon,
  title,
  heading,
  onOpen,
  action,
  figure,
  chip,
  loading = false,
  problem = null,
  onRetry,
  children,
}: TrendCardProps) {
  const { t } = useTranslation('common')
  const colors = useThemeColors()

  const arrow = <Icon set="ui" name="chevron-right" size={20} tintColor={colors.faint} />
  const named = (
    <View className="min-w-0 shrink flex-row items-center gap-2">
      <Icon {...icon} size={22} />
      <Text variant="subtitle" numberOfLines={1} className="min-w-0 shrink">
        {title}
      </Text>
    </View>
  )

  return (
    <Card contentClassName="gap-3">
      {heading ? (
        // A control cannot sit inside a pressable row, so here only the
        // arrow opens the entries.
        <View className="min-h-sm flex-row items-center justify-between gap-3">
          {heading}
          {action ??
            (onOpen ? (
              <Tappable
                onPress={onOpen}
                accessibilityRole="button"
                accessibilityLabel={title}
                hitSlop={12}
              >
                {arrow}
              </Tappable>
            ) : null)}
        </View>
      ) : onOpen && !action ? (
        <Tappable
          onPress={onOpen}
          accessibilityRole="button"
          className="min-h-sm flex-row items-center justify-between gap-3"
        >
          {named}
          {arrow}
        </Tappable>
      ) : (
        <View className="min-h-sm flex-row items-center justify-between gap-3">
          {onOpen ? (
            <Tappable onPress={onOpen} accessibilityRole="button" hitSlop={8} className="shrink">
              {named}
            </Tappable>
          ) : (
            named
          )}
          {action}
        </View>
      )}

      {problem ? (
        <View className="flex-row items-center justify-between gap-3 py-1">
          <Text variant="meta" className="min-w-0 shrink">
            {t(problem === 'offline' ? 'offline.title' : 'offline.unreachableTitle')}
          </Text>
          {problem === 'unreachable' && onRetry ? (
            <Tappable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
              <Text variant="label" className="text-pandan-ink">
                {t('action.retry')}
              </Text>
            </Tappable>
          ) : null}
        </View>
      ) : loading ? (
        <View className="gap-3">
          <Skeleton width={140} height={34} />
          <Skeleton className="h-[128px] w-full" />
        </View>
      ) : (
        <>
          {figure ? (
            <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <View className="flex-row items-baseline gap-1.5">
                {/* No `leading-`: the display face's line box is what keeps the
                    figure and its unit on one baseline. */}
                <Text className="font-display text-[34px] text-heading" numberOfLines={1}>
                  {figure.value}
                </Text>
                <Text variant="meta" numberOfLines={1}>
                  {figure.unit}
                </Text>
              </View>
              {chip}
            </View>
          ) : null}
          {children}
        </>
      )}
    </Card>
  )
}

/**
 * The pill beside a figure: which way it went, coloured by whether that was
 * good. The direction and the judgement are separate arguments because they
 * disagree: weight going down is good, workouts going down is not.
 */
export function TrendChip({
  tone,
  direction,
  label,
}: {
  tone: BadgeTone
  direction?: 'up' | 'down'
  label: string
}) {
  const colors = useThemeColors()
  return (
    <Badge tone={tone} size="sm" className="flex-row items-center gap-1 px-2.5 py-1.5">
      {/* A plain arrow in the pill's own ink. The illustrated trend arrows are
          red going down and green going up, which on a green "212 under" pill
          said bad and good at once. */}
      {direction ? (
        <Icon
          set="ui"
          name={direction === 'up' ? 'arrow-up' : 'arrow-down'}
          size={13}
          tintColor={colors[ARROW_INK[tone]]}
        />
      ) : null}
      <Text variant="caption" className={CHIP_INK[tone]} numberOfLines={1}>
        {label}
      </Text>
    </Badge>
  )
}

const ARROW_INK = {
  pandan: 'pandanInk',
  kaya: 'kayaInk',
  hibiscus: 'hibiscusInk',
  water: 'waterInk',
  neutral: 'muted',
} as const satisfies Record<BadgeTone, keyof ThemeColors>

const CHIP_INK: Record<BadgeTone, string> = {
  pandan: 'text-pandan-ink',
  kaya: 'text-kaya-ink',
  hibiscus: 'text-hibiscus-ink',
  water: 'text-water-ink',
  neutral: 'text-muted',
}

/**
 * Why a card has no figures: held offline (it resumes by itself), or failed
 * with nothing to show. Data already in hand wins, so a refetch that fails
 * behind a drawn card does not take the card away.
 */
export function problemOf(
  queries: readonly { data: unknown; isPaused: boolean; isError: boolean }[],
): 'offline' | 'unreachable' | null {
  if (queries.some((query) => query.data === undefined && query.isPaused)) return 'offline'
  if (queries.some((query) => query.data === undefined && query.isError)) return 'unreachable'
  return null
}
