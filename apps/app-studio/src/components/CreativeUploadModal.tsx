'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import { APP_STORE_ASSETS, type AppStorePlacement } from '../data/appStoreAssets';
import type { CreativeUploadTarget } from '../data/creativeUpload.mjs';
import { IOS_LOCALE_MAP } from '../data/storeLocales.mjs';
import { LOCALE_META } from '../scenes/locales';
import { captureCreativeUpload, checkCreativeUpload, uploadCreativeAsset } from '../utils/creativeUpload';

interface Props {
  placement: AppStorePlacement;
  activeLocale: string;
  localeOptions: string[];
  setLocale: (locale: string) => void;
  creativeRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

interface LogLine { text: string; error?: boolean }

/** One capture per marketing language; its asset can serve several store locales. */
export function CreativeUploadModal({ placement, activeLocale, localeOptions, setLocale, creativeRef, onClose }: Props) {
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [replace, setReplace] = useState(false);
  const [target, setTarget] = useState<CreativeUploadTarget | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState('');
  const [log, setLog] = useState<LogLine[]>([]);
  const cancelRef = useRef(false);
  const startingLocale = useRef(activeLocale);
  const completed = useRef(new Set<string>());
  const dialogRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const spec = APP_STORE_ASSETS[placement];
  const selected = scope === 'current' ? [startingLocale.current]
    : localeOptions.filter(locale => Object.hasOwn(IOS_LOCALE_MAP, locale));
  const supported = selected.every(locale => Object.hasOwn(IOS_LOCALE_MAP, locale));
  const storeLocaleCount = selected.reduce((sum, locale) => sum + (IOS_LOCALE_MAP[locale]?.length ?? 0), 0);

  useEffect(() => {
    const controller = new AbortController();
    setTarget(null);
    void checkCreativeUpload(AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]))
      .then(result => { if (!controller.signal.aborted) setTarget(result); })
      .catch(error => {
        if (!controller.signal.aborted) setTarget({ ok: false, error: error instanceof Error ? error.message : 'Could not reach App Store Connect.' });
      });
    return () => controller.abort();
  }, [checkAttempt]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'nearest' }); }, [log]);

  const addLog = (text: string, error = false) => setLog(lines => [...lines, { text, error }]);

  const chooseScope = (next: 'current' | 'all') => {
    if (next === scope) return;
    setScope(next);
    setDone(false);
    setLog([]);
    completed.current.clear();
  };

  async function handleUpload() {
    if (running || !target?.ok || !target.versionId || !supported) return;
    const originalLocale = startingLocale.current;
    const pending = selected.filter(locale => !completed.current.has(locale));
    const active = new Set<Promise<void>>();
    cancelRef.current = false;
    setRunning(true);
    setDone(false);
    setLog([]);
    let failures = 0;
    let failedCapture = false;

    const send = async (locale: string, data: string) => {
      addLog(`[${locale}] Uploading and processing the asset…`);
      try {
        const result = await uploadCreativeAsset(placement, locale, data, target.versionId!, replace);
        if (result.uploaded.length) addLog(`[${locale}] Assigned to ${result.uploaded.join(', ')}`);
        if (result.errors.length || result.uploaded.length !== IOS_LOCALE_MAP[locale].length) {
          failures++;
          for (const error of result.errors) addLog(`[${locale}] ${error}`, true);
          if (!result.errors.length) addLog(`[${locale}] Not every App Store field was assigned.`, true);
          if (result.videoId || result.imageId) addLog(`[${locale}] The uploaded asset is kept in Asset Library (${result.videoId ?? result.imageId}).`);
        } else {
          completed.current.add(locale);
        }
      } catch (error) {
        failures++;
        addLog(`[${locale}] ${error instanceof Error ? error.message : 'Upload failed.'}`, true);
      }
    };

    try {
      for (const locale of pending) {
        if (cancelRef.current) break;
        while (active.size >= 2) await Promise.race(active);
        if (cancelRef.current) break;
        setProgress(`Preparing ${locale} · ${completed.current.size}/${selected.length} complete`);
        flushSync(() => setLocale(locale));
        const element = creativeRef.current;
        if (!element) throw new Error('The artwork is not ready. Close this window and select the view again.');
        const data = await captureCreativeUpload(element, placement);
        if (cancelRef.current) break;
        const task = send(locale, data);
        active.add(task);
        void task.finally(() => active.delete(task));
      }
    } catch (error) {
      failedCapture = true;
      addLog(error instanceof Error ? error.message : 'Could not prepare the artwork.', true);
    } finally {
      await Promise.all(active);
      flushSync(() => setLocale(originalLocale));
      const count = completed.current.size;
      setProgress(`${count}/${selected.length} languages complete`);
      if (cancelRef.current) addLog('Cancelled after the current uploads finished. Completed uploads are kept.');
      else if (!failures && !failedCapture && count === selected.length) {
        addLog(`Upload complete. ${spec.label} is assigned on version ${target.version}.`);
        setDone(true);
      } else addLog('Some uploads did not finish. Review the messages before retrying.', true);
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
      onClick={event => { if (event.target === event.currentTarget && !running) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="creative-upload-title" tabIndex={-1}
        className="relative w-full max-w-[620px] max-h-[90vh] flex flex-col rounded-2xl bg-[#111716] border border-white/[0.08] shadow-2xl outline-none"
        onKeyDown={event => {
          if (event.key === 'Escape' && !running) onClose();
          if (event.key !== 'Tab') return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')];
          const first = controls[0], last = controls.at(-1);
          if (!first || !last) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
            event.preventDefault(); first.focus();
          }
        }}>
        <div className="flex justify-between items-start gap-4 px-7 py-6 border-b border-white/[0.06]">
          <div>
            <h2 id="creative-upload-title" className="text-[18px] font-semibold tracking-tight">Upload to App Store</h2>
            <p className="text-[13px] text-white/40 mt-1.5">{spec.label} · {placement === 'search' ? '1920 × 1280 MP4 · 7.2 seconds · 30 fps' : `${spec.width} × ${spec.height} JPEG`}</p>
          </div>
          <button type="button" aria-label="Close upload window" disabled={running} onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] text-white/50 hover:text-white disabled:opacity-30 cursor-pointer">×</button>
        </div>
        <div className="overflow-y-auto px-7 py-6 space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-2">Destination</p>
            <p className="text-[13px] text-white/70">{!target ? 'Checking App Store Connect…'
              : target.ok ? `iOS ${target.version} · ${placement === 'header' ? 'Header' : 'Search Results'}` : target.error}</p>
            {target && !target.ok && <button type="button" onClick={() => setCheckAttempt(value => value + 1)}
              className="mt-2 text-xs text-[#38D07E] underline cursor-pointer">Check again</button>}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-2">Languages</p>
            <div role="group" aria-label="Upload languages" className="flex flex-wrap gap-2">
              {(['current', 'all'] as const).map(value => <button type="button" key={value} disabled={running}
                aria-pressed={scope === value} onClick={() => chooseScope(value)}
                className={`rounded-lg px-3 py-2 text-[13px] cursor-pointer disabled:cursor-not-allowed ${scope === value
                  ? 'bg-[#2FBF71]/20 text-[#38D07E]' : 'bg-white/[0.05] text-white/50 hover:text-white'}`}>
                {value === 'current' ? LOCALE_META[startingLocale.current].label : `All App Store languages (${localeOptions.filter(locale => Object.hasOwn(IOS_LOCALE_MAP, locale)).length})`}
              </button>)}
            </div>
            <p className="text-xs text-white/40 mt-2">{supported
              ? `${selected.length} ${placement === 'search' ? 'video' : 'image'}${selected.length === 1 ? '' : 's'} · ${storeLocaleCount} App Store localization${storeLocaleCount === 1 ? '' : 's'}`
              : 'Filipino has no App Store localization. Choose all languages or select another language in the Studio.'}</p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-white/60 cursor-pointer">
            <input type="checkbox" checked={replace} disabled={running} onChange={event => setReplace(event.target.checked)} className="accent-[#38D07E]" />
            Replace existing asset
          </label>
          <p className="rounded-xl border border-white/[0.07] p-4 text-xs leading-relaxed text-white/40">
            {placement === 'search' ? 'The camera scan uploads as a looping MP4, with the selected language’s food and headline.' : 'The full Header image uploads without preview guides.'} It fills this field on your editable version.
            {' '}Review and release stay in App Store Connect.
          </p>
          {log.length > 0 && <div role="log" aria-label="Upload progress" aria-live="polite"
            className="max-h-[220px] overflow-y-auto rounded-xl bg-black/25 p-4 space-y-2 text-[12px] leading-relaxed break-words">
            {log.map((line, index) => <p key={index} className={line.error ? 'text-red-300' : 'text-white/65'}>{line.text}</p>)}
            <div ref={logEndRef} />
          </div>}
        </div>
        <div className="px-7 pb-6 space-y-3">
          {progress && <p role="status" className="text-xs text-white/40">{progress}</p>}
          {running ? <button type="button" onClick={() => { cancelRef.current = true; setProgress('Finishing current uploads…'); }}
            className="w-full h-11 rounded-xl bg-white/[0.06] text-white/65 cursor-pointer">Cancel after current uploads</button>
            : <button type="button" onClick={handleUpload} disabled={!target?.ok || !target?.versionId || !supported || done}
              className="w-full h-11 rounded-xl bg-[#2FBF71] hover:bg-[#28AA65] text-white text-[14px] font-semibold cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed">
              {done ? 'Upload complete' : completed.current.size ? 'Upload remaining languages' : `Upload ${placement === 'header' ? 'Header' : 'Search Results'}`}
            </button>}
          {target?.url && <a href={target.url} target="_blank" rel="noreferrer"
            className="block text-center text-xs text-white/45 hover:text-white underline underline-offset-4">Open App Store Connect</a>}
        </div>
      </div>
    </div>
  );
}
