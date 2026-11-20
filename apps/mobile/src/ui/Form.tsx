import { Children, Fragment, type ReactNode } from 'react'
import { View } from 'react-native'

import { cn } from './cn'
import { Text } from './Text'

/**
 * One white card holding several short answers, a hairline between each.
 *
 * The onboarding questions used to give every answer its own full-width box
 * with its own heading over it, which made "how tall are you" look like a
 * form to fill in rather than a question. A card of rows reads as one thing,
 * and every input step in onboarding uses it so they all look alike. Pair it
 * with `TextField`, `Select` and `SegmentedControl` at `size="sm"`.
 */
export function FormCard({ children, className }: { children: ReactNode; className?: string }) {
  const rows = Children.toArray(children).filter(Boolean)
  return (
    <View className={cn('rounded-tile border-2 border-line bg-surface px-4', className)}>
      {rows.map((row, index) => (
        // A card's rows never reorder, so their place is their identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Fragment key={index}>
          {index > 0 ? <View className="h-[2px] bg-line" /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  )
}

/**
 * A label on the left and its control on the right, 60pt tall.
 *
 * `below` is for the one control that needs the card's full width, the target
 * weight slider, so it can sit in the same card as the rows above it.
 */
export function FormRow({
  label,
  value,
  children,
  below,
}: {
  label: string
  /** A read-only figure at the trailing edge, in place of a control. */
  value?: ReactNode
  children?: ReactNode
  below?: ReactNode
}) {
  return (
    <View className="gap-2 py-2.5">
      <View className="min-h-[44px] flex-row items-center gap-3">
        <Text variant="overlineSm" className="min-w-0 flex-1" numberOfLines={1}>
          {label}
        </Text>
        {value != null ? (
          typeof value === 'string' ? (
            <Text variant="bodyStrong">{value}</Text>
          ) : (
            value
          )
        ) : null}
        {children}
      </View>
      {below}
    </View>
  )
}
