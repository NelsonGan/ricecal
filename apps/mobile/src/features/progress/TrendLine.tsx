import { Canvas, Circle, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia'
import * as Haptics from 'expo-haptics'
import { useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

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
  /**
   * How a value reads, which turns on the chart's scale and its readout: three
   * light rules with their values, and a tap or a sideways drag that names the
   * point under the finger. Left out on a chart that is a picture rather than
   * something to read off, such as the shareable review card.
   */
  formatValue?: (value: number) => string
  accessibilityLabel?: string
  className?: string
}

/** How wide a date label is given, and so how many fit along the axis. */
const LABEL_W = 56

/** Stroke width, and the radius the end cap needs to clear the edges. */
const STROKE = 3
const DOT = 3.5
const LAST_DOT = 5
/** The readout's width. */
const TIP_W = 92
/** The gutter the scale's values sit in. */
const SCALE_W = 56

/**
 * Two or three round values between `low` and `high`: steps of 1, 2, 2.5 or 5
 * times a power of ten, the way a hand-drawn axis is labelled.
 */
function roundTicks(low: number, high: number): number[] {
  const rough = (high - low) / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].find((nice) => nice * power >= rough) ?? 10) * power
  const ticks: number[] = []
  for (let tick = Math.ceil(low / step) * step; tick <= high + 1e-9; tick += step) {
    ticks.push(Math.round(tick * 1000) / 1000)
  }
  return ticks
}

/**
 * Weight over time, as a line rather than the bars every other chart uses.
 * Weight moves by about one percent a week, so bars from zero are seven
 * identical rectangles, and the eye reads bars as amounts and a line as a
 * direction, which is the entire question.
 *
 * A day with no weigh-in holds the last reading rather than being interpolated
 * across. A straight line between Monday and Friday claims to know Wednesday;
 * carrying Monday forward claims only that nothing was recorded.
 *
 * The dots stay on the real readings, which is what tells the held stretches
 * apart from the measured ones.
 *
 * Skia, because the alternative is a hundred absolutely-positioned Views. No
 * animation: a line that draws itself in on every tab switch cannot be compared
 * against the one before it.
 */
