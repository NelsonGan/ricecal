import { View } from 'react-native'

const TURN = { left: '45deg', right: '-135deg', down: '-45deg', up: '135deg' } as const

/**
 * A thin chevron, drawn rather than an icon: the app's icons are clay
 * drawings, and at 12pt over a map a clay arrow reads as a blob. Two edges of a
 * small square, turned to point the way asked.
 */
export function Chevron({
  direction,
  size = 9,
  color,
  weight = 2,
}: {
  direction: keyof typeof TURN
  size?: number
  color: string
  weight?: number
}) {
  // The turned square's corner points out of its box, so it is nudged back
  // toward the way it points to look centred.
  const nudge = size * 0.2
  const offset =
    direction === 'left'
      ? { marginLeft: nudge }
      : direction === 'right'
        ? { marginRight: nudge }
        : direction === 'down'
          ? { marginBottom: nudge }
          : { marginTop: nudge }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderLeftWidth: weight,
        borderBottomWidth: weight,
        borderColor: color,
        borderBottomLeftRadius: 1,
        transform: [{ rotate: TURN[direction] }],
        ...offset,
      }}
    />
  )
}
