import { makeImageFromView } from '@shopify/react-native-skia'
import { File, Paths } from 'expo-file-system'
import { useLocalSearchParams } from 'expo-router'
import { type ComponentType, type RefObject, useEffect, useRef } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing } from '@/theme/tokens'
import { Screen, type ScreenProps } from '@/ui'
import type { Track } from './data'

/**
 * What a deep link can ask of a prototype: which step to open on, which kind of
 * group to be, which sheet to show, and whether to capture the screen.
 *
 *   ricecal:///labs/groups/challenge?step=board&track=both&capture=b2-board
 */
export function useLabParams() {
  const params = useLocalSearchParams<{
    step?: string
    track?: string
    open?: string
    capture?: string
  }>()
  const track: Track | undefined =
    params.track === 'both' || params.track === 'food' ? params.track : undefined
  return { step: params.step, track, open: params.open, capture: params.capture }
}

/**
 * `Screen`, unless the link asked for a capture. Then the whole page is laid out
 * at its full height, header to footer, and written to the documents directory
 * as `groups-lab-<name>.png`: a mockup made of the real components, as long as
 * the screen actually is, rather than the 844 points a simulator screenshot
 * can hold.
 */
export function LabScreen(props: ScreenProps) {
  const { capture } = useLabParams()
  return capture ? <FullLength name={capture} {...props} /> : <Screen {...props} />
}

/**
 * A captured page has no status bar over it, so the full inset would leave a
 * blank band across the top. A little room keeps the bar from touching the edge.
 */
const STATUS_BAR = 12

function FullLength({ name, header, footer, children }: ScreenProps & { name: string }) {
  const insets = useSafeAreaInsets()
  const page = useRef<View>(null)

  useEffect(() => {
    // Long enough for fonts, icons and the ring's fill animation to settle.
    const timer = setTimeout(async () => {
      const image = await makeImageFromView(page as RefObject<never>)
      if (!image) {
        console.warn(`[groups-lab] could not capture ${name}`)
        return
      }
      const file = new File(Paths.document, `groups-lab-${name}.png`)
      file.create({ overwrite: true })
      file.write(image.encodeToBase64(), { encoding: 'base64' })
      console.log(`[groups-lab] captured ${name} ${image.width()}x${image.height()}`)
    }, 2500)
    return () => clearTimeout(timer)
  }, [name])

  return (
    <ScrollView className="flex-1 bg-canvas">
      <View ref={page} collapsable={false} className="bg-canvas">
        {header ? (
          <View className="px-gutter pb-stack" style={{ paddingTop: STATUS_BAR + spacing.gutter }}>
            {header}
          </View>
        ) : null}
        <View
          style={{
            padding: spacing.gutter,
            paddingTop: header ? 0 : spacing.gutter + STATUS_BAR,
            gap: spacing.stack,
          }}
        >
          {children}
        </View>
        {footer ? (
          <View
            className="gap-md px-gutter pt-md"
            style={{ paddingBottom: insets.bottom + spacing.xs }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

/**
 * A route for a prototype that starts over whenever its link changes. Expo
 * Router hands a second deep link to the same route to the screen already
 * showing it, and these screens read their step once, as initial state.
 */
export function labRoute(Prototype: ComponentType) {
  return function LabRoute() {
    const params = useLocalSearchParams()
    return <Prototype key={JSON.stringify(params)} />
  }
}
