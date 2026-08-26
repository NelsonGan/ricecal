import type { ReactNode } from 'react'
import { PixelRatio, View } from 'react-native'

import { titleCase } from '@/lib/portions'
import { cn, Text, type TextVariant } from '@/ui'
import { countLabel } from './parts'

/**
 * A part of a scanned plate, named the way a cart names a line: how many, then
 * what.
 *
 * The count leads rather than trailing after the food, and that is what lets it
 * name the food rather than a unit. It used to read "Pineapple Juice (¾
 * serving)", where "serving" said nothing about which food a serving was of and
 * the only way to say so was to print the name twice.
 *
 * Shown at one as well — "1 × Pineapple Juice" — for the reason `detail.times`
 * gives: a count that appears only above one reads as a badge on the busy rows
 * rather than as the amount every row has.
 *
 * Rounded to a quarter, so it can disagree with an exact weight printed beside
 * it, which is what the "~" from `countLabel` says.
 *
 * HERE RATHER THAN IN THE TWO SCREENS because the × costs three elements and a
 * paragraph to place. Two copies of that would drift, which is the argument the
 * portion stepper's own comment makes about its quarters.
 */
export function PartLine({
  quantity,
  name,
  variant = 'body',
  className,
  children,
}: {
  /** The part's amount, exactly as stored. Rounded for display only. */
  quantity: number
  /** The model's name for the part. Title-cased here, as the card wants it. */
  name: string
  /** `body` on the ingredient card, `bodyStrong` for the sheet's row heading. */
  variant?: TextVariant
  className?: string
  /** Anything that trails the name in the same run, like the weight bracket. */
  children?: ReactNode
}) {
  return (
    /* THREE BOXES IN A ROW RATHER THAN ONE RUN OF TEXT, and the × is why.
       It has to be smaller than the words either side — at the full 17px, beside
       a dish name, it read as part of the name rather than as the operator
       between a number and a thing — and a smaller glyph nested inside a run
       shares that run's baseline, which leaves it sitting about two points below
       the middle of the letters around it. React Native has no baseline offset
       for a nested run to correct that with; `verticalAlign` is Android only.

       What it does have is that a Text of its own gets a line box of its own,
       and centres its glyph inside it. So the × is a sibling, on the SAME
       variant as the words — which is what makes this work, since the variant
       carries the leading and two boxes of equal height centre their glyphs onto
       the same line. Only the size and the colour are overridden.

       Equal boxes get it to within a point, and the last point is the glyph
       itself: what the boxes line up is each FONT's centre, and Nunito draws its
       × a little under that. Measured on a 3x screen, the words centred on
       device row 2004.5 and the × landed on 2007.5. So the box is nudged up by
       the difference — as a transform rather than a margin, since an optical
       correction should not move anything else on the row, and scaled by the
       reader's own text size, since what it corrects is a fraction of an em and
       grows with the type.

       `items-start` so a name that wraps to a second line leaves the count where
       it is. The name keeps the weight bracket inside its own run, so those two
       still wrap together; what wrapping loses is the count, which now hangs to
       the left of a name that runs on, the way a cart does it. */
    <View className={cn('flex-row items-start gap-1', className)}>
      <Text variant={variant}>{countLabel(quantity)}</Text>
      <Text
        variant={variant}
        className="font-body text-[13px] text-muted"
        style={{ transform: [{ translateY: -PixelRatio.getFontScale() }] }}
      >
        ×
      </Text>
      <Text variant={variant} className="min-w-0 flex-1">
        {titleCase(name)}
        {children}
      </Text>
    </View>
  )
}
