import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

import type { VideoPlatform } from '@/data'
import { useThemeColors } from '@/theme/useTheme'

/**
 * Each platform's own App Store icon, at 144 px (48 pt at 3x), cut to one
 * rounded-square tile with its corners transparent, so the seven sit together
 * as one set. They came as one family from the stores, where the logos already
 * in `assets/brands/social/` are a circle, a play button and four different
 * squares. They are the platforms' marks, used only to say where a video is
 * from, which is what each one's brand rules allow.
 */
const LOGOS: Record<VideoPlatform, number> = {
  instagram: require('../../../assets/brands/video/instagram.png'),
  tiktok: require('../../../assets/brands/video/tiktok.png'),
  youtube: require('../../../assets/brands/video/youtube.png'),
  x: require('../../../assets/brands/video/x.png'),
  threads: require('../../../assets/brands/video/threads.png'),
  facebook: require('../../../assets/brands/video/facebook.png'),
  rednote: require('../../../assets/brands/video/rednote.png'),
}

/** The tile's corner, as the icons were cut (an iOS app icon's). */
const CORNER = 0.225

export type PlatformLogoProps = {
  platform: VideoPlatform
  size: number
  /**
   * A ring of the surface colour around the tile, for a logo laid over a
   * photo. Without it, a hairline in the line colour: YouTube's tile is white
   * on a white card, and TikTok's, X's and Threads' are black in dark mode.
   */
  ring?: boolean
}

/** Where a recipe's video came from. Decorative: the words beside it say it. */
export function PlatformLogo({ platform, size, ring = false }: PlatformLogoProps) {
  const colors = useThemeColors()
  const edge = ring ? 2 : StyleSheet.hairlineWidth
  return (
    <View
      testID={`platform-logo-${platform}`}
      accessible={false}
      style={{
        width: size + edge * 2,
        height: size + edge * 2,
        padding: edge,
        borderRadius: (size + edge * 2) * CORNER,
        backgroundColor: ring ? colors.surface : colors.line,
      }}
    >
      <Image
        source={LOGOS[platform]}
        style={{ width: size, height: size, borderRadius: size * CORNER }}
        contentFit="cover"
        // Bundled, so there is nothing to fade in from.
        transition={0}
        accessible={false}
      />
    </View>
  )
}
