import { Image, type ImageProps } from 'expo-image'
import { cn } from './cn'
import { type IconSet, icons } from './icons.generated'

export type { IconSet }
export { icons }

/**
 * `{ set: 'ui', name: … }` narrows `name` to that set's icons, so a typo is a
 * type error rather than a blank square at runtime. Written as a mapped union
 * because a plain `set: IconSet; name: string` would accept any combination.
 */
export type IconProps = {
  [S in IconSet]: { set: S; name: keyof (typeof icons)[S] }
}[IconSet] & {
  /** Rendered edge length in points. Design usages run 26–56, art up to 96. */
  size?: number
  /** Flattens the illustration to one colour. Only for monochrome chrome. */
  tintColor?: string
  className?: string
  style?: ImageProps['style']
  accessibilityLabel?: string
}

/**
 * A design-system icon.
 *
 * These are flat colour illustrations, not glyph fonts, so they carry their own
 * palette and are not tinted by default. `tintColor` exists for the handful of
 * places that need a monochrome treatment, such as an inactive tab.
 *
 * Decorative by default: without an `accessibilityLabel` the icon is hidden
 * from screen readers, which is right almost always — the icon sits beside a
 * label that already says the same thing.
 */
export function Icon({
  set,
  name,
  size = 24,
  tintColor,
  className,
  style,
  accessibilityLabel,
}: IconProps) {
  const source = (icons[set] as Record<string, number>)[name as string]

  return (
    <Image
      source={source}
      contentFit="contain"
      tintColor={tintColor}
      className={cn('shrink-0', className)}
      style={[{ width: size, height: size }, style]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      // These ship in the bundle; there is nothing to fade in from.
      transition={0}
    />
  )
}
