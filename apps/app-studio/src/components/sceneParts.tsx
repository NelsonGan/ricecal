import { forwardRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { C, R } from './tokens';

/**
 * Pieces shared by the iPhone and iPad screenshot scenes. The two lay their
 * device and headline out differently, so only the genuinely common chrome
 * lives here.
 *
 * Fonts match the app: Baloo 2 for numbers, headings and buttons; Nunito for
 * body and labels.
 */

const DISPLAY_FONT = "'Baloo 2', 'Nunito', system-ui, sans-serif";
const BODY_FONT = "'Nunito', system-ui, sans-serif";

export { DISPLAY_FONT, BODY_FONT };

/**
 * Renders `headline`, wrapping the first occurrence of `highlight` in the
 * accent colour with a rounded underline swash. Returns the plain string when
 * there is no highlight to apply — a translation that dropped the phrase still
 * renders, just without the swash.
 *
 * The swash is sized in `em` rather than px because `useFitText` shrinks the
 * headline after render to keep a long translation on its authored lines. In
 * px the rule stayed 16px thick under type that had dropped to 94, and read as
 * a much heavier underline in German than in English.
 */
export function renderHeadline(
  headline: string,
  highlight: string | undefined,
  accent: string,
): ReactNode {
  if (!highlight || !headline.includes(highlight)) return headline;

  const idx = headline.indexOf(highlight);
  return (
    <>
      {headline.slice(0, idx)}
      <span style={{ position: 'relative', display: 'inline-block', color: accent }}>
        {highlight}
        <span style={{
          position: 'absolute', left: '1%', right: '1%', bottom: '-0.09em',
          height: '0.135em', borderRadius: R.full, background: accent, opacity: 0.85,
        }} />
      </span>
      {headline.slice(idx + highlight.length)}
    </>
  );
}

interface SceneCanvasProps {
  width: number;
  height: number;
  previewScale: number;
  background: string;
  previewRadius?: number;
  viewport?: { x: number; y: number; width: number; height: number };
  children: ReactNode;
}

/**
 * Full-resolution export surface shown scaled down for preview. The outer div
 * is the preview-sized viewport; the inner div is the real export target and
 * receives the forwarded ref, so rasterization always captures full size.
 * An optional viewport crops only the preview, keeping export coordinates intact.
 */
export const SceneCanvas = forwardRef<HTMLDivElement, SceneCanvasProps>(
  ({ width, height, previewScale, background, previewRadius = 12, viewport, children }, ref) => (
    <div
      style={{
        width: (viewport?.width ?? width) * previewScale,
        height: (viewport?.height ?? height) * previewScale,
        overflow: 'hidden',
        borderRadius: previewRadius,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        ref={ref}
        style={{
          width,
          height,
          transform: viewport
            ? `translate(${-viewport.x * previewScale}px, ${-viewport.y * previewScale}px) scale(${previewScale})`
            : `scale(${previewScale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          background,
          fontFamily: BODY_FONT,
          fontSize: 16,
          // Store preview typography must not change the authored export layout.
          lineHeight: 1.5,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  ),
);
SceneCanvas.displayName = 'SceneCanvas';

interface SceneGlowsProps {
  accent: string;
  /** Top-right glow: inset from the top/right edges, and diameter. */
  top: { inset: number; size: number };
  /** Bottom-left glow: insets from the bottom/left edges, and diameter. */
  bottom: { bottomInset: number; leftInset: number; size: number };
}

/**
 * Soft accent radial glows plus an airy top light, for depth. Positions are
 * hand-tuned per scene and passed in explicitly — deriving them from one size
 * would shift the composition.
 */
export function SceneGlows({ accent, top, bottom }: SceneGlowsProps) {
  const radial = `radial-gradient(circle, ${accent} 0%, transparent 68%)`;
  const glow: CSSProperties = { position: 'absolute', borderRadius: '50%', background: radial, zIndex: 1 };

  return (
    <>
      <div style={{
        ...glow,
        top: -top.inset, right: -top.inset,
        width: top.size, height: top.size, opacity: 0.16,
      }} />
      <div style={{
        ...glow,
        bottom: -bottom.bottomInset, left: -bottom.leftInset,
        width: bottom.size, height: bottom.size, opacity: 0.12,
      }} />
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 34%)',
      }} />
    </>
  );
}

interface DeviceScreenProps {
  screenshot: string;
  width: number;
  height: number;
  borderRadius: number;
}

/** The screen itself: a clipped, cover-fitted screenshot. */
export function DeviceScreen({ screenshot, width, height, borderRadius }: DeviceScreenProps) {
  return (
    <div style={{ width, height, borderRadius, overflow: 'hidden', background: C.canvas }}>
      <img
        src={screenshot}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        crossOrigin="anonymous"
      />
    </div>
  );
}
