import type { LocaleModule } from './types';

/** German. Translated from ./en; every figure is carried across unchanged. */
const de: LocaleModule = {
  meta: { code: "de", flag: "🇩🇪", label: "Deutsch" },

  phone: {
    today: {
      h: "Jede Mahlzeit,\ngezählt",
      hl: "gezählt",
      sub: "Ein Ring für das, was bleibt. Makros und Wasser gleich daneben.",
    },
    workout: {
      h: "Jeden Satz notieren,\nRekorde knacken",
      hl: "Rekorde knacken",
      sub: "Das letzte Training neben jedem Satz. Ein Pokal, wenn du es schlägst.",
    },
    dish: {
      h: "Portion wählen,\ndie Zahlen folgen",
      hl: "die Zahlen folgen",
      sub: "Schalen, Teller oder Stücke. Portion ändern, Zahlen ziehen mit.",
    },
    trends: {
      h: "Sieh, wohin\ndie Woche ging",
      hl: "die Woche ging",
      sub: "Sieben Tage, dreißig Tage oder ein Jahr. Kalorien, Wasser, Gewicht.",
    },
    feed: {
      h: 'Teile dein Essen,\nfinde deine Leute',
      hl: 'finde deine Leute',
      sub: 'Folge Freunden und teile dein Lieblingsessen.',
    },
    recipes: {
      h: "Einmal kochen,\ndann ein Tipp",
      hl: "dann ein Tipp",
      sub: "Zutaten und Portionen einmal eintragen. Danach reicht ein Tipp.",
    },
    panel: {
      title: "Fünf Wege für\nasiatisches Essen",
      sub: "Straßenküche, Hausmannskost, Packungen aus dem Laden.",
      stats: { usersChoice: 'Die Wahl von 2K Nutzern' },
      metrics: { calories: "Kalorien", water: "Wasser", weight: "Gewicht" },
      snap    : { t: "Teller fotografieren", b: "Jedes Gericht darauf benannt, geschätzt und gezählt." },
      describe: { t: "Sag, was du gegessen hast", b: "„Nasi Lemak mit Brathähnchen und ein Teh Tarik.\"" },
      scan    : { t: "Packung scannen", b: "Direkt vom Etikett gelesen, in einer Sekunde." },
      search  : { t: "Datenbank durchsuchen", b: "Straßenküche, Ketten und Hausmannskost." },
      recipes : { t: "Eigene Rezepte sichern", b: "Einmal eintragen, danach mit einem Tipp buchen." },
    },
  },

  feature: {
    titleA: "Teller fotografieren.",
    titleB: { pre: "", hl: "Kalorien", post: " zurückbekommen." },
    sub: "Asiatisches Essen, richtig gezählt",
  },

  landing: {
    title: "Ein Kalorientagebuch, das Nasi Lemak kennt.",
    highlight: "Nasi Lemak",
    subtitle: "Foto, Worte oder Barcode. Den Rest zählt RiceCal.",
  },
};

export default de;
