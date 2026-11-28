import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, { cubicBezier } from 'react-native-reanimated'

import { preloadAvatar } from './AvatarFigure'
import { AvatarSummary } from './AvatarSummary'
import type { AvatarMood } from './mood'
import { setSummaryView, useSummaryView } from './preference'
import { SummaryToggle } from './SummaryToggle'
import { useAvatar } from './useAvatar'

/** After the last bite, how long the new mood stays before the stats return. */
const FLASH_HOLD_MS = 900

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1)

/**
 * Today's summary card body: the stats or the avatar, and the toggle between
 * them (README: The avatar on Today).
 *
 * When a meal lands the avatar eats it. With the avatar showing that happens
 * in place; with the stats showing, the avatar fades in over them for the
 * bite and fades back out once its face has settled on the day's new mood.
 * The stats stay laid out underneath throughout, so the card keeps their
 * height and nothing on the screen moves.
 */
export function SummarySwitcher({
  userId,
  stats,
  mood,
  figure,
  caption,
  mealLanded,
  onMealPlayed,
  active,
}: {
  userId: string
  stats: ReactNode
  mood: AvatarMood
  figure: string
  caption: string
  /** The id of a meal that just landed; a new one plays the eating animation. */
  mealLanded: string | null
  /** Told once the bite has started, so the same meal is never eaten twice. */
  onMealPlayed: (id: string) => void
  /** Whether the screen is on top, so nobody misses the bite behind a sheet. */
  active: boolean
}) {
  const router = useRouter()
  const view = useSummaryView(userId)
  const { outfit } = useAvatar()
  const [height, setHeight] = useState(0)
  const [eating, setEating] = useState(false)
  const [flash, setFlash] = useState(false)
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!mealLanded || !active) return
    onMealPlayed(mealLanded)
    clearTimeout(hold.current)
    setEating(true)
    if (view === 'stats') setFlash(true)
  }, [mealLanded, active, view, onMealPlayed])

  useEffect(() => () => clearTimeout(hold.current), [])

  // Ready before the first meal, which may be the first time the avatar shows.
  useEffect(() => preloadAvatar(outfit, mood), [outfit, mood])

  // A meal that landed in this very render bites straight away, rather than a
  // render later once the effect above has run, so the new mood never shows
  // before the spoon does.
  const biting = eating || (mealLanded !== null && active)
  // Over the stats the avatar is revealed by `flash`, set in the effect after
  // that render is on screen: revealed in the render itself, the fade began
  // before the new totals and the spoon had been drawn, and the old mood
  // showed for a few frames.
  const showAvatar = view === 'avatar' || flash

  return (
    <View>
      <View
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        // Only the chosen avatar view takes the stats away; a bite flashing
        // over them leaves them tappable and readable.
        pointerEvents={view === 'avatar' ? 'none' : 'auto'}
        accessibilityElementsHidden={view === 'avatar'}
        importantForAccessibility={view === 'avatar' ? 'no-hide-descendants' : 'auto'}
      >
        <Animated.View
          style={{
            opacity: showAvatar ? 0 : 1,
            transitionProperty: 'opacity',
            transitionDuration: 220,
            transitionTimingFunction: EASE_OUT,
          }}
        >
          {stats}
        </Animated.View>
      </View>
      {height > 0 ? (
        // Mounted even while hidden, still and invisible: creating the canvas
        // and uploading its drawings when the first meal lands left the card
        // blank for a few frames. Showing it is then only a fade.
        <Animated.View
          className="absolute inset-x-0 top-0"
          pointerEvents={view === 'avatar' ? 'auto' : 'none'}
          accessibilityElementsHidden={!showAvatar}
          importantForAccessibility={showAvatar ? 'auto' : 'no-hide-descendants'}
          style={{
            opacity: showAvatar ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: 220,
            transitionTimingFunction: EASE_OUT,
          }}
        >
          <AvatarSummary
            outfit={outfit}
            state={{ mood, action: biting ? 'eating' : undefined }}
            animated={active && showAvatar}
            height={height}
            figure={figure}
            caption={caption}
            // Over the stats it is only passing through for a bite; a tap then
            // belongs to the stats underneath, so the flash takes none.
            onPress={view === 'avatar' ? () => router.push('/avatar') : undefined}
            onActionEnd={() => {
              setEating(false)
              if (flash) hold.current = setTimeout(() => setFlash(false), FLASH_HOLD_MS)
            }}
          />
        </Animated.View>
      ) : null}
      <SummaryToggle
        className="absolute -right-1.5 -top-2"
        value={view}
        onChange={(next) => {
          clearTimeout(hold.current)
          setFlash(false)
          setSummaryView(userId, next)
        }}
      />
    </View>
  )
}
