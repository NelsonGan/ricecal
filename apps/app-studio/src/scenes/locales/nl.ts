import type { LocaleModule } from './types';

/** Dutch. Translated from ./en; every figure is carried across unchanged. */
const nl: LocaleModule = {
  meta: { code: "nl", flag: "🇳🇱", label: "Nederlands" },

  phone: {
    today: {
      h: "Elke maaltijd,\ngeteld",
      hl: "geteld",
      sub: "Eén ring voor wat er over is. Macro’s en water ernaast.",
    },
    workout: {
      h: "Log elke set,\nverbeter je record",
      hl: "verbeter je record",
      sub: "Je vorige sessie naast elke set. Een trofee als je die verslaat.",
    },
    dish: {
      h: "Kies de portie,\nde cijfers volgen",
      hl: "de cijfers volgen",
      sub: "Kommen, borden of stuks. Verander de portie en alles schuift mee.",
    },
    trends: {
      h: "Zie waar\nde week gebleven is",
      hl: "de week gebleven is",
      sub: "Zeven dagen, dertig dagen of een jaar. Calorieën, water en gewicht.",
    },
    feed: {
      h: 'Deel je maaltijd,\nvind je mensen',
      hl: 'vind je mensen',
      sub: 'Volg vrienden en deel je favoriete gerechten.',
    },
    recipes: {
      h: "Kook het één keer,\néén tik voortaan",
      hl: "één tik voortaan",
      sub: "Zet de ingrediënten en het aantal porties erin. Daarna één tik.",
    },
    panel: {
      title: "Vijf manieren voor\nAziatisch eten",
      sub: "Straatkeuken, thuis gekookt, pakjes uit de winkel.",
      stats: { usersChoice: 'De keuze van 2K gebruikers' },
      metrics: { calories: "Calorieën", water: "Water", weight: "Gewicht" },
      snap    : { t: "Fotografeer je bord", b: "Elk gerecht erop krijgt een naam, een portie en een telling." },
      describe: { t: "Zeg wat je gegeten hebt", b: "\"Nasi lemak met gebakken kip en een teh tarik.\"" },
      scan    : { t: "Scan een verpakking", b: "Rechtstreeks van het etiket gelezen, in een seconde." },
      search  : { t: "Zoek in de database", b: "Straatkeuken, ketens en thuis gekookt." },
      recipes : { t: "Bewaar wat je kookt", b: "Eén keer invoeren, daarna één tik." },
    },
  },

  feature: {
    titleA: "Fotografeer je bord.",
    titleB: { pre: "Krijg de ", hl: "calorieën", post: " terug." },
    sub: "Aziatisch eten, goed geteld",
  },

  landing: {
    title: "Een caloriedagboek dat nasi lemak kent.",
    highlight: "nasi lemak",
    subtitle: "Foto, woorden of barcode. RiceCal telt de rest.",
  },
};

export default nl;
