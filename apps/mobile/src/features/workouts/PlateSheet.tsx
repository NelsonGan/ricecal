import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { UNIT_KEY, type WeightUnit } from '@/lib/units'
import { cn, SegmentedControl, Sheet, Text, TextField } from '@/ui'
import { parseDecimal, trim, weightField } from './format'
import { platesFor } from './warmup'

/**
 * Which plates go on each side of the bar for a weight. Opened from an
 * exercise's menu with that exercise's next weight already in it.
 */

const BARS = { kg: ['20', '15', '10'], lb: ['45', '35', '25'] } as const

/**
 * Plate colours by size, the way competition plates are painted, each with the
 * label colour the design system pairs with that fill. One white label on
 * every plate was 1.4:1 on the grey change plates and not much better on
 * kaya.
 */
const PLATE_TONE: Record<string, { fill: string; label: string }> = {
  '25': { fill: 'bg-hibiscus', label: 'text-on-hibiscus' },
  '45': { fill: 'bg-hibiscus', label: 'text-on-hibiscus' },
  '20': { fill: 'bg-water', label: 'text-on-water' },
  '35': { fill: 'bg-water', label: 'text-on-water' },
  '15': { fill: 'bg-kaya', label: 'text-on-kaya' },
  '10': { fill: 'bg-pandan', label: 'text-on-pandan' },
}
/** The small change plates: grey, labelled in ink, which reads in both modes. */
const CHANGE_PLATE = { fill: 'bg-line-strong', label: 'text-ink' }

/** A quarter of a unit, which every bar and plate here is a multiple of. */
const GRID = 0.25
/** How many quarters to look either way: well past the widest gap, 5 lb. */
const REACH = 40

/**
 * The loadable totals either side of one that is not, nearest first and the
 * lighter on a tie. Found by asking `platesFor` along the grid rather than
 * from a second copy of the plate list, so the two cannot disagree.
 */
function nearestLoads(total: number, bar: number, unit: WeightUnit): number[] {
  if (total < bar) return [bar]
  const loads: number[] = []
  const low = Math.floor(total / GRID)
  for (let step = low; step > low - REACH && step * GRID >= bar; step--) {
    const load = step * GRID
    if (load < total && platesFor(load, bar, unit)) {
      loads.push(load)
      break
    }
  }
  const high = Math.ceil(total / GRID)
  for (let step = high; step < high + REACH; step++) {
    const load = step * GRID
    if (load > total && platesFor(load, bar, unit)) {
      loads.push(load)
      break
    }
  }
  return loads.sort((a, b) => Math.abs(a - total) - Math.abs(b - total) || a - b)
}

export function PlateSheet({
  visible,
  onClose,
  unit,
  initialKg,
}: {
  visible: boolean
  onClose: () => void
  unit: WeightUnit
  initialKg: number | null
}) {
  const { t } = useTranslation(['workouts', 'common'])
  const [target, setTarget] = useState('')
  const [bar, setBar] = useState<string>(BARS[unit][0])

  useEffect(() => {
    if (!visible) return
    setTarget(initialKg ? weightField(initialKg, unit) : '')
    setBar(BARS[unit][0])
  }, [visible, initialKg, unit])

  const total = parseDecimal(target)
  const exact = total === null ? null : platesFor(total, Number(bar), unit)
  // A weight the plates cannot make offers the nearest ones that they can, as
  // Strong does, and loads the nearer: "not reachable" left the user to find
  // 102.5 by trying numbers.
  const closest = total !== null && exact === null ? nearestLoads(total, Number(bar), unit) : []
  const plates = exact ?? (closest.length ? platesFor(closest[0], Number(bar), unit) : null)
  const unitLabel = t(UNIT_KEY[unit])
  const load = (value: number) => `${trim(value)} ${unitLabel}`

  return (
    // Full height because it has a field in it; see "Sheets and the keyboard".
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('workouts:plates.title')}
      fullHeight
      scrollable={false}
    >
      <View className="gap-5">
        <TextField
          label={t('workouts:plates.target')}
          value={target}
          onChangeText={setTarget}
          keyboardType="decimal-pad"
          rightSlot={<Text variant="meta">{unitLabel}</Text>}
        />
        <View className="gap-2">
          <Text variant="label">{t('workouts:plates.bar')}</Text>
          <SegmentedControl
            options={BARS[unit].map((value) => ({ value, label: `${value} ${unitLabel}` }))}
            value={bar}
            onChange={setBar}
            accessibilityLabel={t('workouts:plates.bar')}
          />
        </View>

        {total !== null ? (
          <View className="gap-3 rounded-card bg-surface-alt p-4">
            <Text variant="overline">{t('workouts:plates.perSide')}</Text>
            {closest.length ? (
              // Nearest first, so the plates below are the first weight named.
              <Text variant="label">
                {closest.length > 1
                  ? t('workouts:plates.closestOr', {
                      weight: load(closest[0]),
                      other: load(closest[1]),
                    })
                  : t('workouts:plates.closest', { weight: load(closest[0]) })}
              </Text>
            ) : null}
            {plates === null ? (
              <Text variant="body">{t('workouts:plates.unreachable')}</Text>
            ) : plates.length === 0 ? (
              <Text variant="body">{t('workouts:plates.none')}</Text>
            ) : (
              <View className="flex-row flex-wrap items-center gap-2">
                {plates.map((plate, index) => {
                  const tone = PLATE_TONE[String(plate)] ?? CHANGE_PLATE
                  return (
                    <View
                      // biome-ignore lint/suspicious/noArrayIndexKey: plates repeat, and order is the identity
                      key={index}
                      className={cn('items-center justify-center rounded-md', tone.fill)}
                      style={{ width: 44, height: Math.max(36, 26 + plate * 2.2) }}
                    >
                      <Text className={cn('font-display text-[15px]', tone.label)}>
                        {trim(plate)}
                      </Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
