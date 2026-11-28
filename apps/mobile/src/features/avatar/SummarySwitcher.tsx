import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import Animated, { cubicBezier, FadeIn, FadeOut } from 'react-native-reanimated'

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

  // A meal that landed in this very render bites straight away, rather than a
  // render later once the effect above has run, so the new mood never shows
  // before the spoon does.
  const biting = eating || (mealLanded !== null && active)
  const showAvatar = view === 'avatar' || flash || biting

  return (
    <View>
      <View
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        pointerEvents={showAvatar ? 'none' : 'auto'}
        accessibilityElementsHidden={showAvatar}
        importantForAccessibility={showAvatar ? 'no-hide-descendants' : 'auto'}
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
      {showAvatar && height > 0 ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(220)}
          className="absolute inset-x-0 top-0"
        >
          <AvatarSummary
            outfit={outfit}
            state={{ mood, action: biting ? 'eating' : undefined }}
            height={height}
            figure={figure}
            caption={caption}
            onPress={() => router.push('/avatar')}
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
