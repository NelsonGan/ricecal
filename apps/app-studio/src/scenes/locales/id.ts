import type { LocaleModule } from './types';

/** Indonesian. Translated from ./en; every figure is carried across unchanged. */
const id: LocaleModule = {
  meta: { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia" },

  phone: {
    today: {
      h: "Setiap makan,\nterhitung",
      hl: "terhitung",
      sub: "Satu lingkaran untuk sisa hari ini. Makro dan air di sebelahnya.",
    },
    workout: {
      h: "Catat setiap set,\npecahkan rekormu",
      hl: "pecahkan rekormu",
      sub: "Sesi terakhir di samping tiap set. Trofi saat kamu melampauinya.",
    },
    dish: {
      h: "Atur porsinya,\nangkanya ikut",
      hl: "angkanya ikut",
      sub: "Mangkuk, piring atau potong. Ganti porsi, angkanya menyesuaikan.",
    },
    trends: {
      h: "Lihat ke mana\nminggu ini pergi",
      hl: "minggu ini pergi",
      sub: "Tujuh hari, tiga puluh hari atau setahun. Kalori, air dan berat.",
    },
    feed: {
      h: 'Bagikan makanan,\ntemukan teman',
      hl: 'temukan teman',
      sub: 'Ikuti teman dan bagikan makanan favoritmu.',
    },
    recipes: {
      h: "Masak sekali,\ncatat sekali ketuk",
      hl: "catat sekali ketuk",
      sub: "Isi bahannya dan untuk berapa porsi. Setelah itu satu ketukan.",
    },
    panel: {
      title: "Lima cara catat\nmakanan Asia",
      sub: "Kaki lima, masakan rumah, kemasan dari toko.",
      stats: { usersChoice: 'Pilihan 2K pengguna' },
      metrics: { calories: "Kalori", water: "Air", weight: "Berat" },
      snap    : { t: "Foto piringmu", b: "Tiap hidangan dikenali, ditakar dan dihitung." },
      describe: { t: "Sebut apa yang kamu makan", b: "“Nasi goreng dengan telur dan ayam.”" },
      scan    : { t: "Pindai kemasan", b: "Dibaca langsung dari label, dalam sedetik." },
      search  : { t: "Cari di basis data", b: "Makanan kaki lima, gerai dan masakan rumah." },
      recipes : { t: "Simpan resep kamu", b: "Isi sekali, lalu catat sekali ketuk." },
    },
  },

  feature: {
    titleA: "Foto piringmu.",
    titleB: { pre: "Terima ", hl: "kalorinya", post: " balik." },
    sub: "Makanan Asia, dihitung benar",
  },

  landing: {
    title: "Buku kalori yang kenal nasi goreng.",
    highlight: "nasi goreng",
    subtitle: "Foto, sebut atau pindai. Sisanya RiceCal yang hitung.",
  },
};

export default id;
