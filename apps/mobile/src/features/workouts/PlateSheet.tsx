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

/** Plate colours by size, the way competition plates are painted. */
const PLATE_TONE: Record<string, string> = {
  '25': 'bg-hibiscus',
  '45': 'bg-hibiscus',
  '20': 'bg-water',
  '35': 'bg-water',
  '15': 'bg-kaya',
  '10': 'bg-pandan',
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
  const plates = total === null ? null : platesFor(total, Number(bar), unit)
  const unitLabel = t(UNIT_KEY[unit])

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
            {plates === null ? (
              <Text variant="body">{t('workouts:plates.unreachable')}</Text>
            ) : plates.length === 0 ? (
              <Text variant="body">{t('workouts:plates.none')}</Text>
            ) : (
              <View className="flex-row flex-wrap items-center gap-2">
                {plates.map((plate, index) => (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: plates repeat, and order is the identity
                    key={index}
                    className={cn(
                      'items-center justify-center rounded-md',
                      PLATE_TONE[String(plate)] ?? 'bg-line-strong',
                    )}
                    style={{ width: 44, height: Math.max(36, 26 + plate * 2.2) }}
                  >
                    <Text className="font-display text-[15px] text-on-pandan">{trim(plate)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}
