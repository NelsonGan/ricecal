import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  LinearGradient,
  Path,
  Skia,
  type SkPath,
  vec,
} from '@shopify/react-native-skia'
import * as Haptics from 'expo-haptics'
import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'

import { type AxisLabel, AxisLabels } from '@/features/shared/AxisLabels'
import { type ThemeColors, useThemeColors } from '@/theme/useTheme'
import { cn, Text } from '@/ui'

export type TrendPoint = {
  key: string
  /** The axis label under the point. May be blank where the axis has no room. */
  label: string
  /** What the readout calls the point, when the axis label is short or blank. */
  title?: string
  /** Null where the range has a column with nothing in it. See `gaps` for how it draws. */
  value: number | null
}

/** The palette colours a line can be drawn in, each with the darker one its newest dot takes. */
export type TrendTone = 'pandan' | 'water' | 'hibiscus' | 'kaya'

const TONES = {
  pandan: ['pandan', 'pandanSlab'],
  water: ['water', 'waterSlab'],
  hibiscus: ['hibiscus', 'hibiscusSlab'],
  kaya: ['kaya', 'kayaSlab'],
} as const satisfies Record<TrendTone, readonly [keyof ThemeColors, keyof ThemeColors]>

export type TrendLineProps = {
  points: readonly TrendPoint[]
  /**
   * What a column without a value means. `hold` (weight) carries the last
   * reading across it, since the scale was simply not stood on. `join`
   * (calories) draws straight on to the next real value: a day nobody logged
   * food is not a day of no food, and carried forward it would claim to be
   * the day before.
   */
  gaps?: 'hold' | 'join'
  /** A target, drawn as a dashed rule and always kept inside the scale. */
  goal?: number | null
  /** The line's colour, its fill's and its dots'. */
  tone?: TrendTone
  /** A reading's own dot colour, where the dot says something: a day over the budget. */
  dotTone?: (value: number, point: TrendPoint) => TrendTone
  /**
   * Start the scale at zero. For amounts, where the distance from nothing is
   * the point (minutes trained, water); weight and calories zoom to their
   * spread instead, since nobody weighs zero.
   */
  fromZero?: boolean
  /** The least headroom above and below, in the chart's units: half a kilogram for weight. */
  minPad?: number
  /** Rule the scale in whole steps of at least one, for a count. */
  wholeTicks?: boolean
  /**
   * The point drawn as the solid dot. The newest reading by default; a review
   * names its own period, which is not the newest one drawn when it had
   * nothing logged.
   */
  emphasis?: string
  /**
   * Whether a tap or a drag reads a point. Off on a review card, where a tap
   * shares the card and the scale and goal labels are all the reading needed.
   */
  interactive?: boolean
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
   * How a value reads, which turns on the chart's scale and its readout: a few
   * light rules at round values, and a tap or a sideways drag that names the
   * point under the finger (tap it again to put it away). Left out on a chart
   * that is a picture rather than something to read off, such as the
   * shareable review card.
   */
  formatValue?: (value: number) => string
  /**
   * How the scale's values read, when the readout's would not fit its gutter:
   * "2,000" beside a calorie line rather than "2,000 kcal". Defaults to
   * `formatValue`.
   */
  formatTick?: (value: number) => string
  /**
   * What the values are multiplied by to read them, so the rules land on
   * round figures in that unit: 2.20462 for a chart drawn in kilograms and
   * read in pounds, where rules at 80 and 85 kg read "176.4 lb" and "187.4 lb".
   */
  unitFactor?: number
  accessibilityLabel?: string
  className?: string
}

/** Stroke width, and the radius the end cap needs to clear the edges. */
const STROKE = 3
const DOT = 3.5
const LAST_DOT = 5
/** The readout's narrowest width. */
const TIP_W = 92
/** The gutter the scale's values sit in. */
const SCALE_W = 56

/** The least room between two rules, so their values never sit on each other. */
const RULE_GAP = 20

/**
 * Round values between `low` and `high`, about three of them: steps of 1, 2,
 * 2.5 or 5 times a power of ten, the way a hand-drawn axis is labelled.
 */
