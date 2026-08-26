import type { ReactNode } from 'react'

import { titleCase } from '@/lib/portions'
import { Text, type TextVariant } from '@/ui'
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
 * HERE RATHER THAN IN THE TWO SCREENS because the × is a styled run of its own
 * and its metrics are fiddly (see below). Two copies of that would drift, which
 * is the argument the portion stepper's own comment makes about its quarters.
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
    <Text variant={variant} className={className}>
      {countLabel(quantity)}
      {/* THE × IS SMALLER THAN THE WORDS EITHER SIDE. At the full 17px, beside a
          dish name, it read as part of the name rather than as the operator
          between a number and a thing.

          The leading is set explicitly and is NOT decoration. `Text` falls back
          to the `body` variant's leading of 27 for any run that names a size and
          no leading, and 27 is taller than the 24 `bodyStrong` uses — so an
          unqualified × would grow the line box of the sheet's heading while
          leaving the card's alone. 17 is under both, which is the only property
          this needs: a nested run cannot shrink a line box, only stretch one. */}
      <Text className="font-body text-[13px] leading-[17px] text-muted">{' × '}</Text>
      {titleCase(name)}
      {children}
    </Text>
  )
}
