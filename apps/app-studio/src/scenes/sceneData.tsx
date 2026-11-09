import type { ReactNode } from 'react';
import { Blob, Pandan, Grains } from '../components/flora';
import { C } from '../components/tokens';
import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';
import { APP_STORE_COPY } from './appStoreCopy';

export interface SceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  screenshot: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle?: number;
  accentColor: string;
  textColor: string;
  badge?: string;
  /** Where the headline block sits. The phone bleeds off the opposite edge. */
  headlinePos?: 'top' | 'bottom';
  headlineSize?: number;
  phoneScale?: number;
  phoneX?: number;
  phoneRotate?: number;
  /** Which canvas edge the device bleeds off. */
  phoneAnchor?: 'top' | 'bottom';
  /** How many px of the device are hidden past the bleed edge. */
  phoneCrop?: number;
  decorations?: ReactNode;
  /** Scenes 01–03 are one composition cut into three panels. */
  panorama?: { panel: number };
}

/* ── Corner planting for the standalone scenes ───────────────────────────────
   Each gets its own arrangement so the set does not repeat, and each is drawn
   only in the soft end of the palette so it never fights the phone. */

function FloraTrends() {
  return (
    <>
      <Blob x={-190} y={620} size={460} color={C.water} opacity={0.14} rotate={18} />
      <Pandan x={1000} y={1500} size={420} color={C.pandanSoftLine} opacity={0.85} rotate={20} flip />
      <Grains x={-40} y={1240} size={190} color={C.waterSoftLine} opacity={0.95} rotate={26} />
    </>
  );
}

function FloraFeed() {
  return (
    <>
      <Blob x={960} y={480} size={470} color={C.hibiscus} opacity={0.1} rotate={-16} />
      <Pandan x={-180} y={1520} size={450} color={C.pandanSoftLine} opacity={0.85} rotate={-18} />
      <Grains x={1080} y={1300} size={190} color={C.kayaSoftLine} opacity={0.9} rotate={12} />
    </>
  );
}

function FloraRecipes() {
  return (
    <>
      <Pandan x={950} y={1480} size={460} color={C.pandanSoftLine} opacity={0.9} rotate={16} flip />
      <Blob x={-210} y={560} size={440} color={C.teh} opacity={0.13} rotate={24} />
      <Grains x={-30} y={1300} size={200} color={C.tehSoftLine} opacity={0.95} rotate={-20} />
    </>
  );
}

export function getScenes(locale: string): SceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const creative = APP_STORE_COPY[locale] ?? APP_STORE_COPY.en;
  const basePath = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;

  const base = {
    gradientFrom: C.canvas,
    gradientTo: C.pandanSoft,
    accentColor: C.pandanSlab,
    textColor: C.heading,
    headlineSize: 124,
    phoneScale: 3.55,
    phoneCrop: 235,
  };

  return [
    /* ── TRIPTYCH 1/3 — TODAY ────────────────────────────────────────────────
       The ring leads the gallery. It is the one screen where the whole idea is
       visible at a glance: what is left, what it was made of, and the day's
       meals under it. */
    {
      id: '01-today',
      headline: creative.search,
      highlight: creative.search.split('\n')[1],
      screenshot: `${basePath}/01-today.png`,
      ...base,
      panorama: { panel: 0 },
    },

    /* ── TRIPTYCH 2/3 — WORKOUT ──────────────────────────────────────────────
       The logger part way through a session: last time's numbers beside each
       set, a record already marked, and the watch's heart rate in the strip. */
    {
      id: '02-workout',
      headline: t.workout.h,
      highlight: t.workout.hl,
      screenshot: `${basePath}/02-workout.png`,
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
      panorama: { panel: 1 },
    },

    /* ── TRIPTYCH 3/3 — PORTION DETAILS ───────────────────────────────────── */
    {
      id: '03-dish',
      headline: t.dish.h,
      highlight: t.dish.hl,
      screenshot: `${basePath}/03-dish.png`,
      ...base,
      accentColor: C.pandanSlab,
      gradientTo: C.kayaSoft,
      panorama: { panel: 2 },
    },

    /* ── 04 — FEED ────────────────────────────────────────────────────────── */
    {
      id: '04-feed',
      headline: t.feed.h,
      highlight: t.feed.hl,
      screenshot: `${basePath}/05-feed.png`,
      ...base,
      accentColor: C.hibiscusSlab,
      gradientTo: C.hibiscusSoft,
      decorations: <FloraFeed />,
    },

    /* ── 05 — RECIPES ─────────────────────────────────────────────────────── */
    {
      id: '05-recipes',
      headline: t.recipes.h,
      highlight: t.recipes.hl,
      screenshot: `${basePath}/06-recipes.png`,
      ...base,
      accentColor: C.tehSlab,
      gradientTo: C.tehSoft,
      decorations: <FloraRecipes />,
    },

    /* ── 06 — TRENDS ──────────────────────────────────────────────────────── */
    {
      id: '06-trends',
      headline: t.trends.h,
      highlight: t.trends.hl,
      screenshot: `${basePath}/04-trends.png`,
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
      decorations: <FloraTrends />,
    },
  ];
}
