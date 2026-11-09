'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FoodCameraPreview } from './FoodCameraPreview';
import { SceneCanvas, DISPLAY_FONT, BODY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import { C } from './tokens';
import { APP_STORE_COPY } from '../scenes/appStoreCopy';
import { getSearchCreative } from '../data/searchCreatives';
import { APP_STORE_ASSETS, type AppStorePlacement } from '../data/appStoreAssets';
import { AppStorePhonePreview, STORE_PREVIEW } from './AppStorePhonePreview';

export const BACKGROUND_ART = '/assets/app-store/active-park-search-v3.png';
export const HEADER_BACKGROUND_ART = '/assets/app-store/active-park-header-v4.png';

interface Props {
  locale: string;
  placement: AppStorePlacement;
  previewScale?: number;
  showSafeArea?: boolean;
  cropToSafeArea?: boolean;
  animateScan?: boolean;
}

/** Both lines retain their authored break as translated copy gets fitted. */
function CreativeTitle({ text, size, accent, color }: {
  text: string; size: number; accent: string; color: string;
}) {
  const ref = useFitText<HTMLHeadingElement>(size, 0.42);
  const [first, second] = text.split('\n');
  return (
    <h1 ref={ref} data-creative-title style={{
      fontFamily: DISPLAY_FONT, fontSize: size, fontWeight: 800,
      color, lineHeight: 1.06, letterSpacing: '-2px', margin: 0,
      whiteSpace: 'pre-line', width: '100%', minWidth: 0,
    }}>
      {first}{'\n'}<span style={{ color: accent }}>{second}</span>
    </h1>
  );
}

function CreativeBackground({ header }: { header: boolean }) {
  return <img src={header ? HEADER_BACKGROUND_ART : BACKGROUND_ART} alt="" crossOrigin="anonymous" aria-hidden="true"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
      objectFit: 'cover', objectPosition: 'center' }} />;
}

