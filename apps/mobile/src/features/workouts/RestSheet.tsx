import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Button, Sheet, Text, WHEEL_BAND, Wheel, type WheelOption, type WheelProps } from '@/ui'
import { shortClock } from './format'

/**
 * The longest rest the wheels offer. `user_settings.workout_rest_s` allows
 * 600, and a rest past ten minutes is a new session rather than a pause. An
 * exercise's own rest can be longer (an imported one, up to an hour); the
 * wheels show it as 10:00 and leave it alone unless they are moved.
 */
const MAX_MINUTES = 10
/** The seconds wheel moves in fives: nobody rests for 1:07 on purpose. */
const SECOND_STEP = 5

const split = (seconds: number) => {
  const total = Math.min(
    MAX_MINUTES * 60,
    Math.max(0, Math.round(seconds / SECOND_STEP) * SECOND_STEP),
  )
  return { minutes: Math.floor(total / 60), seconds: total % 60 }
}

/**
 * A rest on two wheels, minutes and seconds, where a fixed list of choices used
 * to be. 0:00 is no timer.
 *
 * Done saves only a rest that differs from the one the sheet opened on. An
 * exercise following the default (`seconds` null) keeps following it, so a
 * later change to the default still reaches it; a rest the wheels cannot show
 * exactly (2:07, 15:00) is not rounded by a look; and an untouched default is
 * not written back, which before the settings had loaded wrote 90 over it.
 * `onUseDefault` puts an exercise back on the default and is only offered
 * when it has a rest of its own.
 */
export function RestSheet({
  visible,
  title,
  seconds,
  defaultS,
  onClose,
  onPick,
  onUseDefault,
}: {
  visible: boolean
  title: string
  seconds: number | null
  defaultS: number
  onClose: () => void
  onPick: (seconds: number) => void
  onUseDefault?: () => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  // What was opened, held while the sheet closes: the editor clears the
  // exercise on close, and reading that mid-slide took "Use default" away and
  // shrank the panel as it fell.
  const held = useRef({ seconds, defaultS, title })
  if (visible) held.current = { seconds, defaultS, title }
  const shown = held.current
  const opening = split(shown.seconds ?? shown.defaultS)
  const [m, setM] = useState(opening.minutes)
  const [s, setS] = useState(opening.seconds)

  // Set before the panel is drawn. The sheet stays mounted between opens, and
  // resetting in `onShow`, which fires once the window is up, showed the last
  // exercise's rest for a frame before the wheels jumped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
  useLayoutEffect(() => {
    if (!visible) return
    setM(opening.minutes)
    setS(opening.seconds)
  }, [visible])

  const minutes = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: MAX_MINUTES + 1 }, (_, i) => ({ value: String(i), label: String(i) })),
    [],
  )
  // At the top minute the seconds wheel is a lone "00", so the wheels can never
  // read a rest the setting refuses.
  const secondsOptions = useMemo<WheelOption[]>(
    () =>
      Array.from({ length: m === MAX_MINUTES ? 1 : 60 / SECOND_STEP }, (_, i) => ({
        value: String(i * SECOND_STEP),
        label: String(i * SECOND_STEP).padStart(2, '0'),
      })),
    [m],
  )

  const total = m * 60 + s

  return (
    <Sheet
      placement="center"
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={shown.title}
      scrollable={false}
    >
      <View className="gap-5">
        <Text variant="display" className="text-center">
          {total > 0 ? shortClock(total) : t('workouts:logger.restOff')}
        </Text>
        <View className="flex-row gap-2">
          <UnitWheel
            unit={t('workouts:rest.min')}
            options={minutes}
            value={String(m)}
            onChange={(next) => {
              const value = Number(next)
              setM(value)
              if (value === MAX_MINUTES) setS(0)
            }}
            accessibilityLabel={t('workouts:rest.minutes')}
          />
          <UnitWheel
            unit={t('workouts:rest.sec')}
            options={secondsOptions}
            value={String(s)}
            onChange={(next) => setS(Number(next))}
            accessibilityLabel={t('workouts:rest.seconds')}
          />
        </View>
        <View className="gap-2">
          <Button
            fullWidth
            onPress={() => {
              if (total !== opening.minutes * 60 + opening.seconds) onPick(total)
              onClose()
            }}
          >
            {t('common:action.done')}
          </Button>
          {onUseDefault && shown.seconds !== null ? (
            <Button
              fullWidth
              variant="neutral"
              onPress={() => {
                onUseDefault()
                onClose()
              }}
            >
              {t('workouts:logger.restDefault', {
                time:
                  shown.defaultS > 0 ? shortClock(shown.defaultS) : t('workouts:logger.restOff'),
              })}
            </Button>
          ) : null}
        </View>
      </View>
    </Sheet>
  )
}

/**
 * A wheel with its unit written inside the selected band, as the Clock app's
 * timer does. A caption beside the column read as a separate label rather than
 * part of the value. Hidden from screen readers: the wheel's own label names it.
 */
function UnitWheel({ unit, ...wheel }: WheelProps & { unit: string }) {
  return (
    <View className="flex-1">
      <Wheel {...wheel} />
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-x-0 items-end justify-center pr-4"
        style={WHEEL_BAND}
      >
        <Text variant="label" className="text-muted" numberOfLines={1}>
          {unit}
        </Text>
      </View>
    </View>
  )
}
