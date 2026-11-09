'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DeviceType } from '../utils/export';
import { shouldCommitAndroidEdit } from '../utils/uploadPolicy.mjs';
import {
  checkServer, captureCurrentView,
  uploadIOSLocale, startAndroidSession, uploadAndroidLocale, commitAndroidSession,
  appIconSize, startAndroidIconSession, uploadAndroidIcon, PLAY_ICON_SIZE, APP_ICON_URL,
} from '../utils/upload';
import type { ServerStatus, UploadDevice } from '../utils/upload';
import { loadWatchScreenshots } from '../data/watchScreens';

// ── Types ─────────────────────────────────────────────────────────────────────

const MAX_UPLOAD_CONCURRENCY = 6;

type Platform = 'ios' | 'android';
type Scope    = 'current' | 'all';
type LogType  = 'info' | 'success' | 'error' | 'dim' | 'head';

interface LogLine {
  ts: string;
  text: string;
  type: LogType;
}

interface Props {
  device: UploadDevice;
  activeLocale: string;
  localeOptions: string[];
  setLocale: (l: string) => void;
  sceneRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  featureRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

/**
 * Which stores an asset can go to.
 *
 * The icon is Android-only, and not for want of an API: the App Store reads an
 * app's icon out of the binary, so there is no listing asset to send. On Play
 * the icon is a listing asset like any screenshot, kept per locale. The watch
 * set is App Store only: RiceCal has no Wear OS app.
 */
function platformsFor(device: UploadDevice): Platform[] {
  // iPhone Duo is Apple's, and Play has no gallery for a foldable phone.
  if (device === 'watch' || device === 'duo') return ['ios'];
  return device === 'feature' || device === 'icon' ? ['android'] : ['ios', 'android'];
}

function assetLabel(device: UploadDevice): string {
  if (device === 'ipad')    return 'iPad';
  if (device === 'duo')     return 'iPhone Duo';
  if (device === 'feature') return 'Feature Graphic';
  if (device === 'icon')    return 'App Icon';
  if (device === 'watch')   return 'Apple Watch';
  return 'iPhone';
}

function now() {
  return new Date().toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UploadModal({
  device, activeLocale, localeOptions, setLocale, sceneRefs, featureRef, onClose,
}: Props) {
  const available = platformsFor(device);
  const [platform, setPlatform] = useState<Platform>(available[0]);
  const [scope, setScope]       = useState<Scope>('all');
  const [server, setServer]     = useState<ServerStatus | null>(null);
  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const [log, setLog]           = useState<LogLine[]>([]);
  /** Play's own listing locales, which is what "all" means for the icon. */
  const [iconLocales, setIconLocales] = useState<string[] | null>(null);
  const abortRef  = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { checkServer().then(setServer); }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  const serverReady = server?.online && (platform === 'ios' ? server.ios : server.android);

  const addLog = useCallback((text: string, type: LogType = 'info', replace = false) => {
    const ts = now();
    setLog(prev => {
      if (replace && prev.length > 0) {
        return [...prev.slice(0, -1), { ts: prev[prev.length - 1].ts, text, type }];
      }
      return [...prev, { ts, text, type }];
    });
  }, []);

  const handleIconUpload = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setLog([]);

    let sessionId: string | undefined;
    let successCount = 0;
    let failureCount = 0;

    try {
      const size = await appIconSize();
      if (size.width !== PLAY_ICON_SIZE || size.height !== PLAY_ICON_SIZE) {
        throw new Error(
          `Play takes the icon at ${PLAY_ICON_SIZE} × ${PLAY_ICON_SIZE}; ` +
          `${APP_ICON_URL} is ${size.width} × ${size.height}`,
        );
      }

      addLog('Opening Play Store edit session…', 'dim');
      const session = await startAndroidIconSession();
      sessionId = session.sessionId;
      const locales = session.locales;
      setIconLocales(locales);
      addLog('Edit session started', 'dim');
      if (!locales.length) throw new Error('Play holds no listing for this app to put an icon on');
      addLog(`Uploading the app icon to ${locales.length} Play listings`, 'head');

      // Nothing to render per locale, so this is a plain worker pool over the
      // listing list rather than the capture-then-upload pipeline below.
      const queue = [...locales];
      const worker = async () => {
        while (queue.length && !abortRef.current) {
          const playLocale = queue.shift()!;
          try {
            await uploadAndroidIcon(sessionId!, playLocale);
            successCount++;
            addLog(`[${playLocale}] ✓ icon uploaded  (${successCount}/${locales.length})`, 'success');
          } catch (err) {
            failureCount++;
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`[${playLocale}] ✗ ${msg}`, 'error');
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(MAX_UPLOAD_CONCURRENCY, locales.length) }, worker),
      );

      // An uncommitted edit never reached the store, so a cancelled or partly
      // failed run is left uncommitted rather than committing half a change.
      if (abortRef.current) {
        addLog('Cancelled — the edit was never committed, nothing changed.', 'dim');
        return;
      }
      if (failureCount) {
        addLog(`${failureCount} listing(s) failed — not committing, nothing changed.`, 'error');
        return;
      }

      addLog('Committing Play Store edit…', 'dim');
      await commitAndroidSession(sessionId);
      addLog(`Edit committed — the icon is on all ${successCount} Play listings`, 'success');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, [addLog]);

  /**
   * The watch set is files, not scenes, and English only: App Store Connect
   * shows the primary language's watch screenshots in every localization
   * without its own, so one upload covers the listing.
   */
  const handleWatchUpload = useCallback(async () => {
    setRunning(true);
    setDone(false);
    setLog([]);
    try {
      addLog('Uploading Apple Watch screenshots to App Store Connect', 'head');
      const screenshots = await loadWatchScreenshots();
      addLog(`[en] Loaded ${screenshots.length} captures`, 'dim');
      const result = await uploadIOSLocale('watch', 'en', screenshots);
      if (result.skipped) throw new Error('English has no App Store locale');
      const versionNote = result.version ? ` → v${result.version}` : '';
      addLog(`[en] ✓ ${screenshots.length} uploaded${versionNote}`, 'success');
      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, 'error');
    } finally {
      setRunning(false);
    }
  }, [addLog]);

