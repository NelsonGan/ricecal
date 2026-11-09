import type { LocaleModule } from './types';

/** Danish. Translated from ./en; every figure is carried across unchanged. */
const da: LocaleModule = {
  meta: { code: "da", flag: "🇩🇰", label: "Dansk" },

  phone: {
    today: {
      h: "Hvert måltid,\ntalt",
      hl: "talt",
      sub: "Én ring for det, der er tilbage. Makroer og vand lige ved siden af.",
    },
    workout: {
      h: "Log hvert sæt,\nslå din rekord",
      hl: "slå din rekord",
      sub: "Sidste gang står ved hvert sæt. Et trofæ, når du slår det.",
    },
    dish: {
      h: "Vælg portionen,\ntallene følger med",
      hl: "tallene følger med",
      sub: "Skåle, tallerkener eller stykker. Skift portion, tallene følger.",
    },
    trends: {
      h: "Se hvor\nugen blev af",
      hl: "ugen blev af",
      sub: "Syv dage, tredive dage eller et år. Kalorier, vand og vægt.",
    },
    feed: {
      h: 'Del dit måltid,\nfind dine venner',
      hl: 'find dine venner',
      sub: 'Følg venner og del den mad, du holder af.',
    },
    recipes: {
      h: "Lav det én gang,\nlog det med ét tryk",
      hl: "log det med ét tryk",
      sub: "Skriv ingredienserne og hvor mange det rækker til. Så ét tryk.",
    },
    panel: {
      title: "Fem måder til\nasiatisk mad",
      sub: "Gadekøkken, hjemmelavet, pakker fra butikken.",
      stats: { usersChoice: '2K brugeres valg' },
      metrics: { calories: "Kalorier", water: "Vand", weight: "Vægt" },
      snap    : { t: "Tag et billede af tallerkenen", b: "Hver ret får navn, portion og kalorier." },
      describe: { t: "Sig hvad du spiste", b: "\"Nasi lemak med friteret kylling og en teh tarik.\"" },
      scan    : { t: "Scan en pakke", b: "Læses direkte fra etiketten, på et sekund." },
      search  : { t: "Søg i madbasen", b: "Gadekøkkener, kæder og hjemmelavet." },
      recipes : { t: "Gem det, du laver", b: "Skriv det ind én gang, log så med ét tryk." },
    },
  },

  feature: {
    titleA: "Tag et billede af tallerkenen.",
    titleB: { pre: "Få ", hl: "kalorierne", post: " tilbage." },
    sub: "Asiatisk mad, ordentligt talt",
  },

  landing: {
    title: "En kaloriedagbog, der kender nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Billede, ord eller stregkode. RiceCal tæller resten.",
  },
};

export default da;