export function TrendLine({
  points,
  carryFrom,
  height = 128,
  formatValue,
  accessibilityLabel,
  className,
}: TrendLineProps) {
  // Measured rather than assumed: the card's padding is a token and this sits
  // inside a `Screen` gutter, so the only honest width is the one laid out.
  const [width, setWidth] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const colors = useThemeColors()
  // With a scale, its values get a gutter of their own on the right, so they
  // never sit on the newest point, which is always at the right edge.
  const plotWidth = formatValue ? Math.max(0, width - SCALE_W) : width

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
      x: (plotWidth * (index + 0.5)) / points.length,
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

  // Rules at round values inside the range, two or three of them: "80 kg" and
  // "85 kg" read at a glance where the midpoint of 76 and 88.7 does not.
  const rules =
    width > 0 && values.length > 1 && high > low
      ? roundTicks(low, high).flatMap((value) => {
          const y = top + (1 - (value - floor) / span) * usable
          const path = Skia.Path.MakeFromSVGString(`M 0 ${y} L ${plotWidth} ${y}`)
          return path ? [{ value, y, path }] : []
        })
      : []

  // Every other label when they do not all fit, always keeping the newest.
  const labelled = points.flatMap((point, index) => (point.label ? [index] : []))
  const room = Math.max(2, Math.floor(width / LABEL_W))
  const every = Math.ceil(labelled.length / room)
  const shownLabels = labelled.filter((_, at) => {
    const last = at === labelled.length - 1
    if (last) return true
    // Dropped when it would sit on top of the newest one.
    return at % every === 0 && labelled.length - 1 - at >= every
  })

  // The reading under the finger: the nearest real one, never a held stretch.
  const picked =
    selected === null
      ? null
      : measured.reduce<(typeof measured)[number] | null>(
          (best, entry) =>
            !best || Math.abs(entry.x - selected) < Math.abs(best.x - selected) ? entry : best,
          null,
        )
  const guide =
    picked && formatValue
      ? Skia.Path.MakeFromSVGString(`M ${picked.x} ${top} L ${picked.x} ${height}`)
      : null

  const pick = (x: number | null) => {
    setSelected((current) => {
      if (x !== null && current === null) void Haptics.selectionAsync().catch(() => {})
      return x
    })
  }
  // A sideways drag scrubs and a tap picks; both leave a vertical drag to the
  // scroll view the chart sits in. Off without `formatValue`, which has nothing
  // to say about a point.
  const scrub = Gesture.Pan()
    .enabled(Boolean(formatValue))
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((event) => runOnJS(pick)(event.x))
    .onUpdate((event) => runOnJS(pick)(event.x))
  const tap = Gesture.Tap()
    .enabled(Boolean(formatValue))
    .onEnd((event) => runOnJS(pick)(event.x))
  const gesture = Gesture.Race(scrub, tap)

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
      <GestureDetector gesture={gesture}>
        <View collapsable={false}>
          <Canvas style={{ width: '100%', height }}>
            {width === 0 ? null : (
              <>
                {formatValue
                  ? rules.map((rule) => (
                      <Path
                        key={rule.y}
                        path={rule.path}
                        style="stroke"
                        strokeWidth={1}
                        color={colors.line}
                      />
                    ))
                  : null}
                {area ? (
                  // Fading to nothing at the foot, so the fill says "under the line"
                  // without a hard edge competing with the line itself.
                  <Path path={area} style="fill">
                    <LinearGradient
                      start={vec(0, top)}
                      end={vec(0, height)}
                      colors={[`${colors.pandan}55`, `${colors.pandan}00`]}
                    />
                  </Path>
                ) : null}
                {guide ? (
                  <Path path={guide} style="stroke" strokeWidth={1.5} color={colors.muted} />
                ) : null}
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
                {picked ? (
                  <>
                    <Circle cx={picked.x} cy={picked.y} r={LAST_DOT + 3} color={colors.surface} />
                    <Circle cx={picked.x} cy={picked.y} r={LAST_DOT} color={colors.pandanSlab} />
                  </>
                ) : null}
              </>
            )}
          </Canvas>
          {formatValue && width > 0
            ? rules.map((rule) => (
                <Text
                  key={rule.y}
                  variant="micro"
                  className="absolute right-0"
                  numberOfLines={1}
                  style={{ top: rule.y - 7, width: SCALE_W - 6, textAlign: 'right' }}
                >
                  {formatValue(rule.value)}
                </Text>
              ))
            : null}
          {picked && formatValue ? (
            // The point under the finger, named over it and kept inside the card.
            <View
              pointerEvents="none"
              className="absolute top-0 items-center rounded-sm bg-heading px-2 py-1"
              style={{
                left: Math.max(0, Math.min(width - TIP_W, picked.x - TIP_W / 2)),
                width: TIP_W,
              }}
            >
              <Text variant="micro" className="text-canvas" numberOfLines={1}>
                {picked.point.label}
              </Text>
              <Text variant="label" className="text-canvas" numberOfLines={1}>
                {formatValue(picked.value)}
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Labels sit on their own points' columns, which is what the x positions
          above are derived from, and only as many as fit: twenty dates side by
          side were twenty clipped stubs. */}
      <View className="h-[14px]">
        {width > 0
          ? shownLabels.map((index) => {
              const x = (plotWidth * (index + 0.5)) / points.length
              return (
                <Text
                  key={points[index].key}
                  numberOfLines={1}
                  variant="micro"
                  className="absolute text-center"
                  style={{
                    width: LABEL_W,
                    left: Math.max(0, Math.min(plotWidth - LABEL_W, x - LABEL_W / 2)),
                  }}
                >
                  {points[index].label}
                </Text>
              )
            })
          : null}
      </View>
    </View>
  )
}