  const handleUpload = useCallback(async () => {
    if (!serverReady || running) return;
    if (device === 'icon') { void handleIconUpload(); return; }
    if (device === 'watch') { void handleWatchUpload(); return; }

    // Narrowed once, here: every closure below rasterizes a scene, which the
    // icon — a file on disk — is not.
    const rasterDevice: DeviceType = device;

    const originalLocale = activeLocale;
    const locales = scope === 'current' ? [activeLocale] : localeOptions;
    const storeName = platform === 'ios' ? 'App Store Connect' : 'Google Play';

    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setLog([]);

    addLog(`Starting ${platform.toUpperCase()} upload — ${locales.length} locale${locales.length !== 1 ? 's' : ''}`, 'head');
    addLog(`Uploading with concurrency ${MAX_UPLOAD_CONCURRENCY}`, 'dim');

    let androidSessionId: string | undefined;
    let successCount = 0;
    let failureCount = 0;
    const activeUploads = new Set<Promise<void>>();

    const startUpload = (loc: string, screenshots: Awaited<ReturnType<typeof captureCurrentView>>) => {
      const task = async () => {
        addLog(`[${loc}] Uploading to ${storeName}…`);

        try {
          if (platform === 'ios') {
            const result = await uploadIOSLocale(rasterDevice, loc, screenshots);
            if (result.skipped) {
              addLog(`[${loc}] ⚠ skipped — locale not in ASC version`, 'dim');
              return;
            }
            const versionNote = result.version ? ` → v${result.version}` : '';
            successCount++;
            addLog(`[${loc}] ✓ ${screenshots.length} uploaded${versionNote}  (${successCount}/${locales.length})`, 'success');
            return;
          }

          const result = await uploadAndroidLocale(androidSessionId!, loc, screenshots);
          if (result.skipped) {
            addLog(`[${loc}] No store locale, skipped`, 'dim');
            return;
          }
          successCount++;
          // Report what the server actually sent — Play caps the set, so this
          // can be fewer than we captured.
          const dropNote = result.dropped?.length
            ? `  (${result.dropped.length} over Play's limit, skipped)`
            : '';
          // Tablet art goes to two galleries, and saying so is the only way to
          // tell 7 uploads from 14.
          const where = (result.galleries?.length ?? 1) > 1
            ? ` to ${result.galleries!.join(' and ')}`
            : '';
          addLog(`[${loc}] ✓ ${result.count} screenshots uploaded${where}${dropNote}  (${successCount}/${locales.length})`, 'success');
        } catch (err) {
          failureCount++;
          const msg = err instanceof Error ? err.message : String(err);
          addLog(`[${loc}] ✗ ${msg}`, 'error');
        }
      };

      const promise = task().finally(() => {
        activeUploads.delete(promise);
      });

      activeUploads.add(promise);
      return promise;
    };

    try {
      if (platform === 'android') {
        addLog('Opening Play Store edit session…', 'dim');
        androidSessionId = await startAndroidSession(rasterDevice);
        addLog('Edit session started', 'dim');
      }

      for (let i = 0; i < locales.length; i++) {
        const loc = locales[i];
        if (abortRef.current) { addLog('Cancelled.', 'dim'); break; }

        addLog(`[${loc}] Generating…`, 'info');
        flushSync(() => setLocale(loc));
        await new Promise(r => setTimeout(r, 350));

        const screenshots = await captureCurrentView(
          rasterDevice, loc, sceneRefs.current, featureRef.current ?? null,
          (cur, total) => addLog(`[${loc}] Generating ${cur} / ${total}`, 'dim', true),
        );

        if (!screenshots.length) {
          failureCount++;
          addLog(`[${loc}] Nothing to capture — skipped`, 'error', true);
          continue;
        }

        addLog(`[${loc}] Captured ${screenshots.length} screenshots`, 'dim', true);
        startUpload(loc, screenshots);

        if (activeUploads.size >= MAX_UPLOAD_CONCURRENCY) {
          await Promise.race(activeUploads);
        }
      }

      await Promise.allSettled([...activeUploads]);

      if (androidSessionId && shouldCommitAndroidEdit(abortRef.current, failureCount, successCount)) {
        addLog('Committing Play Store edit…', 'dim');
        await commitAndroidSession(androidSessionId);
        addLog('Edit committed, changes are live in Play Console', 'success', true);
      } else if (androidSessionId) {
        addLog('The edit was not committed. Store listings are unchanged.', 'error');
      }

      if (!abortRef.current) {
        const type = failureCount ? 'error' : 'success';
        addLog(`Done — ${successCount} uploaded, ${failureCount} failed`, type);
        setDone(failureCount === 0 && successCount > 0);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`Error: ${msg}`, 'error');
    } finally {
      flushSync(() => setLocale(originalLocale));
      setRunning(false);
    }
  }, [serverReady, running, platform, scope, device, activeLocale, localeOptions, setLocale, sceneRefs, featureRef, addLog, handleIconUpload, handleWatchUpload]);

