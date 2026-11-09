'use client';

import { useEffect, useState } from 'react';
import { APP_DESCRIPTIONS, DESCRIPTION_LOCALE_CODES } from '../data/appDescriptions';
import { LOCALE_META } from '../scenes/locales';

type UploadPlatform = 'ios' | 'android';
type LogType = 'info' | 'success' | 'error';

interface LogLine { text: string; type: LogType }

interface StoreMetadata {
  name: string;
  /** App Store subtitle and Play short description come from the same line. */
  subtitle: string;
  privacyPolicyUrl: string;
  privacyChoicesUrl: string;
  privacyPolicyText: string;
  keywords: string;
  supportUrl: string;
  marketingUrl: string;
  whatsNew: string;
}

/**
 * The name the app is already registered under in App Store Connect and Play,
 * 29 characters, inside the 30 both stores allow. It is sent on every full
 * upload, so it has to match what is live — a different string here silently
 * renames the app in every listing locale.
 */
const APP_NAME = 'RiceCal: Asia Calorie Tracker';
const PRIVACY_POLICY_URL = 'https://ricecal.app/privacy';
const SUPPORT_URL = 'https://ricecal.app/contact';
const MARKETING_URL = 'https://ricecal.app';

/** App Store caps the subtitle at 30 characters; Play's short description at 80. */
const SUBTITLES: Record<string, string> = {
  en:  'Calorie & Workout Tracker',
  ms:  'Penjejak Kalori & Senaman',
  zh:  '热量与健身记录',
  id:  'Pelacak Kalori & Latihan',
  th:  'แคลอรีและการออกกำลังกาย',
  vi:  'Theo dõi calo & tập luyện',
  ja:  'カロリー＆筋トレ記録',
  ko:  '칼로리 & 운동 기록',
  hi:  'कैलोरी और वर्कआउट ट्रैकर',
  ta:  'கலோரி & உடற்பயிற்சி',
  bn:  'ক্যালোরি ও ওয়ার্কআউট',
  fil: 'Calorie at Workout Tracker',
  es:  'Calorías y entrenamientos',
  fr:  'Calories et entraînement',
  de:  'Kalorien- & Trainingstracker',
  pt:  'Calorias e treinos',
  it:  'Calorie e allenamenti',
  nl:  'Calorieën en training',
  ru:  'Калории и тренировки',
  tr:  'Kalori ve Antrenman Takibi',
  pl:  'Kalorie i treningi',
  uk:  'Калорії та тренування',
  sv:  'Kalorier och träning',
  nb:  'Kalorier og trening',
  da:  'Kalorier og træning',
};

