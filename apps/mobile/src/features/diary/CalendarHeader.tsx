import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { Icon, IconButton, Tappable, Text } from '@/ui'

export type CalendarHeaderProps = {
  /**
   * The level above this one — "August 2026", "2026" — shown behind a back chevron
   * on the left. Omitted at the top level, where there is nowhere further out.
   */
  parent?: string
  onZoomOut?: () => void
  /** What is on screen: the date, the month, the year. */
  title: string
  /** Step this level back and forward: the previous month, the next year. */
  onPrevious?: () => void
  onNext?: () => void
  previousLabel?: string
  nextLabel?: string
}

/**
 * The diary's one header, across all three zoom levels.
 *
 * A chevron and the name of the level above, top left, is the whole way out — the
 * same affordance Apple's calendar uses, and it works because the label says where
 * the tap goes rather than asking the user to remember. It keeps that corner so the
 * left edge is the same shape at every level and the eye does not have to find the
 * button again after a zoom.
 *
 * Which leaves the title on the right, quietly, where it reads as a label for what
 * is below rather than as the name of a screen. At the outermost level there is no
 * way out, so the title takes the corner and the weight that goes with it.
 *
 * Three details make the chevron sit with its label rather than beside it:
 *
 * - It is TINTED. The `ui` set is flat colour illustrations, not a glyph font, so an
 *   untinted chevron is a blue mark next to a dark title — the one colour in that
 *   corner that means nothing. Every other chevron in the app is tinted for the same
 *   reason; this one was not.
 * - It hangs half in the gutter. The label is what the eye lines up against the
 *   content below, and a chevron indented to the same 20 points pushes the label
 *   26 further in.
 * - It is nudged up a point. Flexbox centres its box against the title's LINE box,
 *   which sits lower than the letters do; a point of lift puts the mark against the
 *   cap height, where it looks level.
 */
export function CalendarHeader({
  parent,
  onZoomOut,
  title,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
}: CalendarHeaderProps) {
  const colors = useThemeColors()
  const canZoomOut = Boolean(parent && onZoomOut)

  return (
    <View className="flex-row items-center gap-2 px-gutter pb-md">
      {canZoomOut ? (
        <Tappable
          className="-ml-2.5 min-w-0 shrink flex-row items-center"
          onPress={onZoomOut}
          accessibilityRole="button"
          accessibilityLabel={parent}
        >
          <Icon
            set="ui"
            name="chevron-left"
            size={26}
            tintColor={colors.heading}
            style={{ marginTop: -1 }}
          />
          <Text variant="screenTitle" numberOfLines={1} className="min-w-0 shrink">
            {parent}
          </Text>
        </Tappable>
      ) : null}

      <Text
        variant={canZoomOut ? 'caption' : 'screenTitle'}
        className={canZoomOut ? 'flex-1 text-right' : 'min-w-0 flex-1'}
        numberOfLines={1}
      >
        {title}
      </Text>

      {onPrevious && onNext ? (
        <View className="flex-row items-center gap-1.5">
          <IconButton size="sm" accessibilityLabel={previousLabel ?? ''} onPress={onPrevious}>
            <Icon set="ui" name="chevron-left" size={18} tintColor={colors.muted} />
          </IconButton>
          <IconButton size="sm" accessibilityLabel={nextLabel ?? ''} onPress={onNext}>
            <Icon set="ui" name="chevron-right" size={18} tintColor={colors.muted} />
          </IconButton>
        </View>
      ) : null}
    </View>
  )
}
