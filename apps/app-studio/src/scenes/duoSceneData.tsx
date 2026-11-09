import type { ReactNode } from 'react';
import { Blob, Pandan, Grains } from '../components/flora';
import { C } from '../components/tokens';
import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';
import { APP_STORE_COPY } from './appStoreCopy';

/**
 * iPhone Duo scenes, landscape 2853 × 2007: the open inner display on its side,
 * which is where the app shows its side tab rail and two panes at the fold.
 *
 * The story, headlines and palette are the iPhone gallery's, scene for scene,
 * so the two sets read as one listing. Only the captures differ: native ones
 * from the Duo simulator in `/assets/screenshots-iphone-duo/<app-code>`.
 */
export interface DuoSceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  screenshot: string;
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
  textColor: string;
  decorations: ReactNode;
}

/* Planting in the strips either side of the device, each scene its own, and
   only in the soft end of the palette so it never fights the screen. */

function FloraToday() {
  return (
    <>
      <Pandan x={-150} y={1240} size={560} color={C.pandanSoftLine} opacity={0.9} rotate={-18} />
      <Grains x={2560} y={560} size={200} color={C.kayaSoftLine} opacity={0.95} rotate={18} />
    </>
  );
}

function FloraWorkout() {
  return (
    <>
      <Blob x={2440} y={1180} size={620} color={C.water} opacity={0.12} rotate={-14} />
      <Pandan x={-170} y={1300} size={520} color={C.pandanSoftLine} opacity={0.85} rotate={-16} />
    </>
  );
}

function FloraDish() {
  return (
    <>
      <Pandan x={2420} y={1200} size={560} color={C.pandanSoftLine} opacity={0.9} rotate={18} flip />
      <Grains x={40} y={1460} size={210} color={C.kayaSoftLine} opacity={0.95} rotate={-24} />
    </>
  );
}

function FloraFeed() {
  return (
    <>
      <Blob x={-230} y={1180} size={600} color={C.hibiscus} opacity={0.1} rotate={-16} />
      <Pandan x={2440} y={1260} size={520} color={C.pandanSoftLine} opacity={0.85} rotate={18} flip />
    </>
  );
}

function FloraRecipes() {
  return (
    <>
      <Blob x={2420} y={1120} size={640} color={C.teh} opacity={0.12} rotate={22} />
      <Grains x={60} y={1380} size={220} color={C.tehSoftLine} opacity={0.95} rotate={-20} />
    </>
  );
}

function FloraTrends() {
  return (
    <>
      <Pandan x={-160} y={1260} size={540} color={C.pandanSoftLine} opacity={0.85} rotate={-20} />
      <Grains x={2570} y={1480} size={200} color={C.waterSoftLine} opacity={0.95} rotate={26} />
    </>
  );
}

export function getDuoScenes(locale: string): DuoSceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const creative = APP_STORE_COPY[locale] ?? APP_STORE_COPY.en;
  const p = `/assets/screenshots-iphone-duo/${screenshotLocale(locale)}`;

  const base = {
    gradientFrom: C.canvas,
    textColor: C.heading,
  };

  return [
    {
      id: '01-today',
      headline: creative.search,
      highlight: creative.search.split('\n')[1],
      screenshot: `${p}/01-today.png`,
      ...base,
      accentColor: C.pandanSlab,
      gradientTo: C.pandanSoft,
      decorations: <FloraToday />,
    },
    {
      id: '02-workout',
      headline: t.workout.h,
      highlight: t.workout.hl,
      screenshot: `${p}/02-workout.png`,
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
      decorations: <FloraWorkout />,
    },
    {
      id: '03-dish',
      headline: t.dish.h,
      highlight: t.dish.hl,
      screenshot: `${p}/03-dish.png`,
      ...base,
      accentColor: C.pandanSlab,
      gradientTo: C.kayaSoft,
      decorations: <FloraDish />,
    },
    {
      id: '04-feed',
      headline: t.feed.h,
      highlight: t.feed.hl,
      screenshot: `${p}/05-feed.png`,
      ...base,
      accentColor: C.hibiscusSlab,
      gradientTo: C.hibiscusSoft,
      decorations: <FloraFeed />,
    },
    {
      id: '05-recipes',
      headline: t.recipes.h,
      highlight: t.recipes.hl,
      screenshot: `${p}/06-recipes.png`,
      ...base,
      accentColor: C.tehSlab,
      gradientTo: C.tehSoft,
      decorations: <FloraRecipes />,
    },
    {
      id: '06-trends',
      headline: t.trends.h,
      highlight: t.trends.hl,
      screenshot: `${p}/04-trends.png`,
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
      decorations: <FloraTrends />,
    },
  ];
}
