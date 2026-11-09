import type { LocaleModule } from './types';

/** Turkish. Translated from ./en; every figure is carried across unchanged. */
const tr: LocaleModule = {
  meta: { code: "tr", flag: "🇹🇷", label: "Türkçe" },

  phone: {
    today: {
      h: "Her öğün,\nsayılmış",
      hl: "sayılmış",
      sub: "Kalanı tek halka gösterir. Makrolar ve su hemen yanında.",
    },
    workout: {
      h: "Her seti kaydet,\nrekorunu kır",
      hl: "rekorunu kır",
      sub: "Son antrenmanın her setin yanında. Geçtiğinde bir kupa.",
    },
    dish: {
      h: "Porsiyonu seç,\nsayılar uysun",
      hl: "sayılar uysun",
      sub: "Kâse, tabak ya da parça. Porsiyonu değiştir, sayılar uysun.",
    },
    trends: {
      h: "Bak bakalım\nhafta nereye gitti",
      hl: "hafta nereye gitti",
      sub: "Yedi gün, otuz gün ya da bir yıl. Kalori, su ve kilo.",
    },
    feed: {
      h: 'Yemeğini paylaş,\narkadaşlarını bul',
      hl: 'arkadaşlarını bul',
      sub: 'Arkadaşlarını takip et ve sevdiğin yemekleri paylaş.',
    },
    recipes: {
      h: "Bir kez pişir,\ntek dokunuşla kaydet",
      hl: "tek dokunuşla kaydet",
      sub: "Malzemeleri ve kaç kişilik olduğunu bir kez gir. Sonrası tek dokunuş.",
    },
    panel: {
      title: "Asya yemekleri için\nbeş yol",
      sub: "Sokak lezzetleri, ev yemeği, marketten paketli.",
      stats: { usersChoice: '2K kullanıcının tercihi' },
      metrics: { calories: "Kalori", water: "Su", weight: "Kilo" },
      snap    : { t: "Tabağın fotoğrafını çek", b: "Tabaktaki her yemek adlandırılır, ölçülür ve sayılır." },
      describe: { t: "Ne yediğini söyle", b: "\"Kızarmış tavuklu nasi lemak ve bir teh tarik.\"" },
      scan    : { t: "Paketi tara", b: "Doğrudan etiketten okunur, bir saniyede." },
      search  : { t: "Yemek veritabanında ara", b: "Sokak lezzetleri, zincirler ve ev yemekleri." },
      recipes : { t: "Pişirdiğini kaydet", b: "Bir kez gir, sonra tek dokunuşla kaydet." },
    },
  },

  feature: {
    titleA: "Tabağının fotoğrafını çek.",
    titleB: { pre: "", hl: "Kalorileri", post: " geri al." },
    sub: "Asya mutfağı, düzgün sayılmış",
  },

  landing: {
    title: "Nasi lemak’ı tanıyan bir kalori günlüğü.",
    highlight: "Nasi lemak",
    subtitle: "Çek, söyle ya da tara. Gerisini RiceCal sayar.",
  },
};

export default tr;
