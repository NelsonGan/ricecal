import { forwardRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { FEATURE_EXPORT_WIDTH, FEATURE_EXPORT_HEIGHT } from '../utils/export';
import { FEATURE_COPY, screenshotLocale } from '../scenes/locales';
import { C, R } from './tokens';
import { DISPLAY_FONT, BODY_FONT } from './sceneParts';
import { useFitText } from './useFitText';

interface FeatureGraphicProps {
  locale: string;
  previewScale?: number;
}

const W = FEATURE_EXPORT_WIDTH;
const H = FEATURE_EXPORT_HEIGHT;

/** Dense scripts read better a touch larger at this size. */
const DENSE = (locale: string) => ['zh', 'zh-Hant', 'ja', 'ko', 'th'].includes(locale);

export const FeatureGraphic = forwardRef<HTMLDivElement, FeatureGraphicProps>(
  ({ locale, previewScale = 0.75 }, ref) => {
    const copy = FEATURE_COPY[locale] ?? FEATURE_COPY.en;
    const shot = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;
    // The tagline is authored as two lines with a <br/>. Same treatment as a
    // scene headline: shrink rather than wrap into a third.
    const titleSize = DENSE(locale) ? 52 : 44;
    const titleRef = useFitText<HTMLHeadingElement>(titleSize);

    return (
      <div style={{
        width: W * previewScale,
        height: H * previewScale,
        overflow: 'hidden',
        borderRadius: 8,
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
            background: `linear-gradient(122deg, ${C.canvas} 0%, ${C.pandanSoft} 58%, #DFF3E7 100%)`,
            fontFamily: BODY_FONT,
            overflow: 'hidden',
          }}
        >
          {/* Quiet background shapes, in the palette and nothing else */}
          <div style={{
            position: 'absolute', top: -140, right: 180,
            width: 380, height: 380, borderRadius: '50%',
            background: C.pandan, opacity: 0.10,
          }} />
          <div style={{
            position: 'absolute', bottom: -180, left: -70,
            width: 340, height: 340, borderRadius: '50%',
            background: C.kaya, opacity: 0.16,
          }} />

          {/* Left — icon, wordmark, tagline */}
          <div style={{ position: 'absolute', left: 46, top: 54, width: 560, zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 26 }}>
              <img
                src="/assets/icons/ricecal-icon.png"
                alt=""
                crossOrigin="anonymous"
                style={{ width: 86, height: 86, borderRadius: 20, display: 'block' }}
              />
              <span style={{
                fontFamily: DISPLAY_FONT, fontSize: 62, fontWeight: 800,
                color: C.heading, letterSpacing: '-1px',
              }}>RiceCal</span>
            </div>

            <h2 ref={titleRef} style={{
              fontFamily: DISPLAY_FONT,
              fontSize: titleSize,
              fontWeight: 800, color: C.ink,
              lineHeight: 1.1, margin: 0, letterSpacing: '-0.8px',
            }}>
              {copy.titleA}
              <br />
              {copy.titleB.pre}
              <span style={{ color: C.pandanSlab }}>{copy.titleB.hl}</span>
              {copy.titleB.post}
            </h2>

            <div style={{
              display: 'inline-block', marginTop: 22,
              padding: '11px 24px', borderRadius: R.full,
              background: C.surface, border: `2px solid ${C.pandanSoftLine}`,
              fontSize: 21, fontWeight: 700, color: C.pandanSlab,
            }}>{copy.sub}</div>
          </div>

          {/* Right — two phones */}
          <div style={{ position: 'absolute', top: 40, right: 112, zIndex: 4, transform: 'rotate(-6deg)' }}>
            <DeviceFrame screenshot={`${shot}/04-trends.png`} scale={0.63} />
          </div>
          <div style={{ position: 'absolute', top: 30, right: -14, zIndex: 5, transform: 'rotate(7deg)' }}>
            <DeviceFrame screenshot={`${shot}/01-today.png`} scale={0.63} />
          </div>
        </div>
      </div>
    );
  }
);

FeatureGraphic.displayName = 'FeatureGraphic';
