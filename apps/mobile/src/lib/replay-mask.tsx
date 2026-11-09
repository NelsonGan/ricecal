import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

/**
 * Blanks its children out of PostHog session replays.
 *
 * Wrap anything that shows a reading from Apple Health or Health Connect, or a
 * weight. Replays go to PostHog, a third party, and Apple (App Review 5.1.3)
 * and Google (the Health Connect policy) forbid passing health data to one for
 * analytics. The privacy policy says the same. A replay of the diary is what
 * replays are for, so the mask goes around the reading, never the screen.
 *
 * The same thing as PostHog's own `PostHogMaskView`, kept here so a component
 * that masks does not pull the SDK into every test that renders it:
 *
 * - `ph-no-capture` as the label is what both native recorders look for.
 * - `importantForAccessibility="no"` stops that label hiding the children from
 *   TalkBack; VoiceOver reads the children because the wrapper is not itself an
 *   accessibility element.
 * - `collapsable={false}` keeps the wrapper in the native tree. Flattened away,
 *   which React Native does to layout-only views, there is nothing to mask.
 *
 * It is a plain View, so it takes part in layout: give it the flex the wrapped
 * element had, as `style`, where that matters.
 */
export function ReplayMask({ children, ...props }: ViewProps & { children: ReactNode }) {
  return (
    <View
      {...props}
      accessibilityLabel="ph-no-capture"
      importantForAccessibility="no"
      collapsable={false}
    >
      {children}
    </View>
  )
}
