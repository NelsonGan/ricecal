import { Text as Span } from 'react-native'

import { cn, Text } from '@/ui'

export type SplitFigureProps = {
  /** The whole translated phrase: "8,426 steps", "1,500 ml", "8,426 歩". */
  text: string
  /** The formatted number inside it, which is drawn large. */
  figure: string
  /** Colour for both halves, for a figure drawn over water. */
  className?: string
}

/**
 * A phrase with its number drawn large and its words small, the way Today's
 * tiles read "8,426 steps".
 *
 * Split by finding the number in the translated string rather than by a second
 * key for the unit, so the word order stays the translator's: a language that
 * puts the unit first still gets its number large. A string that does not
 * contain the figure is drawn whole at the large size.
 *
 * The small halves are bare React Native spans: the design system's `Text`
 * sets a line height, and a nested span with its own line height pushes the
 * line taller than the big figure on iOS.
 */
export function SplitFigure({ text, figure, className }: SplitFigureProps) {
  const at = text.indexOf(figure)
  const before = at < 0 ? '' : text.slice(0, at)
  const after = at < 0 ? '' : text.slice(at + figure.length)
  const small = cn('font-body-black text-[15px] text-muted', className)

  return (
    <Text
      variant="displayMd"
      className={className}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      maxFontSizeMultiplier={1.3}
    >
      {before ? <Span className={small}>{before}</Span> : null}
      {at < 0 ? text : figure}
      {after ? <Span className={small}>{after}</Span> : null}
    </Text>
  )
}
