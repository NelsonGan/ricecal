import type { LocaleModule } from './types';

/** Filipino. Translated from ./en; every figure is carried across unchanged. */
const fil: LocaleModule = {
  meta: { code: "fil", flag: "🇵🇭", label: "Filipino" },

  phone: {
    today: {
      h: "Bawat kain,\nnabilang",
      hl: "nabilang",
      sub: "Isang bilog para sa natitira. Katabi ang macros at tubig.",
    },
    workout: {
      h: "I-log ang bawat set,\ntalunin ang record mo",
      hl: "talunin ang record mo",
      sub: "Katabi ng bawat set ang huling session. May tropeo kapag nalampasan mo.",
    },
    dish: {
      h: "Piliin ang dami,\nsusunod ang bilang",
      hl: "susunod ang bilang",
      sub: "Mangkok, plato o piraso. Palitan ang serving, susunod ang numero.",
    },
    trends: {
      h: "Tingnan kung saan\nnapunta ang linggo",
      hl: "napunta ang linggo",
      sub: "Pitong araw, tatlumpu o isang taon. Calories, tubig at timbang.",
    },
    feed: {
      h: 'Ibahagi ang pagkain,\nmakahanap ng kaibigan',
      hl: 'makahanap ng kaibigan',
      sub: 'Sundan ang mga kaibigan at ibahagi ang paborito mong pagkain.',
    },
    recipes: {
      h: "Lutuin minsan,\nisang tap na lang",
      hl: "isang tap na lang",
      sub: "Ilagay ang sangkap at para sa ilang tao. Isang tap na lang pagkatapos.",
    },
    panel: {
      title: "Limang paraan sa\npagkaing Asyano",
      sub: "Karinderya, lutong bahay, nakabalot mula sa tindahan.",
      stats: { usersChoice: 'Pinili ng 2K gumagamit' },
      metrics: { calories: "Calories", water: "Tubig", weight: "Timbang" },
      snap    : { t: "Kunan ang plato", b: "Bawat putahe dito ay pinangalanan, sinukat at binilang." },
      describe: { t: "Sabihin ang kinain", b: "“Chicken adobo na may kanin.”" },
      scan    : { t: "I-scan ang pakete", b: "Basa nang diretso sa label, isang segundo lang." },
      search  : { t: "Hanapin sa database", b: "Karinderya, chain at lutong bahay." },
      recipes : { t: "I-save ang niluluto mo", b: "Ilagay minsan, isang tap na lang pagkatapos." },
    },
  },

  feature: {
    titleA: "Kunan ang plato mo.",
    titleB: { pre: "Balik ang ", hl: "calories", post: "." },
    sub: "Pagkaing Asyano, tamang bilang",
  },

  landing: {
    title: "Calorie diary na kilala ang adobo.",
    highlight: "adobo",
    subtitle: "Kunan, sabihin o i-scan. RiceCal na ang bahala sa bilang.",
  },
};

export default fil;
