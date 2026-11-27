/**
 * Scene 02: the brand panel, the one iPhone scene without a phone. It sits in
 * the opening panorama between Today and the workout logger and draws its own
 * header, so the scene has no headline and only the background comes from
 * ScreenshotScene. The layout follows Money2Time's second frame.
 *
 * Top to bottom: the headline beside the app's rice bowl (its splash art), the
 * store rating in laurels, and one card for each of the five ways to log.
 */

import { C } from './tokens';
import { DISPLAY_FONT, renderHeadline } from './sceneParts';
import { FeatureRow, RatingCard } from './decorations';
import { useFitText } from './useFitText';
import type { PhoneStrings } from '../scenes/locales';

export function BrandPanel({ t }: { t: PhoneStrings['panel'] }) {
  const headlineRef = useFitText<HTMLHeadingElement>(118, 0.55);
  // Every locale writes the title as two lines; the second takes the accent.
  const highlight = t.title.split('\n')[1];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      boxSizing: 'border-box', padding: '150px 75px 0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Fixed height, so the rating and the cards sit at the same y in every
          locale whatever the headline's fitted size. */}
      <div style={{
        width: 1140, height: 400, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', gap: 24,
      }}>
        <h1 ref={headlineRef} style={{
          flex: 1, minWidth: 0,
          fontSize: 118, fontWeight: 800, color: C.heading,
          lineHeight: 1.08, margin: 0, textAlign: 'left',
          whiteSpace: 'pre-line', letterSpacing: '-1.5px',
          fontFamily: DISPLAY_FONT,
        }}>{renderHeadline(t.title, highlight, C.pandanSlab)}</h1>
        <img
          src="/assets/icons/rice-bowl.png" alt=""
          crossOrigin="anonymous"
          style={{ width: 330, height: 'auto', flexShrink: 0, display: 'block' }}
        />
      </div>

      <div style={{ marginTop: 36 }}>
        <RatingCard users={t.stats.usersChoice} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginTop: 44 }}>
        <FeatureRow icon="camera" tone="pandan" title={t.snap.t} body={t.snap.b} />
        <FeatureRow icon="sparkle" tone="kaya" title={t.describe.t} body={t.describe.b} />
        <FeatureRow icon="barcode" tone="water" title={t.scan.t} body={t.scan.b} />
        <FeatureRow icon="search" tone="hibiscus" title={t.search.t} body={t.search.b} />
        <FeatureRow icon="guide-book" tone="teh" title={t.recipes.t} body={t.recipes.b} />
      </div>
    </div>
  );
}
