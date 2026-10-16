import { Children, isValidElement, type ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

import { cn } from './cn'

export type DividerProps = ViewProps & {
  /** Dashed, for the boundary above a "+ Add" affordance. */
  dashed?: boolean
  className?: string
}

/**
 * A 2px rule in the track colour.
 *
 * 2px rather than a hairline: at 1px the line disappears against `track` on a
 * 3x display, and the system has no hairlines anywhere else.
 */
export function Divider({ dashed = false, className, ...rest }: DividerProps) {
  return (
    <View
      accessibilityRole="none"
      className={cn(
        dashed ? 'border-t-2 border-dashed border-line' : 'h-[2px] bg-track',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * Keyed rows with a `Divider` between each, as a list inside a card draws
 * them. A null child is left out rather than ruled off.
 */
export function Divided({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child, index) => (
          <View key={child.key}>
            {index > 0 ? <Divider /> : null}
            {child}
          </View>
        ))}
    </>
  )
}
