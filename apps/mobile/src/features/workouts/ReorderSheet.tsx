import * as Haptics from 'expo-haptics'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Button, Icon, Sheet, Text } from '@/ui'
import type { Category } from './catalogue'
import { ExerciseArt } from './ExerciseArt'

/**
 * The workout's exercises as short rows, to be put in a new order by dragging.
 *
 * A sheet of rows rather than dragging the cards themselves, which is what
 * Hevy and Strong do too: a card with five sets is taller than the screen's
 * middle, so dragging one past another is a scroll as much as a drag, and the
 * rows that make the order readable are what a reorder needs.
 *
 * The rows are a fixed height so where each one goes is arithmetic, worked out
 * on the UI thread while the finger moves. The order is handed back once, on
 * Done.
 */

const ROW = 64

export type ReorderItem = { key: string; exerciseId: string; name: string; category?: Category }

export function ReorderSheet({
  visible,
  items,
  onClose,
  onDone,
}: {
  visible: boolean
  items: readonly ReorderItem[]
  onClose: () => void
  onDone: (keys: string[]) => void
}) {
  const { t } = useTranslation(['workouts', 'common'])
  // Each key's slot. Reset from the document whenever the sheet opens.
  const slots = useSharedValue<Record<string, number>>({})
  const [shown, setShown] = useState(items)
  useEffect(() => {
    if (!visible) return
    setShown(items)
    slots.value = Object.fromEntries(items.map((item, index) => [item.key, index]))
  }, [visible, items, slots])

  const done = () => {
    const order = { ...slots.value }
    onDone(shown.map((item) => item.key).sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0)))
    onClose()
  }

  return (
    // Not scrollable: a sheet that scrolls fights every drag for the finger.
    <Sheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('workouts:logger.menu.reorder')}
      scrollable={false}
    >
      <View className="gap-5">
        <View style={{ height: shown.length * ROW }}>
          {shown.map((item) => (
            <SortableRow key={item.key} item={item} slots={slots} count={shown.length} />
          ))}
        </View>
        <Button fullWidth onPress={done}>
          {t('common:action.done')}
        </Button>
      </View>
    </Sheet>
  )
}

function SortableRow({
  item,
  slots,
  count,
}: {
  item: ReorderItem
  slots: SharedValue<Record<string, number>>
  count: number
}) {
  const colors = useThemeColors()
  const key = item.key
  const top = useSharedValue((slots.value[key] ?? 0) * ROW)
  const dragging = useSharedValue(false)
  const from = useSharedValue(0)

  // Every row but the one under the finger glides to its slot when the order
  // changes around it.
  useAnimatedReaction(
    () => slots.value[key],
    (slot, previous) => {
      if (slot === undefined || slot === previous) return
      if (!dragging.value) top.value = withTiming(slot * ROW, { duration: 160 })
    },
  )

  const tick = () => {
    void Haptics.selectionAsync().catch(() => {})
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      dragging.value = true
      from.value = top.value
      runOnJS(tick)()
    })
    .onUpdate((event) => {
      top.value = Math.max(0, Math.min((count - 1) * ROW, from.value + event.translationY))
      const to = Math.round(top.value / ROW)
      const at = slots.value[key]
      if (at === undefined || to === at) return
      // Everything between the old slot and the new one shifts one place
      // towards where this row came from.
      const next: Record<string, number> = {}
      for (const [other, slot] of Object.entries(slots.value)) {
        if (other === key) next[other] = to
        else if (at < to && slot > at && slot <= to) next[other] = slot - 1
        else if (at > to && slot < at && slot >= to) next[other] = slot + 1
        else next[other] = slot
      }
      slots.value = next
      runOnJS(tick)()
    })
    .onFinalize(() => {
      dragging.value = false
      top.value = withTiming((slots.value[key] ?? 0) * ROW, { duration: 160 })
    })

  const style = useAnimatedStyle(() => ({
    top: top.value,
    zIndex: dragging.value ? 10 : 0,
    transform: [{ scale: withTiming(dragging.value ? 1.03 : 1, { duration: 120 }) }],
    shadowOpacity: withTiming(dragging.value ? 0.18 : 0, { duration: 120 }),
  }))

  return (
    <Animated.View
      className="absolute inset-x-0 justify-center"
      style={[
        {
          height: ROW,
          shadowColor: '#000',
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      <View className="h-[56px] flex-row items-center gap-3 rounded-md bg-surface-alt pl-2">
        <ExerciseArt exerciseId={item.exerciseId} category={item.category} size={40} />
        <Text variant="label" numberOfLines={1} className="min-w-0 flex-1">
          {item.name}
        </Text>
        {/* The handle is the only thing that drags, so the sheet's own swipe
            down and a stray touch on a name both stay what they were. */}
        <GestureDetector gesture={pan}>
          <View
            className="h-full w-[52px] items-center justify-center"
            accessibilityRole="adjustable"
            accessibilityLabel={item.name}
          >
            <Icon set="ui" name="reorder" size={22} tintColor={colors.muted} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  )
}
