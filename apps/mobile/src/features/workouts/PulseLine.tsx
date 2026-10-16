import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia'
import { useMemo, useState } from 'react'
import { View } from 'react-native'

import type { WorkoutHeartRate } from '@/data'
import { type HrZones, hrZonesFromSamples } from '@/lib/health'
import { useThemeColors } from '@/theme/useTheme'
import { Text } from '@/ui'
import { clock } from './format'

/** The most points drawn: a two-hour trace at five seconds is 1,440 readings. */
const MAX_POINTS = 120
const HEIGHT = 112
/** The gutter the highest and lowest figures sit in. */
const SCALE_W = 40
const STROKE = 2.5

/**
 * The readings averaged into at most `MAX_POINTS` evenly spaced points, null
 * where a whole stretch had none. Exported for the test.
 */
export function pulsePoints(bpm: readonly (number | null)[]): (number | null)[] {
  const size = Math.max(1, Math.ceil(bpm.length / MAX_POINTS))
  const points: (number | null)[] = []
  for (let start = 0; start < bpm.length; start += size) {
    const heard = bpm.slice(start, start + size).filter((value): value is number => value !== null)
    points.push(heard.length ? heard.reduce((sum, value) => sum + value, 0) / heard.length : null)
  }
  return points
}

/** The trace's time in each zone, for a heart that beats at most `208 - 0.7 × age`. */
export function traceZones(heart: WorkoutHeartRate, age: number | null): HrZones | null {
  const start = Date.parse(heart.startedAt)
  const samples = heart.bpm.flatMap((bpm, index) =>
    bpm === null ? [] : [{ bpm, at: start + index * heart.intervalS * 1000 }],
  )
  return hrZonesFromSamples(samples, age)
}

/**
 * A watch-recorded workout's heart rate across the session: the line breaks
 * where the watch read nothing, rather than drawing a pulse nobody measured.
 * Sets push it up and rests let it fall, so the shape is the workout's rhythm.
 */
export function PulseLine({ heart }: { heart: WorkoutHeartRate }) {
  const colors = useThemeColors()
  const [width, setWidth] = useState(0)
  const plotWidth = Math.max(0, width - SCALE_W)
  const points = useMemo(() => pulsePoints(heart.bpm), [heart.bpm])
  const low = heart.minBpm - 5
  const high = heart.maxBpm + 5

  const { line, area } = useMemo(() => {
    if (plotWidth <= 0 || points.length === 0) return { line: null, area: null }
    const x = (index: number) =>
      points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth
    const y = (value: number) =>
      STROKE + (1 - (value - low) / Math.max(1, high - low)) * (HEIGHT - STROKE * 2)
    let stroke = ''
    let fill = ''
    let run: { x: number; y: number }[] = []
    const close = () => {
      if (run.length === 0) return
      stroke += run.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')
      fill += `M ${run[0].x} ${HEIGHT} ${run.map((p) => `L ${p.x} ${p.y}`).join(' ')} L ${run[run.length - 1].x} ${HEIGHT} Z `
      run = []
    }
    points.forEach((value, index) => {
      if (value === null) close()
      else run.push({ x: x(index), y: y(value) })
    })
    close()
    return {
      line: stroke ? Skia.Path.MakeFromSVGString(stroke) : null,
      area: fill ? Skia.Path.MakeFromSVGString(fill) : null,
    }
  }, [points, plotWidth, low, high])

  const durationS = heart.bpm.length * heart.intervalS

  return (
    // The figures above it already say the average and the maximum, which is
    // what a screen reader can use; the line itself is for the eye.
    <View
      className="gap-1.5"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <View className="flex-row" style={{ height: HEIGHT }}>
        <Canvas style={{ width: plotWidth, height: HEIGHT }}>
          {area ? (
            <Path path={area} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, HEIGHT)}
                colors={[`${colors.hibiscus}55`, `${colors.hibiscus}00`]}
              />
            </Path>
          ) : null}
          {line ? (
            <Path
              path={line}
              style="stroke"
              strokeWidth={STROKE}
              strokeJoin="round"
              strokeCap="round"
              color={colors.hibiscus}
            />
          ) : null}
        </Canvas>
        <View className="justify-between pl-2" style={{ width: SCALE_W }}>
          <Text variant="caption" className="text-muted">
            {heart.maxBpm}
          </Text>
          <Text variant="caption" className="text-muted">
            {heart.minBpm}
          </Text>
        </View>
      </View>
      <View className="flex-row justify-between" style={{ width: plotWidth }}>
        <Text variant="caption" className="text-muted">
          {clock(0)}
        </Text>
        <Text variant="caption" className="text-muted">
          {clock(durationS)}
        </Text>
      </View>
    </View>
  )
}
