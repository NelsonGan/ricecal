/**
 * Background shapes for the scenes: soft blobs, pandan blades and rice grains.
 * Everything sits at a low z-index behind the device and the headline, and
 * everything is drawn from the app palette so the frame and the screenshot
 * inside it read as one picture.
 */

export function Blob({ x, y, size, color, opacity = 0.5, rotate = 0, zIndex = 1 }: {
  x: number; y: number; size: number; color: string;
  opacity?: number; rotate?: number; zIndex?: number;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size * 0.94,
      background: color, opacity,
      transform: `rotate(${rotate}deg)`,
      borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%',
      pointerEvents: 'none',
    }} />
  );
}

/**
 * A pandan blade: long, tapered, with a centre rib. Three of them fan out from
 * the anchor point, which is what makes it read as a plant rather than a leaf.
 */
export function Pandan({ x, y, size = 360, color, opacity = 0.55, rotate = 0, flip = false, zIndex = 1 }: {
  x: number; y: number; size?: number; color: string;
  opacity?: number; rotate?: number; flip?: boolean; zIndex?: number;
}) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex, opacity,
        transform: `rotate(${rotate}deg)${flip ? ' scaleX(-1)' : ''}`,
        pointerEvents: 'none',
      }}
      width={size} height={size * 1.3} viewBox="0 0 200 260" fill="none"
    >
      {/* Outer blade, curling left */}
      <path
        d="M100 258 C 96 190, 70 132, 22 74 C 54 118, 88 168, 100 214 Z"
        fill={color}
      />
      {/* Centre blade, upright and longest */}
      <path
        d="M100 258 C 92 180, 96 96, 110 6 C 130 100, 122 186, 108 258 Z"
        fill={color}
      />
      {/* Outer blade, curling right */}
      <path
        d="M104 258 C 112 192, 142 138, 190 88 C 158 132, 124 176, 112 220 Z"
        fill={color}
      />
    </svg>
  );
}

/** A scatter of rice grains, for the corners the blades do not reach. */
export function Grains({ x, y, size = 200, color, opacity = 0.5, rotate = 0, zIndex = 1 }: {
  x: number; y: number; size?: number; color: string;
  opacity?: number; rotate?: number; zIndex?: number;
}) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex, opacity,
        transform: `rotate(${rotate}deg)`,
        pointerEvents: 'none',
      }}
      width={size} height={size} viewBox="0 0 120 120" fill={color}
    >
      <ellipse cx="24" cy="26" rx="15" ry="7" transform="rotate(-28 24 26)" />
      <ellipse cx="62" cy="14" rx="14" ry="6.5" transform="rotate(18 62 14)" />
      <ellipse cx="94" cy="40" rx="15" ry="7" transform="rotate(-42 94 40)" />
      <ellipse cx="38" cy="62" rx="14" ry="6.5" transform="rotate(38 38 62)" />
      <ellipse cx="76" cy="76" rx="15" ry="7" transform="rotate(-14 76 76)" />
      <ellipse cx="26" cy="100" rx="13" ry="6" transform="rotate(24 26 100)" />
      <ellipse cx="66" cy="108" rx="12" ry="5.5" transform="rotate(-34 66 108)" />
    </svg>
  );
}
