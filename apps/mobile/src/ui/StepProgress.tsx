import { View } from 'react-native'

import { cn } from './cn'
import { Text } from './Text'

const fills = {
  pandan: 'bg-pandan',
  kaya: 'bg-kaya',
  water: 'bg-water',
  hibiscus: 'bg-hibiscus',
} as const

export type StepProgressTone = keyof typeof fills

export type StepProgressProps = {
  /** Total steps in the flow. */
  total: number
  /** 1-based index of the current step. */
  current: number
  /** Line under the bars, e.g. "Step 2 of 4, about a minute left". */
  caption?: string
  /**
   * What the bars are counting, for a screen reader. Without it the row is a
   * bare percentage, since the marks carry their meaning visually.
   */
  accessibilityLabel?: string
  /** Colour of the filled segments. */
  tone?: StepProgressTone
  /**
   * `bar` draws one continuous track instead of a mark per step. Onboarding
   * uses it: at twelve steps the marks were twelve slivers, which read as noise
   * rather than as a count.
   */
  variant?: 'segments' | 'bar'
  className?: string
}

/**
 * Segmented progress across an onboarding flow.
 *
 * Separate bars rather than one continuous track: the user is being asked for
 * a commitment of unknown length, and four discrete marks answer "how much
 * more" at a glance in a way a 50%-full bar does not.
 */
export function StepProgress({
  total,
  current,
  caption,
  accessibilityLabel,
  tone = 'pandan',
  variant = 'segments',
  className,
}: StepProgressProps) {
  // Materialised with an id rather than mapped over an index: a step bar is
  // nothing but its position, so the position is the identity, and naming it
  // says so instead of leaving a lint suppression to explain it.
  const steps = Array.from({ length: total }, (_, index) => ({
    id: `step-${index}`,
    done: index < current,
  }))

  return (
    <View
      className={cn('gap-2', className)}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: total, now: current, text: caption }}
    >
      {variant === 'bar' ? (
        <View className="h-2 overflow-hidden rounded-full bg-track">
          <View
            className={cn('h-full rounded-full', fills[tone])}
            style={{ width: `${Math.min(100, (current / Math.max(total, 1)) * 100)}%` }}
          />
        </View>
      ) : (
        <View className="flex-row gap-2">
          {steps.map((step) => (
            <View
              key={step.id}
              className={cn('h-2.5 flex-1 rounded-full', step.done ? fills[tone] : 'bg-track')}
            />
          ))}
        </View>
      )}
      {caption ? (
        <Text variant="label" className="text-muted">
          {caption}
        </Text>
      ) : null}
    </View>
  )
}
