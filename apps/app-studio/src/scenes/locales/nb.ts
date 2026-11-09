import type { LocaleModule } from './types';

/** Norwegian Bokmål. Translated from ./en; every figure is carried across unchanged. */
const nb: LocaleModule = {
  meta: { code: "nb", flag: "🇳🇴", label: "Norsk" },

  phone: {
    today: {
      h: "Hvert måltid,\ntelt",
      hl: "telt",
      sub: "Én ring for det som er igjen. Makroer og vann rett ved siden av.",
    },
    workout: {
      h: "Logg hvert sett,\nslå rekorden din",
      hl: "slå rekorden din",
      sub: "Forrige økt står ved hvert sett. Et trofé når du slår den.",
    },
    dish: {
      h: "Velg porsjonen,\ntallene følger etter",
      hl: "tallene følger etter",
      sub: "Boller, tallerkener eller biter. Bytt porsjon, tallene følger med.",
    },
    trends: {
      h: "Se hvor\nuken ble av",
      hl: "uken ble av",
      sub: "Sju dager, tretti dager eller et år. Kalorier, vann og vekt.",
    },
    feed: {
      h: 'Del måltidet ditt,\nfinn vennene dine',
      hl: 'finn vennene dine',
      sub: 'Følg venner og del maten du liker.',
    },
    recipes: {
      h: "Lag det én gang,\nlogg med ett trykk",
      hl: "logg med ett trykk",
      sub: "Skriv inn ingrediensene og hvor mange det holder til. Så ett trykk.",
    },
    panel: {
      title: "Fem måter for\nasiatisk mat",
      sub: "Gatekjøkken, hjemmelaget, pakker fra butikken.",
      stats: { usersChoice: '2K brukeres valg' },
      metrics: { calories: "Kalorier", water: "Vann", weight: "Vekt" },
      snap    : { t: "Ta bilde av tallerkenen", b: "Hver rett får navn, porsjon og kalorier." },
      describe: { t: "Si hva du spiste", b: "\"Nasi lemak med fritert kylling og en teh tarik.\"" },
      scan    : { t: "Skann en pakke", b: "Leses rett fra etiketten, på et sekund." },
      search  : { t: "Søk i matdatabasen", b: "Gatekjøkken, kjeder og hjemmelaget." },
      recipes : { t: "Lagre det du lager", b: "Skriv inn én gang, logg så med ett trykk." },
    },
  },

  feature: {
    titleA: "Ta bilde av tallerkenen.",
    titleB: { pre: "Få ", hl: "kaloriene", post: " tilbake." },
    sub: "Asiatisk mat, ordentlig telt",
  },

  landing: {
    title: "En kaloridagbok som kjenner nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Bilde, ord eller strekkode. RiceCal teller resten.",
  },
};

export default nb;
