import { View } from 'react-native'

import { cn, Divider, Tappable, Text } from '@/ui'

/**
 * A small chevron drawn from two borders, pointing down (or up when open).
 *
 * Drawn rather than taken from the icon set or a font: the set's chevron is an
 * illustration that turns into a blob at pill size, and "▾" falls back to a
 * different glyph per platform.
 */
function Caret({ open, small }: { open?: boolean; small?: boolean }) {
  const size = small ? 6 : 7
  return (
    <View
      className="border-pandan-ink border-r-2 border-b-2"
      style={{
        width: size,
        height: size,
        marginTop: open ? size / 2 : -size / 2,
        transform: [{ rotate: open ? '-135deg' : '45deg' }],
      }}
    />
  )
}

/**
 * The unit an amount is in, worn beside it, and the way to change it.
 *
 * One pattern on every surface that measures: the food page's stepper, the
 * ingredient sheet's amount and each ingredient row. Pressing it opens the
 * choices; `value` is what a screen reader hears as the current unit.
 */
export function UnitPill({
  label,
  open,
  onPress,
  accessibilityLabel,
  size = 'md',
  className,
}: {
  label: string
  open?: boolean
  onPress: () => void
  accessibilityLabel: string
  size?: 'md' | 'sm'
  className?: string
}) {
  const small = size === 'sm'
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: label }}
      accessibilityState={{ expanded: Boolean(open) }}
      // The pill is drawn small; the finger gets the 44pt the platform asks for.
      hitSlop={small ? { top: 10, bottom: 10, left: 6, right: 6 } : 6}
      className={cn(
        'flex-row items-center justify-center rounded-full bg-pandan-soft',
        small ? 'min-h-[30px] gap-1.5 px-2.5' : 'min-h-[40px] gap-2 px-4',
        className,
      )}
    >
      <Text
        numberOfLines={1}
        className={cn(
          'shrink font-display text-pandan-ink',
          // Room below the baseline: Baloo's descenders are deep, and at the
          // tight leading the rest of the app uses for numbers the tail of a
          // "g" was clipped and the pill read "9".
          small ? 'text-[15px] leading-[24px]' : 'text-[17px] leading-[26px]',
        )}
      >
        {label}
      </Text>
      <Caret open={open} small={small} />
    </Tappable>
  )
}

export type MeasureChoice = {
  key: string
  /** The amount as it would read in this choice: "350 g", "1½ cups", "Large". */
  title: string
  /** What it costs, so a choice that rounds says so before it is made. */
  detail?: string
  selected: boolean
  /**
   * A choice that cannot hold the amount, or would move it by more than a
   * measuring cup does. Left off the list rather than greyed out: a grey "20
   * tsp · 72 kcal" for a 350 ml drink is a figure that is not true, offered
   * and then refused.
   */
  disabled?: boolean
  onPress: () => void
}

/**
 * Every way to state an amount, each line saying what the amount would read as
 * and what it would cost. A list rather than chips or segments: seven imperial
 * units did not fit one segmented row, Japanese unit names truncated in it, and
 * a portion chip beside a unit row was two answers to one question.
 */
/**
 * The choices a list actually shows: every one that is not disabled, and the
 * one in use always, so the list never loses its tick. A unit pill is a control
 * only when this holds more than one; a pill that opened a list of itself was
 * the first thing a 10.5 g of sugar showed once disabled lines went.
 */
export const offeredChoices = <T extends Pick<MeasureChoice, 'selected' | 'disabled'>>(
  choices: readonly T[],
): T[] => choices.filter((choice) => choice.selected || !choice.disabled)

export function MeasureList({ choices }: { choices: readonly MeasureChoice[] }) {
  const shown = offeredChoices(choices)
  return (
    <View accessibilityRole="radiogroup">
      {shown.map((choice, index) => (
        <View key={choice.key}>
          {index > 0 ? <Divider /> : null}
          <Tappable
            onPress={choice.onPress}
            disabled={choice.disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: choice.selected, disabled: Boolean(choice.disabled) }}
            accessibilityLabel={choice.detail ? `${choice.title}, ${choice.detail}` : choice.title}
            className={cn(
              'min-h-[52px] flex-row items-center gap-3',
              choice.disabled && 'opacity-40',
            )}
          >
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              className={cn('min-w-0 flex-1', choice.selected && 'text-pandan-ink')}
            >
              {choice.title}
            </Text>
            {choice.detail ? <Text variant="meta">{choice.detail}</Text> : null}
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              className="w-5 items-center"
            >
              {choice.selected ? (
                <View
                  className="border-pandan-ink border-r-[3px] border-b-[3px]"
                  style={{ width: 7, height: 13, marginTop: -3, transform: [{ rotate: '45deg' }] }}
                />
              ) : null}
            </View>
          </Tappable>
        </View>
      ))}
    </View>
  )
}
