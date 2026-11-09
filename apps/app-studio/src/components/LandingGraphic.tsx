import { forwardRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { LANDING_EXPORT_WIDTH, LANDING_EXPORT_HEIGHT } from '../utils/export';
import { LANDING_COPY, screenshotLocale } from '../scenes/locales';
import { C, R, slab } from './tokens';
import { DISPLAY_FONT, BODY_FONT, renderHeadline } from './sceneParts';
import { useFitLines } from './useFitText';
import { Blob, Pandan, Grains } from './flora';

interface LandingGraphicProps {
  locale: string;
  previewScale?: number;
}

const W = LANDING_EXPORT_WIDTH;
const H = LANDING_EXPORT_HEIGHT;

/**
 * A square card for the website and for social. One sentence, one phone, the
 * icon and the domain — nothing that needs reading twice at thumbnail size.
 */
export const LandingGraphic = forwardRef<HTMLDivElement, LandingGraphicProps>(
  ({ locale, previewScale = 0.6 }, ref) => {
    const copy = LANDING_COPY[locale] ?? LANDING_COPY.en;
    const shot = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;
    // Three lines of title and two of subtitle is what fits above the phone.
    const titleRef = useFitLines<HTMLHeadingElement>(86, 3);
    const subRef = useFitLines<HTMLParagraphElement>(38, 2);

    return (
      <div style={{
        width: W * previewScale,
        height: H * previewScale,
        overflow: 'hidden',
        borderRadius: 12,
        flexShrink: 0,
        position: 'relative',
      }}>
        <div
          ref={ref}
          style={{
            width: W,
            height: H,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            background: `linear-gradient(150deg, ${C.canvas} 0%, ${C.pandanSoft} 62%, #DDF2E6 100%)`,
            fontFamily: BODY_FONT,
            overflow: 'hidden',
          }}
        >
          <Blob x={-160} y={720} size={520} color={C.pandan} opacity={0.12} rotate={18} />
          <Pandan x={880} y={700} size={420} color={C.pandanSoftLine} opacity={0.75} rotate={16} flip />
          <Grains x={940} y={90} size={190} color={C.kayaSoftLine} opacity={0.9} rotate={-18} />

          {/* Icon + wordmark */}
          <div style={{
            position: 'absolute', top: 74, left: 80,
            display: 'flex', alignItems: 'center', gap: 22, zIndex: 6,
          }}>
            <img
              src="/assets/icons/ricecal-icon.png"
              alt=""
              crossOrigin="anonymous"
              style={{ width: 96, height: 96, borderRadius: 24, display: 'block' }}
            />
            <span style={{
              fontFamily: DISPLAY_FONT, fontSize: 62, fontWeight: 800,
              color: C.heading, letterSpacing: '-1px',
            }}>RiceCal</span>
          </div>

          {/* Headline + one line under it */}
          <div style={{ position: 'absolute', top: 236, left: 80, right: 80, zIndex: 6 }}>
            <h1 ref={titleRef} style={{
              fontFamily: DISPLAY_FONT,
              fontSize: 86, fontWeight: 800, color: C.ink,
              lineHeight: 1.1, margin: 0, letterSpacing: '-1.5px',
            }}>
              {renderHeadline(copy.title, copy.highlight, C.pandanSlab)}
            </h1>
            <p ref={subRef} style={{
              fontSize: 38, fontWeight: 600, color: C.body,
              lineHeight: 1.35, margin: '28px 0 0', maxWidth: 900,
            }}>{copy.subtitle}</p>
          </div>

          {/* The phone, half in shot at the bottom */}
          <div style={{
            position: 'absolute', bottom: -300, left: 96, zIndex: 5,
            transform: 'rotate(-5deg)',
          }}>
            <DeviceFrame screenshot={`${shot}/01-today.png`} scale={1.28} />
          </div>

          <div style={{
            position: 'absolute', right: 80, bottom: 84, zIndex: 7,
            display: 'inline-flex', alignItems: 'center',
            padding: '20px 38px', borderRadius: R.full,
            background: C.surface, border: `3px solid ${C.pandanSoftLine}`,
            boxShadow: slab(C.lineStrong, 7),
            fontFamily: DISPLAY_FONT, fontSize: 36, fontWeight: 800, color: C.pandanSlab,
          }}>ricecal.app</div>
        </div>
      </div>
    );
  }
);

LandingGraphic.displayName = 'LandingGraphic';
