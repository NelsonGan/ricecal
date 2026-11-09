import type { LocaleModule } from './types';

/** Italian. Translated from ./en; every figure is carried across unchanged. */
const it: LocaleModule = {
  meta: { code: "it", flag: "🇮🇹", label: "Italiano" },

  phone: {
    today: {
      h: "Ogni pasto,\ncontato",
      hl: "contato",
      sub: "Un anello per quello che resta. Macro e acqua lì accanto.",
    },
    workout: {
      h: "Registra ogni serie,\nbatti il tuo record",
      hl: "batti il tuo record",
      sub: "L’ultima sessione accanto a ogni serie. Un trofeo quando la superi.",
    },
    dish: {
      h: "Scegli la porzione,\ni numeri seguono",
      hl: "i numeri seguono",
      sub: "Ciotole, piatti o pezzi. Cambia porzione e tutto si adegua.",
    },
    trends: {
      h: "Guarda dov’è\nfinita la settimana",
      hl: "finita la settimana",
      sub: "Sette giorni, trenta giorni o un anno. Calorie, acqua e peso.",
    },
    feed: {
      h: 'Condividi il tuo piatto,\nritrova i tuoi amici',
      hl: 'ritrova i tuoi amici',
      sub: 'Segui gli amici e condividi i tuoi piatti preferiti.',
    },
    recipes: {
      h: "Cucinalo una volta,\nregistralo in un tocco",
      hl: "registralo in un tocco",
      sub: "Metti gli ingredienti e per quante persone. Poi basta un tocco.",
    },
    panel: {
      title: "Cinque modi per\nla cucina asiatica",
      sub: "Cibo di strada, cucina di casa, confezioni del negozio.",
      stats: { usersChoice: 'La scelta di 2K utenti' },
      metrics: { calories: "Calorie", water: "Acqua", weight: "Peso" },
      snap    : { t: "Fotografa il piatto", b: "Ogni piatto viene riconosciuto, misurato e contato." },
      describe: { t: "Di’ che cosa hai mangiato", b: "\"Nasi lemak con pollo fritto e un teh tarik.\"" },
      scan    : { t: "Scansiona la confezione", b: "Letto direttamente dall’etichetta, in un secondo." },
      search  : { t: "Cerca nel database", b: "Cibo di strada, catene e cucina di casa." },
      recipes : { t: "Salva quello che cucini", b: "Inseriscilo una volta, poi registralo in un tocco." },
    },
  },

  feature: {
    titleA: "Fotografa il piatto.",
    titleB: { pre: "Riprenditi le ", hl: "calorie", post: "." },
    sub: "Cucina asiatica, contata bene",
  },

  landing: {
    title: "Un diario delle calorie che conosce il nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Foto, parole o codice. Il resto lo conta RiceCal.",
  },
};

export default it;