function roundTicks(low: number, high: number, whole = false): number[] {
  const rough = (high - low) / 3
  const power = 10 ** Math.floor(Math.log10(rough))
  // A count is ruled in whole steps: "2.5 workouts" is not a number anybody
  // counts in, and rounded for its label it would read as a wrong 3.
  const nice = whole && power < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  const found = (nice.find((each) => each * power >= rough) ?? 10) * power
  const step = whole ? Math.max(1, found) : found
  // A flat series with no headroom has no spread to divide, and a step of
  // zero would never reach the top.
  if (!(step > 0)) return []
  const ticks: number[] = []
  for (let tick = Math.ceil(low / step) * step; tick <= high + 1e-9; tick += step) {
    ticks.push(Math.round(tick * 1000) / 1000)
  }
  return ticks
}

/**
 * A series over time as a line with a dot a column: every chart on Trends,
 * in a review and on the workout progress page. It began as the weight line,
 * and the reasons below are weight's, which the props generalise.
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
 * animation: a line that draws itself in on every range switch cannot be compared
 * against the one before it.
 */
export function TrendLine({
  points,
  gaps = 'hold',
  goal = null,
  tone = 'pandan',
  dotTone,
  fromZero = false,
  minPad = 0.5,
  interactive = true,
  wholeTicks = false,
  emphasis,
  carryFrom,
  height = 128,
  formatValue,
  formatTick,
  unitFactor = 1,
  accessibilityLabel,
  className,
}: TrendLineProps) {
  // Measured rather than assumed: the card's padding is a token and this sits
  // inside a `Screen` gutter, so the only honest width is the one laid out.
  const [width, setWidth] = useState(0)
  // The point being read, by key, so new data (another range, another metric)
  // does not leave a readout over whichever point now sits at the old spot.
  const [selected, setSelected] = useState<string | null>(null)
  /** The readout's own width, once drawn, so it can be kept inside the card. */
  const [tipWidth, setTipWidth] = useState(TIP_W)
  const pointsKey = points.map((point) => `${point.key}:${point.value}`).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the data changes
  useEffect(() => setSelected(null), [pointsKey])
  const colors = useThemeColors()
  const lineColor = colors[TONES[tone][0]]
  const dotColors = (value: number, point: TrendPoint, newest: boolean) => {
    const [base, slab] = TONES[dotTone ? dotTone(value, point) : tone]
    return colors[newest ? slab : base]
  }
  // With a scale, its values get a gutter of their own on the right, so they
  // never sit on the newest point, which is always at the right edge.
  const plotWidth = formatValue ? Math.max(0, width - SCALE_W) : width

  // Worked out once per data and size. Scrubbing re-renders on every step, and
  // rebuilt each time it took every path, rule and label with it.
  const labelsKey = points.map((point) => point.label ?? '').join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: the keys stand for `points`, and `formatValue` is an inline arrow whose output follows `unitFactor`
  const { top, measured, line, area, rules, goalPath, goalY, axisLabels } = useMemo(() => {
    const values = points
      .map((point) => point.value)
      .filter((value): value is number => value !== null)
    // The goal is part of the scale, so its rule is never drawn off the card
    // on a week that stayed far from it.
    const scaled = goal !== null && values.length ? [...values, goal] : values
    // `Math.min()` of nothing is Infinity, which poisons every number below it.
    // The caller shows an empty state instead of an empty chart, so this only
    // guards the component against being used somewhere that does not.
    const low = fromZero ? 0 : scaled.length ? Math.min(...scaled) : 0
    const high = scaled.length ? Math.max(...scaled) : 0
    // A tenth of the spread as headroom top and bottom, and a floor of half a
    // kilogram so a flat week is a flat line through the middle rather than a
    // line hard against one edge amplifying rounding noise.
    const pad = Math.max((high - low) * 0.15, minPad)
    const floor = fromZero ? 0 : low - pad
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
      if (gaps === 'join') return { point, value: point.value, measured: point.value !== null }
      if (point.value !== null) carried = point.value
      return { point, value: carried, measured: point.value !== null }
    })

    const plotted = held
      .map((entry, index) => ({
        ...entry,
        // The CENTRE of this point's column, which is where its label is
        // centred too: anything else puts the first and last dots off their own
        // labels, by about a third of a column on a seven-day chart.
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
              .join(
                ' ',
              )} L ${plotted[plotted.length - 1].x} ${height} L ${plotted[0].x} ${height} Z`,
          )
        : null

    // Rules at round values in the unit the chart is read in: "80 kg" and
    // "85 kg" read at a glance where the midpoint of 76 and 88.7 does not. Over
    // the drawn range, padding included, and never closer than a label is tall
    // or reading the same once formatted ("80 kg" twice on a flat week).
    const goalY = goal !== null && values.length ? top + (1 - (goal - floor) / span) * usable : null
    const rules: { value: number; y: number; path: SkPath }[] = []
    if (formatValue && width > 0 && values.length > 1) {
      for (const scaled of roundTicks(
        floor * unitFactor,
        (floor + span) * unitFactor,
        wholeTicks,
      )) {
        const value = scaled / unitFactor
        const y = top + (1 - (value - floor) / span) * usable
        const previous = rules[rules.length - 1]
        if (y < top + 4 || y > top + usable - 4) continue
        // The goal carries its own label, and a rule beside it would print
        // over that label.
        if (goalY !== null && Math.abs(goalY - y) < RULE_GAP + 6) continue
        if (
          previous &&
          (previous.y - y < RULE_GAP || formatValue(previous.value) === formatValue(value))
        ) {
          continue
        }
        const path = Skia.Path.MakeFromSVGString(`M 0 ${y} L ${plotWidth} ${y}`)
        if (path) rules.push({ value, y, path })
      }
    }

    // Each date under its own point's column, which is where its dot is drawn.
    const axisLabels: AxisLabel[] = points.flatMap((point, index) =>
      point.label
        ? [
            {
              key: point.key,
              text: point.label,
              centre: (plotWidth * (index + 0.5)) / points.length,
            },
          ]
        : [],
    )
    const goalPath =
      goalY !== null && width > 0
        ? Skia.Path.MakeFromSVGString(`M 0 ${goalY} L ${plotWidth} ${goalY}`)
        : null

    return { top, measured, line, area, rules, goalPath, goalY, axisLabels }
  }, [
    pointsKey,
    labelsKey,
    carryFrom,
    width,
    plotWidth,
    height,
    unitFactor,
    gaps,
    goal,
    fromZero,
    minPad,
    wholeTicks,
  ])

  // The reading being read: always a real one, never a held stretch.
  const picked = measured.find((entry) => entry.point.key === selected) ?? null
  const guide = picked
    ? Skia.Path.MakeFromSVGString(`M ${picked.x} ${top} L ${picked.x} ${height}`)
    : null

  // The reading nearest a finger at `x`.
  const nearest = (x: number) =>
    measured.reduce<(typeof measured)[number] | null>(
      (best, entry) => (!best || Math.abs(entry.x - x) < Math.abs(best.x - x) ? entry : best),
      null,
    )
  const scrubTo = (x: number) => {
    const key = nearest(x)?.point.key ?? null
    if (key !== null && key !== selected) void Haptics.selectionAsync().catch(() => {})
    setSelected(key)
  }
  // A tap on the point being read puts the readout away.
  const tapAt = (x: number) => {
    const key = nearest(x)?.point.key ?? null
    if (key === selected) {
      setSelected(null)
      return
    }
    if (key !== null) void Haptics.selectionAsync().catch(() => {})
    setSelected(key)
  }
  // A sideways drag scrubs and a tap picks; both leave a vertical drag to the
  // scroll view the chart sits in. Off without `formatValue`, which has nothing
  // to say about a point.
  const scrub = Gesture.Pan()
    .enabled(Boolean(formatValue) && interactive)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((event) => runOnJS(scrubTo)(event.x))
    .onUpdate((event) => runOnJS(scrubTo)(event.x))
  const tap = Gesture.Tap()
    .enabled(Boolean(formatValue) && interactive)
    .onEnd((event) => runOnJS(tapAt)(event.x))
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
                {rules.map((rule) => (
                  <Path
                    key={rule.y}
                    path={rule.path}
                    style="stroke"
                    strokeWidth={1}
                    color={colors.line}
                  />
                ))}
                {goalPath ? (
                  <Path path={goalPath} style="stroke" strokeWidth={1.5} color={colors.faint}>
                    <DashPathEffect intervals={[5, 5]} />
                  </Path>
                ) : null}
                {area ? (
                  // Fading to nothing at the foot, so the fill says "under the line"
                  // without a hard edge competing with the line itself.
                  <Path path={area} style="fill">
                    <LinearGradient
                      start={vec(0, top)}
                      end={vec(0, height)}
                      colors={[`${lineColor}55`, `${lineColor}00`]}
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
                    color={lineColor}
                  />
                ) : null}
                {measured.map((entry, index) =>
                  // The newest reading is the one the card's headline quotes, so
                  // it is solid and larger: the one the eye should find without
                  // counting from either end. The rest are rings, light enough
                  // that the line reads first.
                  (
                    emphasis === undefined
                      ? index === measured.length - 1
                      : entry.point.key === emphasis
                  ) ? (
                    <Circle
                      key={entry.point.key}
                      cx={entry.x}
                      cy={entry.y}
                      r={LAST_DOT}
                      color={dotColors(entry.value, entry.point, true)}
                    />
                  ) : (
                    <Group key={entry.point.key}>
                      <Circle
                        cx={entry.x}
                        cy={entry.y}
                        r={DOT + 0.5}
                        color={dotColors(entry.value, entry.point, false)}
                      />
                      <Circle cx={entry.x} cy={entry.y} r={DOT - 1.5} color={colors.surface} />
                    </Group>
                  ),
                )}
                {picked ? (
                  <>
                    <Circle cx={picked.x} cy={picked.y} r={LAST_DOT + 3} color={colors.surface} />
                    <Circle
                      cx={picked.x}
                      cy={picked.y}
                      r={LAST_DOT}
                      color={dotColors(picked.value, picked.point, true)}
                    />
                  </>
                ) : null}
              </>
            )}
          </Canvas>
          {formatValue
            ? rules.map((rule) => (
                <Text
                  key={rule.y}
                  variant="micro"
                  className="absolute right-0"
                  numberOfLines={1}
                  style={{ top: rule.y - 7, width: SCALE_W - 6, textAlign: 'right' }}
                >
                  {(formatTick ?? formatValue)(rule.value)}
                </Text>
              ))
            : null}
          {formatValue && goal !== null && goalY !== null && width > 0 ? (
            // The goal's own figure at the end of its dashed rule, so the line
            // reads as "against 1,820" without a word of legend.
            <Text
              variant="micro"
              className="absolute right-0 text-muted"
              numberOfLines={1}
              style={{ top: goalY - 7, width: SCALE_W - 6, textAlign: 'right' }}
            >
              {(formatTick ?? formatValue)(goal)}
            </Text>
          ) : null}
          {picked && formatValue ? (
            // The point under the finger, named over it and kept inside the card.
            // In the inverse colours every tooltip in the app uses, and as wide
            // as its words: a fixed width cut "1 h 25 min a day" and a long
            // month name short.
            <View
              pointerEvents="none"
              onLayout={(event) => setTipWidth(event.nativeEvent.layout.width)}
              className="absolute top-0 items-center rounded-sm bg-inverse px-2 py-1"
              style={{
                left: Math.max(0, Math.min(width - tipWidth, picked.x - tipWidth / 2)),
                minWidth: TIP_W,
                maxWidth: width,
              }}
            >
              <Text variant="micro" className="text-on-inverse" numberOfLines={1}>
                {picked.point.title ?? picked.point.label}
              </Text>
              <Text variant="label" className="text-on-inverse" numberOfLines={1}>
                {formatValue(picked.value)}
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {/* Only as many dates as fit: twenty side by side were twenty clipped
          stubs, and thinned by a step measured at their centres, the two at
          either end still sat on their neighbours. */}
      <AxisLabels labels={width > 0 ? axisLabels : []} span={plotWidth} />
    </View>
  )
}
