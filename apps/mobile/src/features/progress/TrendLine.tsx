import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia'
import { useState } from 'react'
import { View } from 'react-native'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Text } from '@/ui'

export type TrendPoint = {
  key: string
  label: string
  /** Null where the range has a column but nobody weighed in. Held, not spanned. */
  value: number | null
}

export type TrendLineProps = {
  points: readonly TrendPoint[]
  /**
   * The last reading from BEFORE the range, which the line starts from.
   *
   * Without it a week that opens on an unweighed day begins partway across, and
   * the empty stretch reads as broken rather than as a week that started where
   * the previous one left off. Null only when there is genuinely no earlier
   * weigh-in — see the fallback below for what happens then.
   */
  carryFrom?: number | null
  height?: number
  accessibilityLabel?: string
  className?: string
}

/** Stroke width, and the radius the end cap needs to clear the edges. */
const STROKE = 3
const DOT = 3.5
const LAST_DOT = 5

/**
 * Weight over time, as a line.
 *
 * A line rather than the bars every other chart here uses, and the reason is in
 * the data: weight moves by about one percent a week, so bars drawn from zero
 * are seven identical rectangles. `BarChart`'s `scale="range"` fixes the height
 * problem but not the reading problem — the eye reads a row of bars as a set of
 * amounts and a line as a direction, and direction is the entire question.
 *
 * A day with no weigh-in HOLDS the last reading rather than being interpolated
 * across. Nobody weighs themselves daily, so most columns are empty, and the two
 * ways of filling them say different things: a straight line between Monday and
 * Friday claims to know Wednesday, which it does not. Carrying Monday forward
 * claims only that nothing was recorded in between, which is exactly what
 * happened — the line goes flat and then steps when the scale is next used.
 *
 * The dots stay on the real readings. They are what tells the held stretches
 * apart from the measured ones, and without them a step chart looks like a
 * measurement that stopped moving.
 *
 * Skia because the alternative is a hundred absolutely-positioned Views; the
 * canvas is one node and the path is rebuilt only when the width or the data
 * changes. No animation, deliberately — a line that draws itself in on every tab
 * switch is a line nobody can compare against the one before it.
 */
export function TrendLine({
  points,
  carryFrom,
  height = 128,
  accessibilityLabel,
  className,
}: TrendLineProps) {
  // Measured rather than assumed: the card's padding is a token and this sits
  // inside a `Screen` gutter, so the only honest width is the one laid out.
  const [width, setWidth] = useState(0)
  const colors = useThemeColors()

  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value !== null)
  // `Math.min()` of nothing is Infinity, which poisons every number below it.
  // The caller shows an empty state instead of an empty chart, so this only
  // guards the component against being used somewhere that does not.
  const low = values.length ? Math.min(...values) : 0
  const high = values.length ? Math.max(...values) : 0
  // A tenth of the spread as headroom top and bottom, and a floor of half a
  // kilogram so a flat week is a flat line through the middle rather than a
  // line hard against one edge amplifying rounding noise.
  const pad = Math.max((high - low) * 0.15, 0.5)
  const floor = low - pad
  const span = high + pad - floor

  const top = STROKE + LAST_DOT
  const usable = height - top * 2

  // Carried forward, so an unweighed day sits level with the last reading
  // instead of on a line drawn through it.
  //
  // The seed is what makes the line start at the left edge rather than at the
  // first reading inside the range. It is the newest weigh-in from BEFORE the
  // window when there is one; failing that — a brand new account whose first
  // ever reading is mid-week — the first reading in the range is carried
  // BACKWARDS instead. Both are the same assumption the forward fill makes,
  // pointed the other way, and either beats a chart that starts halfway across
  // and looks like it failed to load.
  let carried: number | null = carryFrom ?? values[0] ?? null
  const held = points.map((point) => {
    if (point.value !== null) carried = point.value
    return { point, value: carried, measured: point.value !== null }
  })

  const plotted = held
    .map((entry, index) => ({
      ...entry,
      // The CENTRE of this point's column, which is where its label sits: the
      // axis below is a flex row of equal columns, so anything else puts the
      // first and last dots off their own labels — by about a third of a column
      // on a seven-day chart, which is exactly the reading the chart is for.
      //
      // Every column gets a slot whether or not it has a reading. The x axis is
      // the range, not the readings, so two weigh-ins a fortnight apart must not
      // end up side by side.
      x: (width * (index + 0.5)) / points.length,
      y: entry.value === null ? null : top + (1 - (entry.value - floor) / span) * usable,
    }))
    .filter(
      (
        entry,
      ): entry is { point: TrendPoint; value: number; measured: boolean; x: number; y: number } =>
        entry.y !== null,
    )

  // Only the days somebody actually stood on the scale. The held stretches carry
  // the line; they are not readings and must not be drawn as if they were.
  const measured = plotted.filter((entry) => entry.measured)

  const line =
    width > 0 && plotted.length > 1
      ? Skia.Path.MakeFromSVGString(
          plotted
            .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${entry.x} ${entry.y}`)
            .join(' '),
        )
      : null

  const area =
    width > 0 && plotted.length > 1
      ? Skia.Path.MakeFromSVGString(
          `${plotted
            .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${entry.x} ${entry.y}`)
            .join(' ')} L ${plotted[plotted.length - 1].x} ${height} L ${plotted[0].x} ${height} Z`,
        )
      : null

  return (
    <View
      className={cn('gap-2', className)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {/* Nothing is drawn until the layout pass has been through. Before it,
          `width` is 0 and every x collapses to the left edge — one frame of the
          whole series stacked in a column, which reads as a glitch rather than
          as loading. */}
      <Canvas style={{ width: '100%', height }}>
        {width === 0 ? null : (
          <>
            {area ? <Path path={area} style="fill" color={colors.pandanSoft} /> : null}
            {line ? (
              <Path
                path={line}
                style="stroke"
                strokeWidth={STROKE}
                strokeCap="round"
                strokeJoin="round"
                color={colors.pandan}
              />
            ) : null}
            {measured.map((entry, index) => (
              <Circle
                key={entry.point.key}
                cx={entry.x}
                cy={entry.y}
                // The newest reading is the one the card's headline quotes, so
                // it is the one the eye should find without counting from
                // either end.
                r={index === measured.length - 1 ? LAST_DOT : DOT}
                color={index === measured.length - 1 ? colors.pandanSlab : colors.pandan}
              />
            ))}
          </>
        )}
      </Canvas>

      {/* One equal column per point, which is what the x positions above are
          derived from — change one and the other stops lining up. */}
      <View className="flex-row">
        {points.map((point) => (
          <View key={point.key} className="min-w-0 flex-1 items-center">
            <Text numberOfLines={1} variant="micro" className="h-[14px]">
              {point.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