function ProductPageHeader() {
  const { safe } = APP_STORE_ASSETS.header;
  return <div data-creative-essential style={{ position: 'absolute', left: safe.x, top: safe.y,
    width: safe.width, height: safe.height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div data-header-brand style={{ display: 'flex', alignItems: 'center',
      transform: 'translateY(-70px)' }}>
      <h1 data-creative-title style={{ fontFamily: DISPLAY_FONT, fontSize: 460, fontWeight: 800,
        lineHeight: 1, letterSpacing: '-6px', color: C.heading, margin: 0,
        transform: 'translateY(32px)' }}>RiceCal</h1>
    </div>
  </div>;
}

/** One localized food camera scene; Header retains its outdoor branding. */
export const AppStoreCreative = forwardRef<HTMLDivElement, Props>(
  ({ locale, placement, previewScale = 0.22, showSafeArea = false, cropToSafeArea = false,
    animateScan = false }, ref) => {
    const spec = APP_STORE_ASSETS[placement];
    const { width, height } = spec;
    const viewport = cropToSafeArea ? spec.safe : { x: 0, y: 0, width, height };
    const copy = APP_STORE_COPY[locale] ?? APP_STORE_COPY.en;
    const header = placement === 'header';
    const { food, foodId } = getSearchCreative(locale);

    return (
      <div style={{ position: 'relative', width: viewport.width * previewScale,
        height: viewport.height * previewScale, flexShrink: 0 }}>
        <SceneCanvas ref={ref} width={width} height={height} previewScale={previewScale}
          viewport={viewport} background={C.canvas} previewRadius={0}>
          <CreativeBackground header={header} />
          {header ? <ProductPageHeader /> : (
            <>
              <div data-search-phone data-search-food={foodId} data-search-locale={locale} style={{ position: 'absolute', left: 2500, top: 208 }}>
                <FoodCameraPreview food={food} copy={copy} scale={3} animated={animateScan} />
              </div>
              <div data-creative-essential style={{ position: 'absolute', left: 560, top: 650, width: 1660,
                height: 1160, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 100 }}>
                <CreativeTitle text={copy.search} size={310} color={C.heading} accent={C.pandanSlab} />
              </div>
            </>
          )}
        </SceneCanvas>
        {showSafeArea && !cropToSafeArea && <ArtSafeArea placement={placement} scale={previewScale} />}
      </div>
    );
  },
);
AppStoreCreative.displayName = 'AppStoreCreative';

/** A sibling of the export canvas, so guides can never be baked into a file. */
function ArtSafeArea({ placement, scale }: { placement: AppStorePlacement; scale: number }) {
  const { safe } = APP_STORE_ASSETS[placement];
  return <div aria-hidden="true" style={{
    position: 'absolute', left: safe.x * scale, top: safe.y * scale,
    width: safe.width * scale, height: safe.height * scale,
    border: '1px dashed #23846A', pointerEvents: 'none', boxSizing: 'border-box',
  }}><span style={{ position: 'absolute', top: -22, left: 0, font: '10px system-ui',
    background: '#23846A', color: '#fff', borderRadius: 3, padding: '3px 6px' }}>Apple art safe area</span></div>;
}

export function AppStoreCreativeView({ placement, locale, creativeRef, exporting = false }: {
  placement: AppStorePlacement; locale: string; creativeRef: RefObject<HTMLDivElement | null>; exporting?: boolean;
}) {
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [previewMode, setPreviewMode] = useState<'store' | 'full' | 'safe' | 'card'>('store');
  const [availableWidth, setAvailableWidth] = useState(880);
  const [animateScan, setAnimateScan] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const spec = APP_STORE_ASSETS[placement];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const activeMode = (placement === 'header' && previewMode === 'card')
    || (placement === 'search' && previewMode === 'safe') ? 'full' : previewMode;
  const cropToSafeArea = activeMode === 'safe';
  const showStorePreview = activeMode === 'store';
  const previewWidth = cropToSafeArea ? spec.safe.width : spec.width;
  const scale = showStorePreview
    ? (placement === 'header' ? STORE_PREVIEW.screenWidth : STORE_PREVIEW.searchCardWidth) / spec.width
    : Math.min(availableWidth / previewWidth,
      activeMode === 'card' ? STORE_PREVIEW.searchCardWidth / spec.width : cropToSafeArea ? 0.42 : 0.26);
  const previewOptions = [
    { mode: 'store' as const, label: 'App Store preview' },
    { mode: 'full' as const, label: 'Full image' },
    ...(placement === 'header' ? [{ mode: 'safe' as const, label: 'Safe area crop' }] : []),
    ...(placement === 'search' ? [{ mode: 'card' as const, label: 'Search card' }] : []),
  ];
  const creative = <AppStoreCreative placement={placement} locale={locale} ref={creativeRef} previewScale={scale}
    animateScan={animateScan}
    showSafeArea={placement === 'header' && showSafeArea && !showStorePreview} cropToSafeArea={cropToSafeArea} />;

  return (
    <div ref={containerRef} className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#38D07E] font-semibold mb-2">App Store creative</p>
          <h2 className="text-[22px] tracking-tight font-semibold">{placement === 'header'
            ? 'Introduce RiceCal.' : 'Make every meal count.'}</h2>
          <p className="text-[13px] text-white/40 mt-2">{placement === 'header'
            ? 'A centered RiceCal wordmark over a calm outdoor scene.'
            : 'One local favorite in the camera, automatically matched to the selected language.'}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg bg-white/[0.05] p-1" role="group" aria-label="Preview framing">
          {previewOptions.map(({ mode, label }) => (
            <button key={mode} type="button" onClick={() => setPreviewMode(mode)} aria-pressed={activeMode === mode} disabled={exporting}
              className={`text-[12px] px-3 py-2 rounded-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${activeMode === mode
                ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/75'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {placement === 'search' && <p className="text-[12px] text-white/50">
        {getSearchCreative(locale).food.name} · {getSearchCreative(locale).country}
      </p>}
      {showStorePreview ? (
        <AppStorePhonePreview placement={placement} locale={locale} availableWidth={availableWidth}>
          {creative}
        </AppStorePhonePreview>
      ) : (
        <div style={{ width: previewWidth * scale }} className="mx-auto flex justify-center overflow-hidden rounded-2xl ring-1 ring-white/[0.08] bg-[#F6F8F7] shadow-2xl">
          {creative}
        </div>
      )}
      <div className="flex flex-wrap justify-between items-center gap-3 text-[12px] text-white/40">
        {placement === 'search' && <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={animateScan} onChange={event => setAnimateScan(event.target.checked)}
            disabled={exporting} className="accent-[#38D07E]" />Animate camera preview
        </label>}
        {placement === 'header' && !showStorePreview && <label className={`flex items-center gap-2 ${cropToSafeArea || exporting ? 'text-white/25' : 'cursor-pointer'}`}>
          <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)}
            disabled={cropToSafeArea || exporting} className="accent-[#38D07E]" />
          Show Apple safe area
        </label>}
        <p>{showStorePreview ? 'iPhone preview based on your App Store Connect examples.'
          : `${activeMode === 'card' ? '353 × 235 card preview. ' : ''}Exports contain the full image, without guides.`}</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] p-4 text-[12px] leading-relaxed text-white/40">
        {placement === 'search'
          ? 'Export MP4 and Upload to Store use the same 7.2-second camera scan, at 1920 × 1280 and 30 fps.'
          : `Export JPEG saves an opaque ${spec.width} × ${spec.height} image. Upload to Store assigns it to the Header field.`}
        {' '}The phone preview is an approximation. Use Apple’s Preview to check final placement.
        {' '}<a href="/app-store-design-plan.html" target="_blank" rel="noreferrer"
          className="text-white/65 hover:text-white underline underline-offset-4">Design plan</a>
      </div>
    </div>
  );
}
