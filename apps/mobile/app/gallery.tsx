import { Stack } from 'expo-router'

import { ControlsSection } from '@/gallery/ControlsSection'
import { DataSection } from '@/gallery/DataSection'
import { FeedbackSection } from '@/gallery/FeedbackSection'
import { PrimitivesSection } from '@/gallery/PrimitivesSection'
import type { ColorSchemePreference } from '@/theme/useTheme'
import { useTheme } from '@/theme/useTheme'
import { Badge, Card, Screen, SegmentedControl } from '@/ui'

const SCHEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ColorSchemePreference; label: string }[]

/**
 * The component gallery.
 *
 * Every component appears here in each of its states, which makes a visual
 * regression obvious rather than something you discover later inside a screen.
 * It ships in the app rather than living in a separate Storybook so it runs
 * against the real fonts, the real theme and a real device.
 */
export default function Gallery() {
  const { isDark, preference, setPreference } = useTheme()

  return (
    <>
      <Stack.Screen options={{ title: 'Gallery' }} />
      <Screen>
        <Card
          title="Theme"
          action={<Badge tone={isDark ? 'water' : 'kaya'}>{isDark ? 'Dark' : 'Light'}</Badge>}
        >
          <SegmentedControl
            options={SCHEMES}
            value={preference}
            onChange={setPreference}
            accessibilityLabel="Colour scheme"
          />
        </Card>

        <PrimitivesSection />
        <ControlsSection />
        <DataSection />
        <FeedbackSection />
      </Screen>
    </>
  )
}
