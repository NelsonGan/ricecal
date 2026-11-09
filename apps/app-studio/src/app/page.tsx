'use client';

import { useRef, useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { ScreenshotScene } from '../components/ScreenshotScene';
import { IPadScreenshotScene } from '../components/IPadScreenshotScene';
import { DuoScreenshotScene } from '../components/DuoScreenshotScene';
import { FeatureGraphic } from '../components/FeatureGraphic';
import { LandingGraphic } from '../components/LandingGraphic';
import { AppStoreCreativeView } from '../components/AppStoreCreative';
import { UploadModal } from '../components/UploadModal';
import { CreativeUploadModal } from '../components/CreativeUploadModal';
import { DescriptionsView } from '../components/DescriptionsView';
import { getScenes } from '../scenes/sceneData';
import { getIPadScenes } from '../scenes/ipadSceneData';
import { getDuoScenes } from '../scenes/duoSceneData';
import { ALL_LOCALE_CODES, LOCALE_META } from '../scenes/locales';
import { exportSingleScreenshot, exportAllScreenshots, exportAllLocalesScreenshots, exportWatchScreenshots, isAppStoreCreative } from '../utils/export';
import { WATCH_HEIGHT, WATCH_SCREENS, WATCH_WIDTH, watchUrl } from '../data/watchScreens';
import { APP_ICON_URL } from '../utils/upload';

type Locale = string;
type Device = 'phone' | 'duo' | 'ipad' | 'watch' | 'header' | 'search' | 'feature' | 'landing' | 'icon' | 'text';

const DEVICE_META: Record<Device, { label: string; dims: string }> = {
  'phone':   { label: 'iPhone 6.9"',    dims: '1290 × 2796' },
  'duo':     { label: 'iPhone Duo',     dims: '2853 × 2007' },
  'ipad':    { label: 'iPad 12.9"',     dims: '2732 × 2048' },
  'watch':   { label: 'Apple Watch',    dims: `${WATCH_WIDTH} × ${WATCH_HEIGHT}` },
  'header':  { label: 'App Store Header', dims: '3840 × 1646' },
  'search':  { label: 'App Store Search', dims: '3840 × 2560' },
  'feature': { label: 'Feature Graphic', dims: '1024 × 500' },
  'landing': { label: 'Landing Card',   dims: '1200 × 1200' },
  'icon':    { label: 'App Icon',       dims: '512 × 512'   },
  'text':    { label: 'Descriptions',   dims: 'All locales' },
};

/**
 * Views with nothing to rasterize: the descriptions are text, and the icon is
 * a PNG that already exists in the repo. Neither has a locale of its own, and
 * neither has anything to export.
 */
const STATIC_VIEWS: Device[] = ['icon', 'text'];
const isStatic = (d: Device): d is 'icon' | 'text' => STATIC_VIEWS.includes(d);

/**
 * The watch set is native captures in English only, so it exports but has no
 * language to pick: see `src/data/watchScreens.ts`.
 */
const hasLocales = (d: Device) => !isStatic(d) && d !== 'watch';

const ALL: Locale[] = ALL_LOCALE_CODES;

export default function Page() {
  const [locale, setLocale] = useState<Locale>('en');
  const [device, setDevice] = useState<Device>('header');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const sceneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const featureRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLDivElement>(null);
  const creativeRef = useRef<HTMLDivElement>(null);

  const phoneScenes = getScenes(locale);
  const ipadScenes = getIPadScenes(locale);
  const duoScenes = getDuoScenes(locale);
  const scenes = device === 'ipad' ? ipadScenes : device === 'duo' ? duoScenes : phoneScenes;

  const setSceneRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) sceneRefs.current.set(id, el);
    else sceneRefs.current.delete(id);
  }, []);

  const handleExportSingle = useCallback(async (id: string) => {
    const el = sceneRefs.current.get(id);
    // The watch captures download as files, straight from their links.
    if (isStatic(device) || device === 'watch' || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      if (!el) throw new Error('The screenshot is not ready. Select the view again.');
      await exportSingleScreenshot(el, `${locale}-${id}`, device);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [locale, device, exporting]);

  const handleExportAll = useCallback(async () => {
    if (isStatic(device) || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      if (device === 'watch') {
        await exportWatchScreenshots();
        return;
      }
      if (isAppStoreCreative(device)) {
        if (!creativeRef.current) throw new Error('The artwork is not ready.');
        await exportSingleScreenshot(creativeRef.current, `ricecal-app-store-${device}-${locale}`, device);
        return;
      }
      if (device === 'feature') {
        if (!featureRef.current) throw new Error('The graphic is not ready.');
        await exportSingleScreenshot(featureRef.current, `ricecal-feature-graphic-${locale}`, 'feature');
        return;
      }
      if (device === 'landing') {
        if (!landingRef.current) throw new Error('The graphic is not ready.');
        await exportSingleScreenshot(landingRef.current, `ricecal-landing-${locale}`, 'landing');
        return;
      }
      const elements = new Map<string, HTMLElement>();
      for (const scene of scenes) {
        const el = sceneRefs.current.get(scene.id);
        if (!el) throw new Error('The screenshot set is incomplete. Select the view again.');
        elements.set(`${locale}-${scene.id}`, el);
      }
      await exportAllScreenshots(elements, locale, device);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [locale, device, scenes, exporting]);

  const handleExportAllLocales = useCallback(async () => {
    if (!hasLocales(device) || exporting) return;
    const originalLocale = locale;
    setExportError(null);
    setExporting(true);
    try {
      await exportAllLocalesScreenshots(ALL, device, async (loc) => {
        setExportProgress(`${loc} ${ALL.indexOf(loc) + 1}/${ALL.length}`);
        flushSync(() => setLocale(loc));
        await new Promise(r => setTimeout(r, 350));
        const elements = new Map<string, HTMLElement>();
        if (isAppStoreCreative(device)) {
          if (creativeRef.current) elements.set(`ricecal-app-store-${device}-${loc}`, creativeRef.current);
        } else if (device === 'feature') {
          if (featureRef.current) elements.set(`ricecal-feature-graphic-${loc}`, featureRef.current);
        } else if (device === 'landing') {
          if (landingRef.current) elements.set(`ricecal-landing-${loc}`, landingRef.current);
        } else {
          for (const [id, el] of sceneRefs.current) elements.set(id, el);
        }
        const expected = isAppStoreCreative(device) || device === 'feature' || device === 'landing' ? 1 : scenes.length;
        if (elements.size !== expected) throw new Error(`The screenshot set for ${loc} is incomplete.`);
        return elements;
      });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed. Please try again.');
    } finally {
      flushSync(() => setLocale(originalLocale));
      setExporting(false);
      setExportProgress(null);
    }
  }, [device, locale, exporting, scenes.length]);

  const switchDevice = useCallback((next: Device) => {
    setExportError(null);
    setDevice(next);
  }, []);

  const previewWidth = device === 'ipad' || device === 'duo' ? 470 : 268;
  const previewScale = device === 'ipad' ? 470 / 2732 : device === 'duo' ? 470 / 2853 : 268 / 1290;

  const exportLabel = exporting
    ? 'Exporting…'
    : device === 'search' ? 'Export MP4' : device === 'header' ? 'Export JPEG'
    : (device === 'feature' || device === 'landing') ? 'Export PNG' : 'Export ZIP';

  const deviceMeta = DEVICE_META[device];

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0F0D] text-[#F2F5F3]">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-[264px] shrink-0 flex flex-col border-r border-white/[0.06] bg-[#111716] overflow-hidden">

        <div className="flex items-center gap-3 px-5 h-[64px] border-b border-white/[0.06] shrink-0">
          <img
            src="/assets/icons/ricecal-icon.png"
            alt="RiceCal"
            className="w-9 h-9 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-tight">RiceCal</div>
            <div className="text-[10.5px] text-white/30 font-medium tracking-widest uppercase">Studio</div>
          </div>
        </div>

        {/* View nav */}
        <div className="px-3 pt-5 pb-3 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25 px-2 mb-2">View</p>
          <nav className="flex flex-col gap-0.5">
            {(['phone', 'duo', 'ipad', 'watch', 'header', 'search', 'feature', 'landing', 'icon', 'text'] as Device[]).map((d) => (
              <button
                key={d}
                onClick={() => switchDevice(d)}
                aria-pressed={device === d}
                disabled={exporting}
                className={`flex items-center justify-between w-full px-3 h-9 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer ${
                  device === d
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                }`}
              >
                <span>{DEVICE_META[d].label}</span>
                {device === d && (
                  <span className="text-[10px] text-white/25 font-normal tabular-nums">
                    {DEVICE_META[d].dims}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Locale list */}
        {hasLocales(device) && (
          <>
            <div className="mx-3 border-t border-white/[0.05] shrink-0" />
            <div className="flex flex-col min-h-0 flex-1 overflow-hidden px-3 pt-3 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25 px-2 mb-2 shrink-0">
                Language
              </p>
              <div className="overflow-y-auto flex flex-col gap-0.5">
                {ALL.map((l) => {
                  const active = locale === l;
                  const meta = LOCALE_META[l];
                  return (
                    <button
                      key={l}
                      onClick={() => setLocale(l)}
                      aria-pressed={active}
                      disabled={exporting}
                      className={`flex items-center gap-2.5 w-full px-3 h-9 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer shrink-0 ${
                        active
                          ? 'bg-[#2FBF71]/[0.14] text-[#38D07E]'
                          : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-[15px] leading-none shrink-0">{meta.flag}</span>
                      <span className="flex-1 truncate text-left">{meta.label}</span>
                      <span className="text-[10px] font-mono text-white/20 shrink-0">{l}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!hasLocales(device) && <div className="flex-1" />}

        {/* Bottom actions */}
        <div className="p-3 border-t border-white/[0.06] flex flex-col gap-2 shrink-0">
          {exportError && <p role="alert" className="px-2 text-xs text-red-300">{exportError}</p>}
          {device !== 'landing' && device !== 'text' && (
            <button
              onClick={() => setShowUpload(true)}
              disabled={exporting}
              className="flex items-center gap-2.5 w-full px-3.5 h-10 rounded-lg text-[13.5px] font-medium transition-colors cursor-pointer
                text-white/45 hover:text-white/75 hover:bg-white/[0.05]
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v13" />
              </svg>
              Upload to Store
            </button>
          )}
          {/* The Descriptions and App Icon views have nothing to rasterize. */}
          {!isStatic(device) && (
            <>
              <button
                onClick={handleExportAll}
                disabled={exporting}
                className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-[13.5px] font-semibold transition-all cursor-pointer
                  bg-[#2FBF71] hover:bg-[#28AA65] active:bg-[#1B8A4E] text-white
                  shadow-[0_4px_16px_-4px_rgba(47,191,113,0.5)]
                  hover:shadow-[0_6px_20px_-4px_rgba(47,191,113,0.65)]
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <svg
                  className={`w-4 h-4 shrink-0 ${exporting ? 'animate-pulse' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                </svg>
                {exportLabel}
              </button>
              {hasLocales(device) && <button
                onClick={handleExportAllLocales}
                disabled={exporting}
                className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-[13.5px] font-semibold transition-colors cursor-pointer
                  bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg
                  className={`w-4 h-4 shrink-0 ${exporting ? 'animate-pulse' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 3a15 15 0 010 18M12 3a15 15 0 000 18M3 12h18M3.6 8h16.8M3.6 16h16.8M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
                {exportProgress ? `Exporting ${exportProgress}` : `Export All Locales (${ALL.length})`}
              </button>}
            </>
          )}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="h-[60px] flex items-center justify-between px-6 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-white/60 font-medium">{deviceMeta.label}</span>
            <span className="text-white/20">·</span>
            <span className="text-white/30 tabular-nums">{deviceMeta.dims}</span>
            {!isStatic(device) && (
              <>
                <span className="text-white/20">·</span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[11px] text-white/50 font-medium tracking-wide">
                  {device === 'watch' ? 'EN' : locale.toUpperCase()}
                </span>
              </>
            )}
          </div>
          {!isStatic(device) && device !== 'feature' && device !== 'landing' && device !== 'watch' && !isAppStoreCreative(device) && (
            <span className="text-[11px] text-white/20 tabular-nums">{scenes.length} scenes</span>
          )}
          {device === 'watch' && (
            <span className="text-[11px] text-white/20 tabular-nums">{WATCH_SCREENS.length} captures</span>
          )}
          {isAppStoreCreative(device) && <span className="text-[11px] text-white/20">1 asset</span>}
        </header>

        <main className={`flex-1 overflow-y-auto ${device === 'text' ? '' : 'px-8 py-10'}`}>
          {device === 'text' ? (
            <DescriptionsView />
          ) : device === 'icon' ? (
            <div className="max-w-[560px] mx-auto flex flex-col items-center gap-8">
              <img
                src={APP_ICON_URL}
                alt="RiceCal app icon"
                width={256}
                height={256}
                className="w-64 h-64 rounded-[3rem] ring-1 ring-white/[0.08] shadow-2xl"
              />
              <div className="flex flex-col gap-4 text-[13.5px] leading-relaxed text-white/45">
                <p>
                  Play keeps the store icon <span className="text-white/75">per listing</span>, and
                  never reads it from the bundle: the launcher icon inside the AAB does not become
                  the store icon, and changing the icon in Play Console moves the default listing
                  only. Every other locale goes on serving whatever it was last given.
                </p>
                <p>
                  <span className="text-white/75">Upload to Store</span> writes this file to every
                  listing Play holds — not just the locales this tool has copy for, since a listing
                  opened once in Play Console is one the locale map has never written to.
                </p>
                <p>
                  There is no App Store equivalent. Apple reads the icon out of the binary, so this
                  view is Android only.
                </p>
                <p className="font-mono text-[12px] text-white/25">
                  public/assets/icons/play_store_512.png
                </p>
              </div>
            </div>
          ) : device === 'watch' ? (
            <div className="max-w-[1080px] mx-auto flex flex-col gap-8">
              <div className="flex flex-wrap justify-center gap-6">
                {WATCH_SCREENS.map(({ id, label }) => (
                  <div key={id} className="group" style={{ width: WATCH_WIDTH / 2 }}>
                    <div className="flex items-center justify-between mb-2.5 px-0.5">
                      <span className="text-white/25 text-[10px] font-mono tracking-tight">{id}</span>
                      <a
                        href={watchUrl(id)}
                        download={`watch-${id}.png`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity
                          px-2 py-0.5 rounded-md bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.07]
                          text-white/45 hover:text-white text-[10px] font-medium"
                      >
                        PNG
                      </a>
                    </div>
                    <img
                      src={watchUrl(id)}
                      alt={`Apple Watch: ${label}`}
                      width={WATCH_WIDTH / 2}
                      height={WATCH_HEIGHT / 2}
                      className="rounded-[2.2rem] ring-1 ring-white/[0.08] shadow-lg shadow-black/50"
                    />
                  </div>
                ))}
              </div>
              <p className="max-w-[560px] mx-auto text-center text-[13px] leading-relaxed text-white/40">
                Native captures from the watch simulator, uploaded as they are: a frame and a
                headline do not fit on a watch screen. English only; App Store Connect shows
                them in every language that has no watch screenshots of its own.
              </p>
            </div>
          ) : isAppStoreCreative(device) ? (
            <AppStoreCreativeView placement={device} locale={locale} creativeRef={creativeRef} exporting={exporting} />
          ) : device === 'feature' ? (
            <div className="flex justify-center">
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl">
                <FeatureGraphic ref={featureRef} locale={locale} previewScale={0.75} />
              </div>
            </div>
          ) : device === 'landing' ? (
            <div className="flex justify-center">
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl">
                <LandingGraphic ref={landingRef} locale={locale} previewScale={0.6} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {scenes.map((scene) => (
                <div key={scene.id} className="group" style={{ width: previewWidth }}>
                  <div className="flex items-center justify-between mb-2.5 px-0.5">
                    <span className="text-white/25 text-[10px] font-mono tracking-tight">{scene.id}</span>
                    <button
                      onClick={() => handleExportSingle(scene.id)}
                      disabled={exporting}
                      className="opacity-0 group-hover:opacity-100 transition-opacity
                        flex items-center gap-1 px-2 py-0.5 rounded-md
                        bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.07]
                        text-white/45 hover:text-white text-[10px] font-medium cursor-pointer"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                      </svg>
                      PNG
                    </button>
                  </div>
                  <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.07]
                    group-hover:ring-[#2FBF71]/40 transition-all duration-300
                    shadow-lg shadow-black/50
                    group-hover:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]
                    group-hover:-translate-y-0.5">
                    {device === 'ipad' ? (
                      <IPadScreenshotScene
                        scene={scene as ReturnType<typeof getIPadScenes>[number]}
                        previewScale={previewScale}
                        ref={(el) => setSceneRef(scene.id, el)}
                      />
                    ) : device === 'duo' ? (
                      <DuoScreenshotScene
                        scene={scene as ReturnType<typeof getDuoScenes>[number]}
                        previewScale={previewScale}
                        ref={(el) => setSceneRef(scene.id, el)}
                      />
                    ) : (
                      <ScreenshotScene
                        scene={scene as ReturnType<typeof getScenes>[number]}
                        previewScale={previewScale}
                        ref={(el) => setSceneRef(scene.id, el)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {showUpload && device !== 'text' && !isAppStoreCreative(device) && (
        <UploadModal
          device={device}
          activeLocale={locale}
          localeOptions={ALL}
          setLocale={setLocale}
          sceneRefs={sceneRefs}
          featureRef={featureRef}
          onClose={() => setShowUpload(false)}
        />
      )}
      {showUpload && isAppStoreCreative(device) && (
        <CreativeUploadModal placement={device} activeLocale={locale} localeOptions={ALL}
          setLocale={setLocale} creativeRef={creativeRef} onClose={() => setShowUpload(false)} />
      )}
    </div>
  );
}
