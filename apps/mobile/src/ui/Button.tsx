import type { ReactNode } from 'react'
import { ActivityIndicator, View } from 'react-native'
import type { ColorRole } from '@/theme/tokens'
import { radius, slab } from '@/theme/tokens'
import { useThemeColors } from '@/theme/useTheme'
import { cn } from './cn'
import { Squish, type SquishProps } from './Squish'
import { Text } from './Text'

/**
 * Seven tones, one rule: never two primaries on a screen. `secondary` and
 * `neutral` are both outlined, and differ only in whether they carry the
 * primary colour — `secondary` is the paired choice next to a primary,
 * `neutral` is the neutral one ("Keep", "Not now").
 *
 * `kaya`, `danger` and `water` exist for onboarding, which rotates its accent
 * per step. Outside that flow the CTA is `primary`.
 */
const tones = {
  primary: {
    slab: 'bg-pandan-slab',
    surface: 'bg-pandan',
    label: 'text-on-pandan',
    spinner: 'onPandan',
  },
  secondary: {
    slab: 'bg-pandan-soft-line',
    surface: 'bg-surface border-[3px] border-pandan-soft-line',
    label: 'text-pandan-ink',
    spinner: 'pandanInk',
  },
  danger: {
    slab: 'bg-hibiscus-slab',
    surface: 'bg-hibiscus',
    label: 'text-on-hibiscus',
    spinner: 'onHibiscus',
  },
  kaya: {
    slab: 'bg-kaya-slab',
    surface: 'bg-kaya',
    label: 'text-on-kaya',
    spinner: 'onKaya',
  },
  water: {
    slab: 'bg-water-slab',
    surface: 'bg-water',
    label: 'text-on-water',
    spinner: 'onWater',
  },
  neutral: {
    slab: 'bg-line',
    surface: 'bg-surface border-[3px] border-line',
    label: 'text-muted',
    spinner: 'muted',
  },
  ghost: {
    slab: '',
    surface: 'bg-transparent',
    label: 'text-muted',
    spinner: 'muted',
  },
} satisfies Record<string, { slab: string; surface: string; label: string; spinner: ColorRole }>

const sizes = {
  sm: { box: 'min-h-sm px-5', radius: radius.sm, depth: slab.sm, text: 'text-[15px]' },
  md: { box: 'min-h-md px-8', radius: radius.md, depth: slab.lg, text: 'text-[19px]' },
  lg: { box: 'min-h-lg px-8', radius: radius.sheet, depth: slab.hero, text: 'text-[21px]' },
} as const

export type ButtonVariant = keyof typeof tones
export type ButtonSize = keyof typeof sizes

export type ButtonProps = Omit<
  SquishProps,
  'children' | 'className' | 'slabClassName' | 'depth' | 'radius'
> & {
  children: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to the container. The hero CTA at the bottom of a screen. */
  fullWidth?: boolean
  /** Shows a spinner and blocks presses. Wire this to a mutation's isPending. */
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /** Layout: `flex-1`, `self-start`, margins. Lands on the box the parent measures. */
  className?: string
  /** Appearance of the pressable surface itself. Rarely needed — use `variant`. */
  contentClassName?: string
  labelClassName?: string
}

/**
 * The squishy button.
 *
 * `loading` is the prop that matters for data work: it blocks the press and
 * swaps the label for a spinner without changing the button's width, so a
 * Supabase mutation cannot be fired twice and the layout does not jump while
 * it runs.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  className,
  contentClassName,
  labelClassName,
  onPress,
  ...rest
}: ButtonProps) {
  const colors = useThemeColors()
  const tone = tones[variant]
  const metrics = sizes[size]
  const inert = Boolean(disabled) || loading

  // A disabled button is its own tone, not a faded copy of another one: the
  // design gives it a flat grey fill and a shallower slab.
  const surface = inert ? 'bg-disabled' : tone.surface
  const slabColor = inert ? 'bg-disabled-slab' : tone.slab
  const label = inert ? 'text-on-disabled' : tone.label
  const depth = variant === 'ghost' ? 0 : inert ? slab.sm : metrics.depth

  return (
    <Squish
      depth={depth}
      radius={metrics.radius}
      containerClassName={cn('self-start', fullWidth && 'w-full self-stretch', className)}
      slabClassName={slabColor}
      className={cn(
        'flex-row items-center justify-center gap-2',
        metrics.box,
        surface,
        contentClassName,
      )}
      disabled={inert}
      onPress={loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      {...rest}
    >
      {/* Laid out but invisible while loading, so the spinner does not resize
          the button and shift everything beside it. */}
      <View className={cn('flex-row items-center gap-2', loading && 'opacity-0')}>
        {leftIcon}
        <Text variant="button" className={cn(metrics.text, label, labelClassName)}>
          {children}
        </Text>
        {rightIcon}
      </View>

      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={colors[tone.spinner]} />
        </View>
      ) : null}
    </Squish>
  )
}
