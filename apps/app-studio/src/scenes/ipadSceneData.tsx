import { C } from '../components/tokens';
import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';

/**
 * iPad scenes, landscape 2732 × 2048.
 *
 * There are no native iPad captures yet, so each scene pairs the headline with
 * two phone screens on a wide canvas rather than pretending to a tablet
 * layout. Drop real iPad PNGs into `/assets/screenshots-ipad/<locale>` and
 * point `shots` at them when the app has a tablet build worth showing.
 */
export interface IPadSceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  subheadline: string;
  /** Three short lines beside the headline. */
  bullets: Array<{ icon: string; text: string }>;
  /** Back screen first, front screen second. */
  shots: [string, string];
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
  textColor: string;
  subColor: string;
}

export function getIPadScenes(locale: string): IPadSceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const p = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;

  const base = {
    gradientFrom: C.canvas,
    accentColor: C.pandan,
    textColor: C.heading,
    subColor: C.body,
  };

  return [
    {
      id: '01-today',
      headline: t.today.h,
      highlight: t.today.hl,
      subheadline: t.today.sub,
      bullets: [
        { icon: 'camera', text: t.panel.snap.t },
        { icon: 'sparkle', text: t.panel.describe.t },
        { icon: 'barcode', text: t.panel.scan.t },
      ],
      shots: [`${p}/04-trends.png`, `${p}/01-today.png`],
      ...base,
      gradientTo: C.pandanSoft,
    },
    {
      id: '02-workout',
      headline: t.workout.h,
      highlight: t.workout.hl,
      subheadline: t.workout.sub,
      bullets: [],
      shots: [`${p}/01-today.png`, `${p}/02-workout.png`],
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
    },
    {
      id: '03-feed',
      headline: t.feed.h,
      highlight: t.feed.hl,
      subheadline: t.feed.sub,
      bullets: [],
      shots: [`${p}/03-dish.png`, `${p}/05-feed.png`],
      ...base,
      accentColor: C.hibiscusSlab,
      gradientTo: C.hibiscusSoft,
    },
    {
      id: '04-trends',
      headline: t.trends.h,
      highlight: t.trends.hl,
      subheadline: t.trends.sub,
      bullets: [
        { icon: 'chart-up', text: t.panel.metrics.calories },
        { icon: 'water-glass', text: t.panel.metrics.water },
        { icon: 'weighing-scale', text: t.panel.metrics.weight },
      ],
      shots: [`${p}/01-today.png`, `${p}/04-trends.png`],
      ...base,
      accentColor: C.waterSlab,
      gradientTo: C.waterSoft,
    },
    {
      id: '05-recipes',
      headline: t.recipes.h,
      highlight: t.recipes.hl,
      subheadline: t.recipes.sub,
      bullets: [
        { icon: 'claypot-rice', text: t.panel.recipes.t },
        { icon: 'plate-rice', text: t.panel.search.t },
        { icon: 'camera', text: t.panel.snap.t },
      ],
      shots: [`${p}/03-dish.png`, `${p}/06-recipes.png`],
      ...base,
      accentColor: C.tehSlab,
      gradientTo: C.tehSoft,
    },
  ];
}
