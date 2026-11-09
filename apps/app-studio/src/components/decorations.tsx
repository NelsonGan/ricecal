import { C, R, slab } from './tokens';
import { DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';

export { DISPLAY_FONT };

/**
 * The pieces the brand panel is assembled from.
 *
 * Each is built the way a RiceCal card is built: a rounded surface, a solid
 * unblurred slab underneath, no gradient fills and no blurred drop shadows.
 * They read as pieces of the app that stepped outside it.
 */

const ICON_BASE = '/assets/icons/ds';

export function DsIcon({ name, size = 96 }: { name: string; size?: number }) {
  return (
    <img
      src={`${ICON_BASE}/${name}.png`}
      alt=""
      crossOrigin="anonymous"
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block', objectFit: 'contain' }}
    />
  );
}

/** One accent from the app's palette, in the four roles a card needs. */
export interface Tone {
  /** The saturated colour itself, for a filled shape. */
  base: string;
  /** The slab under a filled shape: the same hue, about 25% darker. */
  slab: string;
  /** The tint, for a card or a disc behind an icon. */
  soft: string;
  /** The line around that tint. */
  softLine: string;
  /** Dark enough for text on white. */
  ink: string;
}

export const TONES: Record<'pandan' | 'kaya' | 'hibiscus' | 'water' | 'teh', Tone> = {
  pandan:   { base: C.pandan,   slab: C.pandanSlab,   soft: C.pandanSoft,   softLine: C.pandanSoftLine,   ink: C.pandanSlab },
  kaya:     { base: C.kaya,     slab: C.kayaSlab,     soft: C.kayaSoft,     softLine: C.kayaSoftLine,     ink: C.kayaInk },
  hibiscus: { base: C.hibiscus, slab: C.hibiscusSlab, soft: C.hibiscusSoft, softLine: C.hibiscusSoftLine, ink: C.hibiscusSlab },
  water:    { base: C.water,    slab: C.waterSlab,    soft: C.waterSoft,    softLine: C.waterSoftLine,    ink: C.waterSlab },
  teh:      { base: C.teh,      slab: C.tehSlab,      soft: C.tehSoft,      softLine: C.tehSoftLine,      ink: C.tehSlab },
};

/**
 * A wide card: icon on the left, a title and one line of body on the right.
 * The workhorse of the brand panel.
 *
 * Sized so that five of them, the header and the figures fill the panel with a
 * gap between groups that is a few times the gap inside one. The panel spaces
 * its three blocks apart with whatever is left over, so a card that is too
 * short does not leave a tidy margin, it leaves a hole.
 */
export function FeatureRow({
  icon, title, body, tone = 'pandan', width = 1140,
}: {
  icon: string;
  title: string;
  body: string;
  tone?: keyof typeof TONES;
  width?: number;
}) {
  const t = TONES[tone];
  const disc = 196;
  return (
    <div style={{
      width, boxSizing: 'border-box',
      background: C.surface,
      borderRadius: R.card,
      padding: '48px 44px',
      boxShadow: slab(C.lineStrong, 6),
      display: 'flex', alignItems: 'center', gap: 44,
      textAlign: 'left',
    }}>
      <div style={{
        width: disc, height: disc, borderRadius: '50%', flexShrink: 0,
        background: t.soft, border: `3px solid ${t.softLine}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <DsIcon name={icon} size={disc * 0.62} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 62, fontWeight: 800, color: C.heading,
          letterSpacing: '-0.5px', lineHeight: 1.1,
        }}>{title}</div>
        <div style={{
          fontSize: 37, fontWeight: 600, color: C.body,
          marginTop: 10, lineHeight: 1.3,
        }}>{body}</div>
      </div>
    </div>
  );
}

const STAR_PATH = 'M12 2 L14.9 8.6 L22 9.2 L16.6 13.9 L18.2 21 L12 17.3 L5.8 21 L7.4 13.9 L2 9.2 L9.1 8.6 Z';

function RatingStar({ fill }: { fill: number }) {
  const size = 50;
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
        <path d={STAR_PATH} fill={C.kayaSoftLine} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, width: size * fill, overflow: 'hidden' }}>
        <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', maxWidth: 'none' }}>
          <path d={STAR_PATH} fill={C.kayaSlab} />
        </svg>
      </div>
    </div>
  );
}

const LAUREL_LEAVES = [
  [72, 188, 19, 8.5, -105], [63, 204, 19, 8.5, -15],
  [51, 163, 18, 8, -80], [37, 173, 18, 8, 10],
  [39, 132, 17, 7.5, -55], [21, 136, 17, 7.5, 35],
  [35, 99, 16, 7, -40], [17, 97, 16, 7, 50],
  [40, 68, 15, 6.5, -20], [24, 60, 15, 6.5, 70],
  [52, 42, 14, 6, 0], [40, 30, 14, 6, -90],
  [68, 24, 13, 5.5, 20], [60, 8, 13, 5.5, -70],
  [80, 10, 11, 5, -10],
];

function LaurelWing({ flip = false }: { flip?: boolean }) {
  return (
    <svg aria-hidden="true" width={110} height={260} viewBox="0 0 100 220" fill={C.kayaSlab}
      style={{ flexShrink: 0, transform: flip ? 'scaleX(-1)' : undefined }}>
      {LAUREL_LEAVES.map(([cx, cy, rx, ry, angle], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${angle} ${cx} ${cy})`} />
      ))}
    </svg>
  );
}

/** The brief's rating and user choice, using Money2Time's laurel arrangement. */
export function CommunityRating({ choice }: { choice: string }) {
  const choiceRef = useFitText<HTMLDivElement>(42);
  return (
    <div style={{
      width: 1140, boxSizing: 'border-box',
      background: C.surface,
      borderRadius: R.card * 2,
      border: `2px solid ${C.kayaSoftLine}`,
      padding: '42px 40px',
      boxShadow: slab(C.lineStrong, 6),
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
    }}>
      <LaurelWing />
      {/* Keep the wreath beside the rating, with room for translated copy. */}
      <div style={{ width: 520, minWidth: 0, textAlign: 'center' }}>
        <div style={{
          fontFamily: DISPLAY_FONT, fontSize: 132, fontWeight: 800,
          color: C.heading, letterSpacing: '-3px', lineHeight: 1,
        }}>4.5</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          {[1, 1, 1, 1, 0.5].map((fill, i) => <RatingStar key={i} fill={fill} />)}
        </div>
        <div ref={choiceRef} style={{
          fontSize: 42, fontWeight: 800, color: C.body,
          marginTop: 20, lineHeight: 1.25, whiteSpace: 'nowrap',
        }}>{choice}</div>
      </div>
      <LaurelWing flip />
    </div>
  );
}