/** App Store keywords: 100 characters total, comma separated, no spaces. */
const KEYWORDS: Record<string, string> = {
  en:  'calorie,counter,food,diary,macro,tracker,nutrition,barcode,recipe,asian,workout,gym',
  ms:  'kalori,makanan,diari,makro,penjejak,nutrisi,barkod,resipi,asia,berat,senaman,gim',
  zh:  '热量,卡路里,饮食,记录,营养,宏量,条码,食谱,亚洲,体重,健身,训练',
  id:  'kalori,makanan,catatan,makro,pelacak,nutrisi,barcode,resep,asia,berat,latihan,gym',
  th:  'แคลอรี,อาหาร,บันทึก,มาโคร,ติดตาม,โภชนาการ,บาร์โค้ด,สูตร,เอเชีย,น้ำหนัก,ออกกำลังกาย,ฟิตเนส',
  vi:  'calo,thuc pham,nhat ky,macro,theo doi,dinh duong,ma vach,cong thuc,chau a,tap luyen,gym',
  ja:  'カロリー,食事,記録,マクロ,栄養,バーコード,レシピ,アジア,体重,ダイエット,筋トレ,ワークアウト',
  ko:  '칼로리,식단,기록,매크로,영양,바코드,레시피,아시아,체중,다이어트,운동,헬스',
  hi:  'कैलोरी,भोजन,डायरी,मैक्रो,ट्रैकर,पोषण,बारकोड,रेसिपी,एशिया,वज़न,वर्कआउट,जिम',
  ta:  'கலோரி,உணவு,எடை,ஆசிய,பார்கோடு,உடற்பயிற்சி,ஜிம்',
  bn:  'ক্যালোরি,খাবার,ওজন,এশীয়,বারকোড,ওয়ার্কআউট,জিম',
  fil: 'calorie,pagkain,diary,macro,tracker,nutrisyon,barcode,recipe,asya,timbang,workout,gym',
  es:  'calorias,contador,comida,diario,macros,nutricion,codigo,receta,asiatica,entrenamiento,gym',
  fr:  'calories,compteur,repas,journal,macros,nutrition,code barres,recette,asie,musculation,sport',
  de:  'kalorien,zaehler,essen,tagebuch,makros,ernaehrung,barcode,rezept,asien,training,fitness',
  pt:  'calorias,contador,comida,diario,macros,nutricao,codigo,receita,asiatica,treino,academia',
  it:  'calorie,contatore,cibo,diario,macro,nutrizione,codice,ricetta,asiatica,allenamento,palestra',
  nl:  'calorieen,teller,eten,dagboek,macros,voeding,streepjescode,recept,azie,training,sportschool',
  ru:  'калории,счетчик,еда,дневник,макросы,питание,штрихкод,рецепт,азия,вес,тренировки,спортзал',
  tr:  'kalori,sayac,yemek,gunluk,makro,beslenme,barkod,tarif,asya,kilo,antrenman,spor',
  pl:  'kalorie,licznik,jedzenie,dziennik,makro,zywienie,kod kreskowy,przepis,azja,trening,silownia',
  uk:  'калорії,лічильник,їжа,щоденник,макроси,харчування,штрихкод,рецепт,азія,тренування,спортзал',
  sv:  'kalorier,raknare,mat,dagbok,makros,naring,streckkod,recept,asiatisk,vikt,traning,gym',
  nb:  'kalorier,teller,mat,dagbok,makroer,ernaering,strekkode,oppskrift,asiatisk,trening,treningssenter',
  da:  'kalorier,taeller,mad,dagbog,makroer,ernaering,stregkode,opskrift,asiatisk,traening,fitness',
};

function getPrivacyPolicyText(description: string): string {
  return description
    .split('\n')
    .find(line => line.includes(PRIVACY_POLICY_URL))
    ?? `Privacy Policy: ${PRIVACY_POLICY_URL}`;
}

function buildDefaults(): Record<string, StoreMetadata> {
  return Object.fromEntries(DESCRIPTION_LOCALE_CODES.map((locale) => {
    const description = APP_DESCRIPTIONS[locale].description;
    return [locale, {
      name: APP_NAME,
      subtitle: SUBTITLES[locale] ?? SUBTITLES.en,
      privacyPolicyUrl: PRIVACY_POLICY_URL,
      privacyChoicesUrl: PRIVACY_POLICY_URL,
      privacyPolicyText: getPrivacyPolicyText(description),
      keywords: KEYWORDS[locale] ?? KEYWORDS.en,
      supportUrl: SUPPORT_URL,
      marketingUrl: MARKETING_URL,
      whatsNew: APP_DESCRIPTIONS[locale].whatsNew ?? APP_DESCRIPTIONS.en.whatsNew ?? '',
    }];
  }));
}

const DEFAULTS = buildDefaults();

const IOS_ICON = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
);
const ANDROID_ICON = (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.5-3.08-.77-4.87-.77-1.79 0-3.43.27-4.87.77L4.85 5.67c-.18-.28-.54-.37-.83-.22-.29.16-.42.54-.26.85l1.84 3.18C2.63 11.46 1 14.3 1 17.5h22c0-3.2-1.63-6.04-5.4-8.02zm-9.1 4.52c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1zm7 0c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1z"/></svg>
);