  const handleCancel = () => { abortRef.current = true; };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [running, onClose]);

  const localeCount = device === 'watch' || scope === 'current' ? 1 : localeOptions.length;
  /** What the header and the button count. The icon counts Play's listings. */
  const targetCount = device === 'icon' ? iconLocales?.length ?? null : localeCount;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <div className="relative w-[580px] max-h-[90vh] flex flex-col rounded-2xl
        bg-[#0f0f1a] border border-white/[0.08]
        shadow-[0_32px_80px_-8px_rgba(0,0,0,0.8)]">

        {/* Header */}
        <div className="flex items-start justify-between px-8 pt-7 pb-6 border-b border-white/[0.06]">
          <div>
            <h2 className="text-[17px] font-semibold text-white leading-tight">Upload to Store</h2>
            <p className="text-[13px] text-white/35 mt-1.5">
              {assetLabel(device)} · {device === 'icon'
                ? targetCount === null ? 'every Play listing' : `${targetCount} Play listings`
                : device === 'watch' ? 'English, shown in every language'
                : `${localeCount} locale${localeCount !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={onClose} disabled={running}
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12]
              text-white/40 hover:text-white transition-all flex items-center justify-center
              disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer mt-0.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings */}
        <div className="px-8 py-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-white/[0.06]">

          {/* Platform */}
          {available.length > 1 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Platform</span>
              <div className="flex gap-2">
                {(['ios', 'android'] as Platform[]).map(p => (
                  <button
                    key={p}
                    onClick={() => !running && setPlatform(p)}
                    disabled={running}
                    className={`flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium transition-all cursor-pointer
                      ${platform === p
                        ? 'bg-[#2FBF71] text-white'
                        : 'bg-white/[0.05] text-white/50 hover:text-white hover:bg-white/[0.09]'}
                      disabled:cursor-not-allowed`}
                  >
                    {p === 'ios'
                      ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                      : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.5-3.08-.77-4.87-.77-1.79 0-3.43.27-4.87.77L4.85 5.67c-.18-.28-.54-.37-.83-.22-.29.16-.42.54-.26.85l1.84 3.18C2.63 11.46 1 14.3 1 17.5h22c0-3.2-1.63-6.04-5.4-8.02zm-9.1 4.52c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1zm7 0c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1z"/></svg>
                    }
                    {p === 'ios' ? 'iOS' : 'Android'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scope. The icon has none: one file, every listing Play holds. */}
          {device !== 'feature' && device !== 'icon' && device !== 'watch' && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Scope</span>
              <div className="flex gap-2">
                {(['current', 'all'] as Scope[]).map(s => (
                  <button
                    key={s}
                    onClick={() => !running && setScope(s)}
                    disabled={running}
                    className={`h-9 px-4 rounded-lg text-[13px] font-medium transition-all cursor-pointer
                      ${scope === s
                        ? 'bg-white/[0.12] text-white'
                        : 'bg-white/[0.04] text-white/45 hover:text-white hover:bg-white/[0.08]'}
                      disabled:cursor-not-allowed`}
                  >
                    {s === 'current' ? `Current (${activeLocale})` : `All (${localeOptions.length})`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Server status */}
          <div className="ml-auto flex items-center gap-2">
            {server === null ? (
              <span className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
            ) : serverReady ? (
              <span className="w-2 h-2 rounded-full bg-[#2FBF71]" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
            <span className="text-[12px] text-white/35">
              {server === null ? 'checking…'
                : !server.online ? 'offline'
                : server.detail?.[platform] ?? (serverReady ? 'ready' : 'not configured')}
            </span>
            <button
              onClick={() => { setServer(null); checkServer().then(setServer); }}
              className="text-white/25 hover:text-white/55 transition-colors cursor-pointer"
              title="Re-check"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115 0M20 15a9 9 0 01-15 0" />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal log */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#080810] mx-5 my-5 rounded-xl
          border border-white/[0.06] font-mono text-[12.5px] leading-relaxed">
          {log.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[140px] text-white/20 text-[13px] font-mono">
              {serverReady
                ? 'Ready — press Upload to start'
                : server?.online
                  ? server.detail?.[platform] ?? `${platform.toUpperCase()} is not ready`
                  : 'Start the dev server'}
            </div>
          ) : (
            <div className="p-5 flex flex-col gap-1">
              {log.map((line, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <span className="text-white/20 shrink-0 tabular-nums">{line.ts}</span>
                  <span className={logColor(line.type)}>{line.text}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="px-5 pb-5">
          {!running ? (
            <button
              onClick={handleUpload}
              disabled={!serverReady || done}
              className="w-full h-12 rounded-xl font-semibold text-[14px] transition-all cursor-pointer
                bg-[#2FBF71] hover:bg-[#28AA65] active:bg-[#1B8A4E] text-white
                shadow-[0_8px_24px_-4px_rgba(47,191,113,0.4)]
                hover:shadow-[0_12px_32px_-4px_rgba(47,191,113,0.55)]
                hover:-translate-y-0.5
                disabled:opacity-35 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
            >
              {done
                ? '✓ Upload complete — close when ready'
                : device === 'icon'
                  ? targetCount === null
                    ? 'Upload app icon → every Play listing'
                    : `Upload app icon → ${targetCount} Play listing${targetCount === 1 ? '' : 's'}`
                  : device === 'watch'
                    ? 'Upload Apple Watch screenshots → App Store'
                    : `Upload ${localeCount} locale${localeCount !== 1 ? 's' : ''} → ${platform === 'ios' ? 'App Store' : 'Play Store'}`}
            </button>
          ) : (
            <button
              onClick={handleCancel}
              className="w-full h-12 rounded-xl font-semibold text-[14px] transition-all cursor-pointer
                bg-white/[0.05] hover:bg-white/[0.09] text-white/50 hover:text-white"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Log colour helper ─────────────────────────────────────────────────────────

function logColor(type: LogType) {
  switch (type) {
    case 'head':    return 'text-white font-semibold';
    case 'success': return 'text-[#38D07E]';
    case 'error':   return 'text-red-400';
    case 'dim':     return 'text-white/35';
    default:        return 'text-white/70';
  }
}
