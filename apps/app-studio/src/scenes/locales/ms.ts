import type { LocaleModule } from './types';

/** Malay. Food names stay Malay throughout. Translated from ./en; every figure is carried across unchanged. */
const ms: LocaleModule = {
  meta: { code: "ms", flag: "🇲🇾", label: "Bahasa Melayu" },

  phone: {
    today: {
      h: "Setiap hidangan,\ndikira",
      hl: "dikira",
      sub: "Satu gelang untuk baki hari ini. Makro dan air di sebelahnya.",
    },
    workout: {
      h: "Catat setiap set,\npecahkan rekod anda",
      hl: "pecahkan rekod anda",
      sub: "Sesi lepas di sebelah setiap set. Trofi bila anda melepasinya.",
    },
    dish: {
      h: "Pilih sajian,\nlihat kiraannya",
      hl: "lihat kiraannya",
      sub: "Mangkuk, pinggan atau ketul. Tukar sajian, nombor ikut sama.",
    },
    trends: {
      h: "Lihat ke mana\nminggu ini pergi",
      hl: "minggu ini pergi",
      sub: "Tujuh hari, tiga puluh hari atau setahun. Kalori, air dan berat.",
    },
    feed: {
      h: 'Kongsi hidangan,\ncari komuniti anda',
      hl: 'cari komuniti anda',
      sub: 'Ikuti rakan dan kongsi makanan kegemaran anda.',
    },
    recipes: {
      h: "Masak sekali,\ncatat satu ketukan",
      hl: "catat satu ketukan",
      sub: "Isi bahan dan berapa hidangan. Selepas itu, satu ketukan sahaja.",
    },
    panel: {
      title: "Lima cara catat\nmakanan Asia",
      sub: "Gerai tepi jalan, masakan rumah, bungkusan dari kedai.",
      stats: { usersChoice: 'Pilihan 2K pengguna' },
      metrics: { calories: "Kalori", water: "Air", weight: "Berat" },
      snap    : { t: "Ambil gambar pinggan", b: "Setiap hidangan dinamakan, disukat dan dikira." },
      describe: { t: "Sebut apa anda makan", b: "\"Nasi lemak dengan ayam goreng dan teh tarik.\"" },
      scan    : { t: "Imbas bungkusan", b: "Dibaca terus dari label, dalam sesaat." },
      search  : { t: "Cari dalam pangkalan data", b: "Hidangan gerai, rangkaian dan masakan rumah." },
      recipes : { t: "Simpan resipi anda", b: "Isi sekali, kemudian catat satu ketukan." },
    },
  },

  feature: {
    titleA: "Ambil gambar pinggan.",
    titleB: { pre: "Dapat ", hl: "kalori", post: " terus." },
    sub: "Makanan Asia, dikira betul",
  },

  landing: {
    title: "Diari kalori yang kenal nasi lemak.",
    highlight: "nasi lemak",
    subtitle: "Snap, sebut atau imbas. RiceCal kira selebihnya.",
  },
};

export default ms;
