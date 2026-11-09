import type { LocaleModule } from './types';

/** Swedish. Translated from ./en; every figure is carried across unchanged. */
const sv: LocaleModule = {
  meta: { code: "sv", flag: "🇸🇪", label: "Svenska" },

  phone: {
    today: {
      h: "Varje måltid,\nräknad",
      hl: "räknad",
      sub: "En ring för det som är kvar. Makron och vatten alldeles intill.",
    },
    workout: {
      h: "Logga varje set,\nslå ditt rekord",
      hl: "slå ditt rekord",
      sub: "Förra passet står vid varje set. En pokal när du slår det.",
    },
    dish: {
      h: "Välj portionen,\nsiffrorna följer med",
      hl: "siffrorna följer med",
      sub: "Skålar, tallrikar eller bitar. Byt portion så följer siffrorna.",
    },
    trends: {
      h: "Se vart\nveckan tog vägen",
      hl: "veckan tog vägen",
      sub: "Sju dagar, trettio dagar eller ett år. Kalorier, vatten och vikt.",
    },
    feed: {
      h: 'Dela din måltid,\nhitta dina vänner',
      hl: 'hitta dina vänner',
      sub: 'Följ vänner och dela maten du gillar.',
    },
    recipes: {
      h: "Laga en gång,\nsedan en tryckning",
      hl: "sedan en tryckning",
      sub: "Skriv in ingredienserna och hur många det räcker till. Sedan en tryckning.",
    },
    panel: {
      title: "Fem sätt för\nasiatisk mat",
      sub: "Gatukök, hemlagat, förpackningar från affären.",
      stats: { usersChoice: '2K användares val' },
      metrics: { calories: "Kalorier", water: "Vatten", weight: "Vikt" },
      snap    : { t: "Fotografera tallriken", b: "Varje rätt på den får namn, portion och kalorier." },
      describe: { t: "Säg vad du åt", b: "\"Nasi lemak med friterad kyckling och en teh tarik.\"" },
      scan    : { t: "Skanna en förpackning", b: "Läses direkt från etiketten, på en sekund." },
      search  : { t: "Sök i matdatabasen", b: "Gatukök, kedjor och hemlagat." },
      recipes : { t: "Spara det du lagar", b: "Skriv in en gång, logga sedan med en tryckning." },
    },
  },

  feature: {
    titleA: "Fotografera tallriken.",
    titleB: { pre: "Få ", hl: "kalorierna", post: " tillbaka." },
    sub: "Asiatisk mat, ordentligt räknad",
  },

  landing: {
    title: "En kaloridagbok som känner till nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Foto, ord eller streckkod. RiceCal räknar resten.",
  },
};

export default sv;