interface PlayTrack {
  track: string;
  releases: Array<{ name?: string; status?: string; versionCodes: string[] }>;
}

export function DescriptionsView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingWhatsNew, setUploadingWhatsNew] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [metadata, setMetadata] = useState<Record<string, StoreMetadata>>(DEFAULTS);

  /**
   * Play needs a track before it can take a release note, so the tracks that
   * have a release are loaded up front and the first is preselected.
   */
  const [tracks, setTracks] = useState<PlayTrack[]>([]);
  const [track, setTrack] = useState<string>('');

  useEffect(() => {
    fetch('/api/upload/android/whats-new')
      .then(r => r.json())
      .then((body) => {
        const list: PlayTrack[] = body.tracks ?? [];
        setTracks(list);
        setTrack(prev => prev || list[0]?.track || '');
      })
      .catch(() => {});
  }, []);

  const addLog = (text: string, type: LogType = 'info') =>
    setLog(prev => [...prev, { text, type }]);

  const updateField = (locale: string, field: keyof StoreMetadata, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? DEFAULTS[locale]), [field]: value },
    }));
  };

  const reset = (locale: string) =>
    setMetadata(prev => ({ ...prev, [locale]: DEFAULTS[locale] }));

  const endpointFor = (platform: UploadPlatform) =>
    platform === 'ios' ? '/api/upload/ios/descriptions' : '/api/upload/android/descriptions';

  const post = async (platform: UploadPlatform, localizations: Record<string, unknown>) => {
    const res = await fetch(endpointFor(platform), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localizations }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    return body;
  };

  /**
   * On the App Store this is a version field. On Play it is a release note on
   * a release inside a track, which is why that side needs `track` and why
   * the two go to different endpoints.
   */
  const handleUploadWhatsNew = async (platform: UploadPlatform) => {
    if (uploadingWhatsNew || uploading) return;
    if (platform === 'android' && !track) {
      setLog([{ text: 'No Play track has a release to write notes on.', type: 'error' }]);
      return;
    }

    setUploadingWhatsNew(true);
    setLog([]);

    const localizations: Record<string, { whatsNew: string }> = {};
    for (const locale of DESCRIPTION_LOCALE_CODES) {
      localizations[locale] = { whatsNew: (metadata[locale] ?? DEFAULTS[locale]).whatsNew };
    }

    const where = platform === 'ios' ? 'App Store Connect' : `Google Play, ${track} track`;
    addLog(`Uploading What's New to ${where} (${DESCRIPTION_LOCALE_CODES.length} locales)…`);

    try {
      const res = await fetch(
        platform === 'ios' ? '/api/upload/ios/descriptions' : '/api/upload/android/whats-new',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(platform === 'ios' ? { localizations } : { localizations, track }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      const count = Object.keys(body.updated ?? {}).length;
      for (const n of (body.notes ?? []) as string[]) addLog(`· ${n}`, 'info');
      addLog(
        count ? `✓ Done — ${count} locales updated` : 'Nothing was written',
        count ? 'success' : 'error',
      );
      for (const e of (body.errors ?? []) as string[]) addLog(`⚠ ${e}`, 'error');
    } catch (err) {
      addLog(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setUploadingWhatsNew(false);
    }
  };

  const handleUpload = async (platform: UploadPlatform) => {
    if (uploading || uploadingWhatsNew) return;
    setUploading(true);
    setLog([]);

    const localizations: Record<string, Record<string, string>> = {};
    for (const locale of DESCRIPTION_LOCALE_CODES) {
      const m = metadata[locale] ?? DEFAULTS[locale];
      localizations[locale] = {
        description: APP_DESCRIPTIONS[locale].description,
        name: m.name,
        subtitle: m.subtitle,
        ...(platform === 'ios' ? {
          privacyPolicyUrl: m.privacyPolicyUrl,
          privacyChoicesUrl: m.privacyChoicesUrl,
          privacyPolicyText: m.privacyPolicyText,
          keywords: m.keywords,
          supportUrl: m.supportUrl,
          marketingUrl: m.marketingUrl,
          whatsNew: m.whatsNew,
        } : {}),
      };
    }

    const store = platform === 'ios' ? 'App Store Connect' : 'Google Play';
    addLog(`Uploading ${DESCRIPTION_LOCALE_CODES.length} listings to ${store}…`);

    try {
      const body = await post(platform, localizations);
      for (const n of (body.notes ?? []) as string[]) addLog(`· ${n}`, 'info');
      const count = Object.keys(body.updated ?? {}).length;
      addLog(
        count ? `✓ Done — ${count} locales updated` : 'Nothing was written',
        count ? 'success' : 'error',
      );
      for (const e of (body.errors ?? []) as string[]) addLog(`⚠ ${e}`, 'error');
    } catch (err) {
      addLog(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || uploadingWhatsNew;

  return (
    <div className="max-w-[880px] mx-auto px-8 py-10">

      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-[18px] font-semibold text-white">Store Listings</h2>
          <p className="text-[12px] text-white/35 mt-1">
            {DESCRIPTION_LOCALE_CODES.length} locales · click any to expand
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mr-1">
              What&apos;s New only
            </span>
            {/* On Play a release note belongs to a release, so pick its track. */}
            {tracks.length > 0 && (
              <select
                value={track}
                onChange={e => setTrack(e.target.value)}
                disabled={busy}
                title="Play writes the release note onto every release in this track"
                className="h-8 px-2 rounded-lg text-[11px] font-medium cursor-pointer
                  bg-[#080B0A] border border-white/[0.08] text-white/60
                  outline-none focus:border-[#2FBF71]/50 disabled:opacity-40"
              >
                {tracks.map(t => (
                  <option key={t.track} value={t.track}>
                    {t.track} · {t.releases.map(r => r.name).filter(Boolean).join(', ') || 'release'}
                  </option>
                ))}
              </select>
            )}
            {(['ios', 'android'] as UploadPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => handleUploadWhatsNew(p)}
                disabled={busy || (p === 'android' && !track)}
                title={p === 'android' && !track
                  ? 'No Play track has a release to write notes on'
                  : undefined}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold
                  transition-all cursor-pointer border border-[#2FBF71]/25
                  bg-[#2FBF71]/[0.07] hover:bg-[#2FBF71]/[0.14] text-[#38D07E]/80 hover:text-[#38D07E]
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p === 'ios' ? IOS_ICON : ANDROID_ICON}
                {uploadingWhatsNew ? 'Uploading…' : p === 'ios' ? 'App Store' : 'Play Store'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mr-1">
              Full upload
            </span>
            {(['ios', 'android'] as UploadPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => handleUpload(p)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold
                  transition-all cursor-pointer border border-white/[0.08]
                  bg-white/[0.05] hover:bg-white/[0.10] text-white/70 hover:text-white
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p === 'ios' ? IOS_ICON : ANDROID_ICON}
                {uploading ? 'Uploading…' : p === 'ios' ? 'App Store' : 'Play Store'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {log.length > 0 && (
        <div className="mb-6 bg-[#080B0A] rounded-2xl border border-white/[0.06] p-4 font-mono text-[12px] flex flex-col gap-1">
          {log.map((l, i) => (
            <span key={i} className={
              l.type === 'success' ? 'text-[#38D07E]'
              : l.type === 'error' ? 'text-red-400'
              : 'text-white/50'
            }>{l.text}</span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {DESCRIPTION_LOCALE_CODES.map(locale => {
          const meta = LOCALE_META[locale];
          const desc = APP_DESCRIPTIONS[locale].description;
          const m = metadata[locale] ?? DEFAULTS[locale];
          const isOpen = expanded === locale;
          const inputClass = `w-full rounded-lg border border-white/[0.08] bg-[#080B0A] px-3 py-2 text-[12px]
            text-white/75 outline-none transition-colors focus:border-[#2FBF71]/50 focus:bg-[#0C110F]`;
          const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30';
          const textareaClass = `${inputClass} min-h-[112px] resize-y leading-relaxed`;

          return (
            <div key={locale} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : locale)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-all cursor-pointer"
              >
                <span className="text-[20px] leading-none shrink-0">{meta?.flag}</span>
                <span className="text-[13px] font-medium text-white/80 w-36 shrink-0">{meta?.label ?? locale}</span>
                <span className="font-mono text-[11px] text-white/25 w-10 shrink-0">{locale}</span>
                <span className="flex-1 text-[12px] text-white/35 truncate">{desc.slice(0, 80)}…</span>
                <svg
                  className={`w-4 h-4 text-white/25 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-white/[0.05] pt-4 flex flex-col gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[12px] font-semibold text-white/55">Description</h3>
                      <span className="text-[10px] text-white/25">{desc.length} chars · read-only</span>
                    </div>
                    <pre className="text-[13px] text-white/65 whitespace-pre-wrap leading-relaxed font-sans">{desc}</pre>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-[12px] font-semibold text-white/70">Store metadata</h3>
                        <p className="text-[11px] text-white/30 mt-0.5">
                          Edited here, sent by the upload buttons above. Not persisted.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => reset(locale)}
                        className="h-8 px-3 rounded-lg border border-white/[0.08] text-[11px] text-white/45
                          hover:text-white/75 hover:bg-white/[0.05] transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <span className={labelClass}>Name</span>
                          <span className={`text-[10px] ${m.name.length > 30 ? 'text-red-400' : 'text-white/25'}`}>
                            {m.name.length}/30
                          </span>
                        </span>
                        <input value={m.name} onChange={e => updateField(locale, 'name', e.target.value)} className={inputClass} />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <span className={labelClass}>Subtitle / short description</span>
                          <span className={`text-[10px] ${m.subtitle.length > 30 ? 'text-red-400' : 'text-white/25'}`}>
                            {m.subtitle.length}/30
                          </span>
                        </span>
                        <input value={m.subtitle} onChange={e => updateField(locale, 'subtitle', e.target.value)} className={inputClass} />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Support URL</span>
                        <input value={m.supportUrl} onChange={e => updateField(locale, 'supportUrl', e.target.value)} className={inputClass} />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Marketing URL</span>
                        <input value={m.marketingUrl} onChange={e => updateField(locale, 'marketingUrl', e.target.value)} className={inputClass} />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Privacy Policy URL</span>
                        <input value={m.privacyPolicyUrl} onChange={e => updateField(locale, 'privacyPolicyUrl', e.target.value)} className={inputClass} />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>User Privacy Choices URL</span>
                        <input value={m.privacyChoicesUrl} onChange={e => updateField(locale, 'privacyChoicesUrl', e.target.value)} className={inputClass} />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <span className={labelClass}>Keywords (iOS)</span>
                          <span className={`text-[10px] ${m.keywords.length > 100 ? 'text-red-400' : 'text-white/25'}`}>
                            {m.keywords.length}/100
                          </span>
                        </span>
                        <input value={m.keywords} onChange={e => updateField(locale, 'keywords', e.target.value)} className={inputClass} />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className={labelClass}>What&apos;s New in This Version (iOS)</span>
                        <textarea value={m.whatsNew} onChange={e => updateField(locale, 'whatsNew', e.target.value)} className={textareaClass} />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className={labelClass}>Privacy policy text</span>
                        <textarea
                          value={m.privacyPolicyText}
                          onChange={e => updateField(locale, 'privacyPolicyText', e.target.value)}
                          className={`${textareaClass} min-h-[72px]`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
