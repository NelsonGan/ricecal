import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler'
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

type ReorderItem = { key: string; exerciseId: string; name: string; category?: Category }

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
  const { height: windowHeight } = useWindowDimensions()
  // Each key's slot, and the rows as they were when the sheet opened. Taken
  // once per opening: the editor builds `items` afresh on every render, and a
  // rest ending mid-drag re-rendered it and put every row back.
  const slots = useSharedValue<Record<string, number>>({})
  const [shown, setShown] = useState(items)
  const latest = useRef(items)
  latest.current = items
  useEffect(() => {
    if (!visible) return
    setShown(latest.current)
    slots.value = Object.fromEntries(latest.current.map((item, index) => [item.key, index]))
  }, [visible, slots])

  const done = () => {
    const order = { ...slots.value }
    onDone(shown.map((item) => item.key).sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0)))
    onClose()
  }

  // The list scrolls once it is taller than about half the screen, and a drag
  // on a handle holds the scroll still until it lets go.
  const scroll = Gesture.Native()
  const maxHeight = Math.round(windowHeight * 0.55)

  return (
    // Not scrollable itself: the list inside is, under its own gesture.
    <Sheet
      placement="center"
      visible={visible}
      onClose={onClose}
      closeLabel={t('common:action.close')}
      title={t('workouts:logger.menu.reorder')}
      scrollable={false}
    >
      <View className="gap-5">
        <GestureDetector gesture={scroll}>
          <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false} bounces={false}>
            <View style={{ height: shown.length * ROW }}>
              {shown.map((item, index) => (
                <SortableRow
                  key={item.key}
                  item={item}
                  initialSlot={index}
                  slots={slots}
                  count={shown.length}
                  scroll={scroll}
                />
              ))}
            </View>
          </ScrollView>
        </GestureDetector>
        <Button fullWidth onPress={done}>
          {t('common:action.done')}
        </Button>
      </View>
    </Sheet>
  )
}

/**
 * The slots with `key` moved to `to`, and everything between its old slot and
 * the new one shifted a place towards where it came from. On either thread:
 * the drag runs it on the UI thread, VoiceOver's adjust on the JS one.
 */
function reslot(slots: Record<string, number>, key: string, to: number) {
  'worklet'
  const at = slots[key]
  if (at === undefined || to === at) return slots
  const next: Record<string, number> = {}
  for (const other in slots) {
    const slot = slots[other]
    if (other === key) next[other] = to
    else if (at < to && slot > at && slot <= to) next[other] = slot - 1
    else if (at > to && slot < at && slot >= to) next[other] = slot + 1
    else next[other] = slot
  }
  return next
}

function SortableRow({
  item,
  initialSlot,
  slots,
  count,
  scroll,
}: {
  item: ReorderItem
  /** Where the row starts, passed in so the render never reads `slots`. */
  initialSlot: number
  slots: SharedValue<Record<string, number>>
  count: number
  scroll: ReturnType<typeof Gesture.Native>
}) {
  const { t } = useTranslation(['workouts'])
  const colors = useThemeColors()
  const key = item.key
  const top = useSharedValue(initialSlot * ROW)
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
    .blocksExternalGesture(scroll)
    .onStart(() => {
      dragging.value = true
      from.value = top.value
      runOnJS(tick)()
    })
    .onUpdate((event) => {
      top.value = Math.max(0, Math.min((count - 1) * ROW, from.value + event.translationY))
      const next = reslot(slots.value, key, Math.round(top.value / ROW))
      if (next === slots.value) return
      slots.value = next
      runOnJS(tick)()
    })
    .onFinalize(() => {
      dragging.value = false
      top.value = withTiming((slots.value[key] ?? 0) * ROW, { duration: 160 })
    })

  // VoiceOver's way to move a row: swipe up on the handle for earlier, down
  // for later. The drag is not something a screen reader can do.
  const nudge = (by: -1 | 1) => {
    const at = slots.value[key]
    if (at === undefined) return
    slots.value = reslot(slots.value, key, Math.max(0, Math.min(count - 1, at + by)))
  }

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
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${t('workouts:logger.menu.reorder')}: ${item.name}`}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) =>
              nudge(event.nativeEvent.actionName === 'increment' ? -1 : 1)
            }
          >
            <Icon set="ui" name="reorder" size={22} tintColor={colors.muted} />
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  )
}
