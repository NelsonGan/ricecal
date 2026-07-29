import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia'

/**
 * Third-party logos, drawn as paths.
 *
 * These are the one thing on screen that is not ours to redraw: Apple and
 * Google both require their own mark, at their own proportions, on any button
 * that signs a user in. So they cannot go through `Icon` — that set is the
 * app's own illustration language, and there is no PNG here to add anyway.
 *
 * Skia rather than an asset because a logo has to stay crisp at any size and
 * follow the label's colour on the Apple mark, and because it is already a
 * dependency. The path data is each vendor's published outline; do not
 * "tidy" it.
 */

/** Apple's mark, on a 24x24 grid. Monochrome by design — it takes the label's colour. */
const APPLE =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'

/**
 * Google's "G", on a 48x48 grid.
 *
 * Four paths and four fixed colours — the mark is never recoloured, which is
 * why this one ignores the `color` prop.
 */
const GOOGLE: { path: string; color: string }[] = [
  {
    path: 'M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z',
    color: '#4285F4',
  },
  {
    path: 'M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z',
    color: '#34A853',
  },
  {
    path: 'M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z',
    color: '#FBBC05',
  },
  {
    path: 'M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z',
    color: '#EA4335',
  },
]

export type BrandMarkProps = {
  brand: 'apple' | 'google'
  /** Rendered edge length in points. */
  size?: number
  /** Apple's mark only — Google's is never recoloured. */
  color?: string
}

/**
 * Decorative by default: the button beside it says "Continue with Apple", and
 * a screen reader announcing the logo as well would say it twice.
 */
export function BrandMark({ brand, size = 22, color = '#000000' }: BrandMarkProps) {
  const isApple = brand === 'apple'
  // Each vendor publishes its outline on its own grid.
  const grid = isApple ? 24 : 48
  const scale = size / grid

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Group transform={[{ scale }]}>
        {isApple ? (
          <Path path={Skia.Path.MakeFromSVGString(APPLE) ?? Skia.Path.Make()} color={color} />
        ) : (
          GOOGLE.map((part) => (
            <Path
              key={part.color}
              path={Skia.Path.MakeFromSVGString(part.path) ?? Skia.Path.Make()}
              color={part.color}
            />
          ))
        )}
      </Group>
    </Canvas>
  )
}
