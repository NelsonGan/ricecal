import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Easing, View } from 'react-native'
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Card, Icon, Text } from '@/ui'

/** How often the line under the bar changes. */
const PHRASE_MS = 3600

/**
 * How long the bar takes to reach its ceiling.
 *
 * Paced for the slow end of a real read. A pot is one model call, but it is a
 * long one: twenty ingredients, seven fields each and the steps, on a vision
 * call when there is a photograph. Fifteen seconds is ordinary.
 */
const FILL_MS = 30000

export type ReadingRecipeProps = {
  /** Which read is running. Only the first line of copy differs. */
  source: 'photo' | 'text'
}

/**
 * The form while the pot is being read, and it is the whole form. It replaces the
 * fields rather than sitting above them: a banner over a live form invites the
 * cook to type a name into a box about to be filled in for them, and `applyDraft`
 * only writes over empty fields, so a half-typed name is one the draft then
 * declines to correct.
 *
 * The bar is honest theatre, as the scanning row on Today is: the client cannot
 * observe the call's stages, so the fill eases toward the end without reaching
 * it.
 */
export function ReadingRecipe({ source }: ReadingRecipeProps) {
  const { t } = useTranslation('recipes')
  const colors = useThemeColors()

  const phrases = [
    source === 'text' ? t('new.readingText') : t('new.readingPhoto'),
    t('new.readingIngredients'),
    t('new.readingPortions'),
    t('new.readingSteps'),
  ]
  const [phrase, setPhrase] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setPhrase((current) => current + 1), PHRASE_MS)
    return () => clearInterval(id)
  }, [])

  const progress = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FILL_MS,
      // Quadratic out: fast at first, asymptotic at the end, which is the shape
      // every real download bar has and what makes it read as progress.
      easing: Easing.out(Easing.quad),
      // Width in percent is a layout property, so the native driver cannot
      // animate it.
      useNativeDriver: false,
    }).start()
  }, [progress])
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['8%', '92%'] })

  const label = phrases[phrase % phrases.length]

  return (
    <Card
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <View className="items-center gap-4 py-4">
        {/* The pot, breathing. A spinner would say the same thing in a
            component the rest of the app does not use, and this is the one
            screen where the thing being waited for has a picture of itself. */}
        <Breathe>
          <Icon set="food" name="cooking-pot" size={72} />
        </Breathe>

        <Shimmer>
          <Text variant="bodyStrong" className="text-center">
            {label}
          </Text>
        </Shimmer>

        <View className="h-2.5 w-full overflow-hidden rounded-full bg-track">
          <Animated.View
            style={{ width, height: '100%', backgroundColor: colors.pandan, borderRadius: 999 }}
          />
        </View>

        <Text variant="meta" className="text-center">
          {t('new.readingHint')}
        </Text>
      </View>
    </Card>
  )
}

/** A slow pulse, so the wait has something alive in it. */
function Breathe({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.08, { duration: 1400, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
      -1,
      true,
    )
  }, [scale])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return <Reanimated.View style={style}>{children}</Reanimated.View>
}

/**
 * The status line, shimmering rather than merely swapping.
 *
 * The same treatment the scanning row on Today gives its own line, for the
 * same reason: a hard cut between two sentences every few seconds reads as a
 * glitch, and a slow breath through the change says "still working" in the one
 * place the eye already is.
 */
function Shimmer({ children }: { children: React.ReactNode }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 1100, easing: ReanimatedEasing.inOut(ReanimatedEasing.quad) }),
      -1,
      true,
    )
  }, [pulse])
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }))
  return <Reanimated.View style={style}>{children}</Reanimated.View>
}
