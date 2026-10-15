import { View } from 'react-native'

import { cn, Tappable, Text } from '@/ui'

export type CaptureSwitchOption<T extends string> = { value: T; label: string }

export type CaptureSwitchProps<T extends string> = {
  options: readonly CaptureSwitchOption<T>[]
  value: T
  onChange: (value: T) => void
  accessibilityLabel?: string
}

/**
 * Meal or barcode, as a pill floating on the viewfinder.
 *
 * Not `Tabs`: an underline is drawn for a white page, and over a photograph of
 * a plate it is one more stripe among the cucumber. A dark translucent track
 * with a white thumb reads on any feed, the way a phone's own camera labels its
 * modes.
 */
export function CaptureSwitch<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: CaptureSwitchProps<T>) {
  return (
    <View
      className="flex-row rounded-full bg-black/55 p-1"
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Tappable
            key={option.value}
            onPress={() => onChange(option.value)}
            // The 44pt floor `Tabs` had, which this replaced: a mode switch on a
            // camera is aimed at while the phone is moving.
            className={cn('min-h-sm justify-center rounded-full px-4', selected && 'bg-white')}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              className={cn(
                'font-display text-[15px] leading-[20px]',
                selected ? 'text-black' : 'text-white',
              )}
            >
              {option.label}
            </Text>
          </Tappable>
        )
      })}
    </View>
  )
}
