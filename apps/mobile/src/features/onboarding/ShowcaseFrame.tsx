import * as Haptics from 'expo-haptics'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { cn, Icon, Text, useToast } from '@/ui'

export type ShowcaseFrameProps = {
  /** The sample, drawn the way the real screen draws it. */
  children: ReactNode
  /** What the sample shows, for VoiceOver. "Preview" is put in front of it. */
  accessibilityLabel: string
  className?: string
}

/**
 * A sample of the app, shown as a picture of the app.
 *
 * The onboarding samples are built from the real screens' parts so they look
 * like what somebody will get, and that was the problem: set rows with ticks, a
 * heart and a scan result look exactly like controls, they sat between
 * questions that DO want a tap, and users tapped them and thought the flow was
 * broken. So a sample sits inside a small phone on a tinted panel, labelled
 * "Preview", with the phone's lower half fading out the way a screenshot in a
 * store listing does. Nothing inside it takes a touch.
 *
 * A tap anyway still gets an answer: the pill nods and a toast says what this
 * is, rather than the silence that read as a bug.
 *
 * No slab under the panel. A slab is what marks a control as pressable in this
 * app (see `Squish`), which is the one thing this must not look like.
 */
export function ShowcaseFrame({ children, accessibilityLabel, className }: ShowcaseFrameProps) {
  const { t } = useTranslation('onboarding')
  const colors = useThemeColors()
  const toast = useToast()
  const still = useReducedMotion()
  const nod = useSharedValue(1)
  const pill = useAnimatedStyle(() => ({ transform: [{ scale: nod.value }] }))

  const explain = () => {
    void Haptics.selectionAsync().catch(() => {})
    if (!still) nod.value = withSequence(withTiming(1.12, { duration: 120 }), withSpring(1))
    toast.show({ title: t('preview.tapped'), icon: { set: 'system', name: 'eye-show' } })
  }

  return (
    <Pressable
      onPress={explain}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${t('preview.badge')}. ${accessibilityLabel}`}
      className={cn('overflow-hidden rounded-card bg-pandan-soft px-3 pt-3', className)}
    >
      <Animated.View
        style={pill}
        className="mb-3 flex-row items-center gap-1.5 self-start rounded-full bg-surface px-3 py-1.5"
      >
        <Icon set="system" name="eye-show" size={16} />
        <Text variant="caption" className="text-pandan-ink">
          {t('preview.badge')}
        </Text>
      </Animated.View>

      {/* The phone: a bezel on three sides and none at the foot, so it runs
          off the panel rather than ending like a card. */}
      <View
        pointerEvents="none"
        className="mx-2 gap-3.5 rounded-t-[30px] border-x-2 border-t-2 border-heading bg-surface px-3 pb-9 pt-4"
      >
        {children}
      </View>

      <View
        pointerEvents="none"
        className="absolute inset-x-0 bottom-0 h-14"
        style={{
          experimental_backgroundImage: `linear-gradient(to bottom, ${transparent(colors.pandanSoft)}, ${colors.pandanSoft})`,
        }}
      />
    </Pressable>
  )
}

/**
 * The panel's own colour at zero alpha. Fading to `transparent` goes through
 * grey on iOS (it is transparent BLACK), which shows as a dirty band in light
 * mode.
 */
function transparent(hex: string): string {
  return `${hex.slice(0, 7)}00`
}
