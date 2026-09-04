import type { Bundle } from './bundle'

/**
 * Bahasa Indonesia.
 *
 * Close enough to `ms` to be tempting to copy and different enough that copying
 * reads wrong: hapus not padam, lewati not langkau, coba not cuba, ubah not
 * sunting, resep not resipi, gratis not percuma. An edit to one is not an edit
 * to the other.
 *
 * Read `en/` before changing anything here. The comments there are the brief.
 */
export const id = {
  common: {
    action: {
      continue: 'Lanjutkan',
      back: 'Kembali',
      cancel: 'Batal',
      save: 'Simpan perubahan',
      done: 'Selesai',
      edit: 'Ubah',
      delete: 'Hapus',
      add: 'Tambah',
      undo: 'Urungkan',
      keep: 'Pertahankan',
      skip: 'Lewati',
      retry: 'Coba lagi',
      close: 'Tutup',
    },

    nav: {
      today: 'Hari ini',
      recipes: 'Makanan',
      activity: 'Aktivitas',
      trends: 'Tren',
      me: 'Saya',
      log: 'Catat makanan',
    },

    date: {
      today: 'Hari ini',
      yesterday: 'Kemarin',
    },

    meal: {
      breakfast: 'Sarapan',
      lunch: 'Makan siang',
      dinner: 'Makan malam',
      snack: 'Camilan',
    },

    macro: {
      carbs: 'Karbo',
      protein: 'Protein',
      fat: 'Lemak',
    },

    unit: {
      kcal: 'kkal',
      kcalUpper: 'KKAL',
      grams: '{{value}}g',
      /** The bare symbol, for a field whose value is typed beside it. */
      gram: 'g',
      gramsOfGoal: '{{value}}/{{goal}}g',
      kg: 'kg',
      lb: 'lb',
      cm: 'cm',
      gramsLong: '{{value}} gram',
    },

    volume: {
      ml: '{{value}} ml',
      l: '{{value}} L',
      mlUnit: 'ml',
      lUnit: 'L',
    },

    count: {
      dayStreak_one: 'rentetan {{count}} hari',
      dayStreak_other: 'rentetan {{count}} hari',
      times_one: '{{count}} kali',
      times_other: '{{count}} kali',
    },

    aiLanguage: {
      open: 'Bahasa yang dipakai fitur AI',
      title: 'Fitur AI bekerja dalam bahasa Inggris',
      body: 'Memotret piring, menceritakan apa yang kamu makan dan bertanya mau makan apa berikutnya semuanya dikirim ke model yang paling paham bahasa Inggris. Ceritakan makananmu dalam bahasa Inggris dan ia memahamimu lebih tepat.',
      results:
        'Yang kembali juga dalam bahasa Inggris. Nama hidangan, bahan dan ukuran porsi disimpan dalam bahasa Inggris di katalog makanan, jadi itulah bahasa yang muncul apa pun setelan aplikasinya.',
      dishes: 'Nama hidangan tetap dalam bahasa saat ditulis.',
      note: 'Ceritakan makanan dalam bahasa Inggris agar paling akurat. Hasilnya juga dalam bahasa Inggris.',
    },

    notFound: {
      title: 'Halaman itu sudah pindah',
      body: 'Tautan yang kamu buka tidak menuju ke mana pun di versi aplikasi ini.',
      action: 'Ke Hari ini',
    },

    offline: {
      title: 'Menunggu koneksi',
      body: 'Yang ini belum tersimpan di ponselmu. Akan dimuat begitu kamu online.',
      dayTitle: 'Hari ini tidak ada di ponselmu',
      dayBody: 'Pilih hari yang pernah kamu buka, atau kembali saat sudah online.',
    },

    a11y: {
      back: 'Kembali',
      close: 'Tutup',
      more: 'Opsi lain',
      decrease: 'Kurangi',
      increase: 'Tambah',
      step: 'Langkah {{current}} dari {{total}}',
      backspace: 'Hapus digit terakhir',
      decimalPoint: 'Titik desimal',
    },
  },

  activity: {
    title: 'Aktivitas',

    connect: {
      title: 'Biar jam tanganmu yang menghitung',
      body: 'Hubungkan aplikasi kesehatan di ponselmu dan setiap jalan kaki, lari dan main bulu tangkis akan menambah jatah hari ini.',

      readTitle: 'YANG KAMI BACA',
      energy: 'Energi aktif',
      energyBody: 'Yang kamu bakar saat bergerak',
      steps: 'Langkah dan jarak',
      stepsBody: 'Kebiasaan harian, bukan target',
      workouts: 'Olahraga',
      workoutsBody: 'Jenis, waktu, pace, detak jantung',

      privacy:
        'Hanya baca. Kami tidak pernah menulis apa pun kembali, dan data kesehatanmu hanya tersimpan di akunmu sendiri.',

      appleBody: 'Apple Health, di iPhone dan Apple Watch',
      connectHealthBody: 'Health Connect: Samsung Health, Fitbit, Garmin',
      heart: 'Detak jantung',
      demo: 'Pakai data demo',
      demoBody: 'Dibuat di perangkat ini, untuk pengembangan',

      connecting: 'Membaca riwayatmu…',
      progress: '{{done}} dari {{total}}',

      emptyTitle: 'Tidak ada yang kembali',
      emptyBody:
        'Kami tidak bisa membaca aktivitas apa pun. Kalau kamu mematikan RiceCal di pengaturan privasi Health, nyalakan lagi lalu coba ulang.',
      retry: 'Coba lagi',

      unavailableTitle: 'Tidak ada data kesehatan di sini',
      simulator:
        'Perangkat ini tidak punya penyimpanan Health untuk dibaca. Di simulator, data buatan yang mengisi layar ini.',
      notInstalled:
        'Health Connect belum disiapkan di ponsel ini. Pasang dari Play Store, nyalakan aplikasi yang merekam gerakanmu, lalu kembali ke sini.',
      notLinked:
        'Build ini tidak menyertakan modul kesehatan. Bangun ulang dev client setelah memasangnya.',
      wrongPlatform: 'Ponsel ini tidak punya penyimpanan kesehatan yang bisa dibaca RiceCal.',
      openStore: 'Buka Play Store',
      checkAgain: 'Periksa lagi',
    },

    today: {
      syncedJustNow: 'Baru saja',
      syncedMinutes: '{{count}} mnt lalu',
      syncedHours: '{{count}} jam lalu',
      syncedDays: '{{count}} hr lalu',
      syncedNever: 'Belum disinkronkan',

      move: 'Gerak',
      exercise: 'Olahraga',
      stand: 'Berdiri',
      stepsRing: 'Langkah',
      moveUnit: '/ {{goal}} kkal',
      exerciseUnit: '/ {{goal}} mnt',
      standUnit: '/ {{goal}} jam',
      stepsUnit: '/ {{goal}}',
      avgUnit: '/ rata-rata {{value}}',
      none: '—',
      noGoal: 'kkal',
      noGoalMinutes: 'mnt',
      noGoalHours: 'jam',

      budgetTitle: 'JATAH DENGAN GERAKAN',
      goal: 'TARGET',
      eaten: 'DIMAKAN',
      burned: 'DIBAKAR',
      left: 'SISA',
      over: 'LEBIH',
      budgetOff: 'Gerakan tidak memperpanjang jatahmu. Nyalakan di pengaturan Aktivitas.',

      todayTitle: 'HARI INI',
      weekTitle: 'MINGGU INI',
      stepsRow: 'Langkah',
      stepsRowValue: '{{steps}} hari ini',
      balanceRow: 'Neraca',
      balanceDeficit: 'defisit {{value}} per hari',
      balanceSurplus: 'surplus {{value}} per hari',
      balanceUnknown: 'Catatan belum cukup',
      historyRowValue_one: '{{count}} olahraga · {{time}}',
      historyRowValue_other: '{{count}} olahraga · {{time}}',
      historyNone: 'Belum ada olahraga',

      syncing: 'Menyinkronkan…',

      demoBadge: 'Data demo',

      storeEmpty:
        'Penyimpanan kesehatan ini terhubung tapi kosong, persis seperti simulator. Data buatan akan mengisi layar ini.',

      noStandNoteGeneric:
        'Aplikasi kesehatanmu tidak melaporkan jam berdiri, jadi kami tampilkan langkah.',
    },

    workout: {
      distance: 'JARAK',
      time: 'WAKTU',
      pace: 'PACE',
      speed: 'KECEPATAN',
      paceUnit: '{{value}} /km',
      speedUnit: '{{value}} km/j',
      avgHr: 'RATA HR',
      maxHr: 'MAKS HR',
      elevation: 'ELEVASI',
      bpm: '{{value}} bpm',
      metres: '{{value}} m',

      zonesTitle: 'ZONA DETAK JANTUNG',

      from: 'Dari {{source}}',
      missing: 'Olahraga ini sudah tidak ada di aplikasi kesehatanmu.',
    },

    steps: {
      title: 'Langkah',
      todaySoFar: 'Hari ini sejauh ini',
      goalLine: 'Target {{goal}} langkah',
      over: '{{value}} lebih',
      under: '{{value}} lagi',
      unit: 'langkah · {{distance}}',

      morning: 'Pagi',
      afternoon: 'Siang',
      evening: 'Malam',
      noHours: 'Tidak ada rincian per jam untuk hari ini.',

      weekTitle: 'MINGGU INI',
      dailyAvg: 'RATA HARIAN',
      goalDays: 'HARI TARGET',
      best: 'TERBAIK',

      steadyNote: 'Hari-harimu merata. Apa pun yang kamu lakukan, itu sudah jadi kebiasaan.',
      shortNote: 'Belum cukup hari untuk melihat polanya.',
    },

    balance: {
      chartTitle: 'Masuk versus keluar',
      deficit: 'defisit {{value}}',
      surplus: 'surplus {{value}}',
      even: 'Seimbang',
      eatenLegend: 'Dimakan',
      burnedLegend: 'Dibakar',

      splitTitle7d: 'DARI MANA BAKARANNYA · 7 HARI',
      splitTitle30d: 'DARI MANA BAKARANNYA · 30 HARI',
      splitTitle1y: 'DARI MANA BAKARANNYA · 12 BULAN',
      resting: 'Istirahat',
      restingBody: 'Sekadar hidup',
      workouts: 'Olahraga',
      workoutsBody: 'Yang sesimu habiskan',
      walking: 'Berjalan',
      walkingBody: 'Langkah dan urusan sehari-hari',
      kcal: '{{value}} kkal',

      partial:
        'Berdasarkan {{days}} dari {{total}} hari yang punya catatan makan dan angka istirahat.',
      noRestingTitle: 'Tidak ada energi istirahat',
      noRestingBody:
        'Aplikasi kesehatanmu tidak melaporkan yang dibakar tubuhmu saat istirahat, jadi tidak ada neraca harian untuk digambar. Langkah, olahraga dan energi aktif tidak terpengaruh.',
      empty: 'Catat beberapa makan sambil memakai jam tanganmu dan ini akan terisi.',
    },

    history: {
      title: 'Riwayat',
      weekTitle: 'MINGGU INI',
      sessions: 'SESI',
      time: 'WAKTU',
      burned: 'DIBAKAR',
      allTitle: 'SEMUA SESI',
      empty: 'Belum ada olahraga tercatat.',
      emptyBody: 'Apa pun yang direkam jam tangan atau ponselmu akan muncul di sini.',
    },

    settings: {
      title: 'Sinkronisasi kesehatan',
      connectedTitle: 'TERHUBUNG',
      sourceTitle: 'YANG KAMI BACA',
      lastSynced: 'Terakhir disinkronkan {{when}}',
      syncNow: 'Sinkronkan sekarang',
      syncing: 'Menyinkronkan…',
      extendBudget: 'Gerakan memperpanjang jatahku',
      extendBudgetBody:
        'Kalori yang dibakar ditambahkan ke hari itu, tidak pernah dikurangi dari yang kamu makan.',
      stepGoal: 'Target langkah',
      disconnect: 'Putuskan',
      disconnectBody: 'Berhenti menyinkronkan. Semua yang sudah terbaca tetap ada di riwayatmu.',
      disconnectConfirm: 'Berhenti menyinkronkan?',
      disconnectConfirmBody:
        'RiceCal akan berhenti membaca aplikasi kesehatanmu. Aktivitas yang sudah tercatat tetap ada.',
      clearDemo: 'Hapus data demo',
      clearDemoBody: 'Menghapus setiap hari dan sesi buatan dari akun ini.',
      granted: 'Aktif',
      notGranted: 'Tidak diizinkan',
      partial: 'Sebagian data tidak dibagikan',
    },

    provider: {
      apple_health: 'Apple Health',
      health_connect: 'Health Connect',
      demo: 'Data demo',
    },

    zone: {
      easy: 'Ringan',
      steady: 'Stabil',
      hard: 'Berat',
      peak: 'Puncak',
    },

    kind: {
      run: 'Lari',
      walk: 'Jalan',
      hike: 'Hiking',
      cycle: 'Bersepeda',
      swim: 'Renang',
      badminton: 'Bulu tangkis',
      tennis: 'Tenis',
      football: 'Sepak bola',
      basketball: 'Basket',
      volleyball: 'Voli',
      gym: 'Gym',
      strength: 'Latihan beban',
      hiit: 'HIIT',
      yoga: 'Yoga',
      dance: 'Menari',
      martialArts: 'Bela diri',
      rowing: 'Dayung',
      stairs: 'Tangga',
      other: 'Olahraga',
    },

    unit: {
      kcal: '{{value}} kkal',
    },
  },

  auth: {
    choose: {
      email: 'Lanjutkan dengan email',
    },

    password: {
      signUpTitle: 'Pilih kata sandi',
      signUpSubtitle: 'Untuk {{email}}. Kamu akan memakainya untuk masuk lagi.',
      signInTitle: 'Masukkan kata sandimu',
      signInSubtitle: 'Masuk sebagai {{email}}.',

      field: 'KATA SANDI',
      confirmField: 'KONFIRMASI KATA SANDI',
      placeholder: 'Minimal 8 karakter',
      show: 'Tampilkan kata sandi',
      hide: 'Sembunyikan kata sandi',

      createAccount: 'Buat akun',
      signIn: 'Masuk',
      forgot: 'Lupa kata sandi?',

      codeInstead: 'Kirimi aku kode saja',

      haveAccount: 'Sudah punya akun? Masuk',
      needAccount: 'Baru di sini? Buat akun',

      maybeExisting: 'Kalau sudah ada akun di alamat ini, masuk di bawah atau minta sebuah kode.',
    },

    verify: {
      title: 'Cek emailmu',
      sentTo: 'Kami mengirim kode 6 digit ke {{email}}. Ada di judul emailnya juga.',
      sendingTo: 'Mengirim kode 6 digit ke {{email}}...',

      field: 'KODE',
      placeholder: '000000',
      submit: 'Lanjutkan',

      resend: 'Kirim ulang',
      resendIn: 'Kirim ulang dalam {{seconds}}d',
      resent: 'Terkirim. Cek emailmu lagi.',
    },

    reset: {
      askTitle: 'Atur ulang kata sandimu',
      askSubtitle: 'Beri tahu kami alamat di akunmu dan kami akan mengirimkan sebuah kode.',
      send: 'Kirimi aku kode atur ulang',

      newTitle: 'Pilih kata sandi baru',
      newSubtitle: 'Hampir selesai. Pilih sesuatu yang kamu ingat.',
      field: 'KATA SANDI BARU',
      confirmField: 'KONFIRMASI KATA SANDI BARU',
      save: 'Simpan dan masuk',
      done: 'Kata sandi diganti. Kamu sudah masuk.',
    },

    captcha: {
      title: 'Satu pemeriksaan cepat',
      body: 'Cloudflare ingin memastikan kamu manusia. Cuma sedetik.',
    },

    ended: {
      title: 'Telah keluar',
      body: 'Sesi ini sudah berakhir. Masuk lagi untuk melanjutkan.',
    },

    errors: {
      passwordShort: 'Pakai minimal 8 karakter.',
      passwordRequired: 'Masukkan kata sandimu.',
      passwordMismatch: 'Kedua kata sandi tidak sama.',
      codeLength: 'Kodenya 6 digit.',

      invalid_credentials:
        'Email dan kata sandi itu tidak cocok. Coba lagi, atau minta sebuah kode.',
      email_not_confirmed: 'Konfirmasi alamat emailmu dulu. Kami sudah mengirimkan kode baru.',
      account_exists: 'Coba masuk dengan alamat ini, atau minta kami mengirimkan sebuah kode.',
      code_invalid: 'Kode itu salah atau sudah kedaluwarsa. Minta yang baru.',
      weak_password: 'Kata sandi itu terlalu mudah ditebak. Coba yang lebih panjang.',
      same_password: 'Itu kata sandi yang sudah kamu punya. Pilih yang lain.',
      rate_limited: 'Tunggu sebentar sebelum meminta email lagi.',
      rate_limited_in: 'Tunggu {{seconds}} detik sebelum meminta email lagi.',
      captcha: 'Kami tidak bisa memastikan kamu manusia. Cek koneksimu lalu coba lagi.',
      offline: 'Tidak ada koneksi. Coba lagi saat kamu online.',
      unknown: 'Ada yang tidak beres. Coba lagi.',
    },
  },

  onboarding: {
    setup: {
      title: 'Sebelum kita mulai',
      subtitle: 'Keduanya mengubah bahasa dan satuan di beberapa layar berikutnya.',
      unitsTitle: 'SATUAN',
      metric: 'Metrik',
      imperial: 'Imperial',
      metricNote: 'Sentimeter dan kilogram.',
      imperialNote: 'Kaki, inci dan pon.',
    },

    welcome: {
      title: 'Pelacak kalori untuk orang Asia',
      subtitle: 'Nasi lemak, pho, laksa, nasi char siu.',
      perks: {
        track: { title: 'Lacak setiap kalori', subtitle: 'Foto atau cari dalam hitungan detik' },
        habit: {
          title: 'Bangun kebiasaan lebih sehat',
          subtitle: 'Target lembut, rentetan, tanpa menghakimi',
        },
        local: {
          title: '50.000 hidangan Asia',
          subtitle: 'Dan 3 juta kemasan, dibaca lewat barkode',
        },
      },
      start: 'Mulai',
      signIn: 'Saya sudah punya akun',
    },

    about: {
      title: 'Beberapa hal dasar',
      height: 'TINGGI',
      heightPlaceholder: '170',
      weight: 'BERAT',
      weightPlaceholder: '65',
      feet: 'ft',
      inches: 'in',
      feetPlaceholder: '5',
      inchesPlaceholder: '9',
      inchesLabel: 'INCI',
      weightPlaceholderLb: '145',
      sex: 'JENIS KELAMIN',
      female: 'Perempuan',
      male: 'Laki-laki',
      age: 'USIA',
      agePlaceholder: '29',
      years: 'tahun',
      targetWeight: 'BERAT TARGET',
      targetWeightUnset: '—',
      targetWeightHint: 'Geser untuk menentukan berat yang kamu tuju.',
      targetWeightLocked: 'Isi beratmu dulu.',
    },

    activity: {
      title: 'Seberapa aktif harimu?',
      sedentary: { title: 'Kebanyakan duduk', subtitle: 'Kantor, menyetir, belajar' },
      light: { title: 'Sedikit aktif', subtitle: 'Sedikit jalan, pekerjaan rumah ringan' },
      onFeet: { title: 'Banyak berdiri', subtitle: 'Ritel, perawat, lapangan' },
      veryActive: { title: 'Sangat aktif', subtitle: 'Latihan hampir tiap hari' },
    },

    source: {
      title: 'Dari mana kamu tahu tentang kami?',
      subtitle: 'Ini membantu kami tahu harus muncul di mana berikutnya.',
      xiaohongshu: 'XiaoHongShu',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      reddit: 'Reddit',
      facebook: 'Facebook',
      threads: 'Threads',
      appStore: 'App Store',
      googlePlay: 'Google Play',
      friend: 'Teman atau keluarga',
      other: 'Tempat lain',
    },

    calculating: {
      title: 'Menyusun rencanamu',
      subtitle: 'Dihitung dari jawabanmu, bukan rata-rata.',
      steps: {
        budget: 'Target kalori harian',
        macros: 'Pembagian karbo, protein dan lemak',
        catalogue: 'Mencocokkan makananmu',
      },
    },

    target: {
      title: 'Jatah harianmu',
      perDay: 'KKAL PER HARI',
      goalWeight: 'BERAT TUJUAN',
      goalBy: 'DIPERKIRAKAN',
      maintain: 'PERTAHANKAN',
      maintainValue: 'Stabil',
      looksRight: 'Ini sudah pas',
      adjust: 'Ubah jawabanku',
    },

    health: {
      title: 'Biar jam tanganmu yang menghitung',
      subtitle: 'Yang kamu bakar ditambahkan ke jatah hari ini.',
      demo: 'Pakai aktivitas buatan',
      emptyToast:
        'Tidak ada yang kembali dari Health. Kamu bisa menghubungkan lagi dari Aktivitas.',
      failedToast:
        'Kami tidak bisa terhubung ke penyimpanan kesehatanmu. Kamu bisa coba lagi dari Aktivitas.',
      reassurance: 'Hanya baca. Kami tidak pernah menulis apa pun kembali.',
    },

    notifications: {
      title: 'Satu dorongan di saat yang tepat',
      subtitle: 'Tiga pengingat makan, di jam pilihanmu sendiri.',
      meals: 'Pengingat makan',
      scans: 'Piringmu sudah dihitung',
      nothingElse: 'Dan tidak ada yang lain',
      promise: 'Matikan salah satunya di Saya, Pengingat.',
      blocked: 'Pengingat mati untuk RiceCal. Kamu bisa menyalakannya di Saya, Pengingat.',
    },

    tutorial: {
      appBar: 'Cara kerja RiceCal',
      skip: 'Lewati',
      next: 'Berikutnya',
      done: 'Mulai mencatat',
      offerTitle: 'Baru di sini?',
      offerBody: 'Tur 30 detik tentang cara mencatat.',
      offerAction: 'Tunjukkan',

      log: {
        title: 'Tiga cara mencatat',
        subtitle: 'Ketuk tombol hijau di Hari ini, lalu pilih satu.',
        snap: 'Foto',
        snapBody: 'Sebuah foto piring',
        describe: 'Ceritakan',
        describeBody: 'Ketik apa yang kamu makan',
        search: 'Cari',
        searchBody: 'Milik kami atau kamu',
        barcode: 'Punya kemasan? Kamera juga memindai barkode.',
      },

      read: {
        title: 'Ia mendarat di harimu',
        subtitle: 'Kami menamai hidangannya, mengukur porsinya dan menghitungnya untukmu.',
        exampleName: 'Nasi lemak ayam',
        exampleDetail: '1 piring, 320 g',
        exampleKcal: '644',
        tip: 'Foto lurus dari atas, dengan seluruh piring dalam bingkai.',
      },

      fix: {
        title: 'Salah? Bilang saja',
        subtitle: 'Ketuk catatannya, lalu ikon berkilaunya. Kata-kata biasa sudah cukup.',
        chipHalf: 'Setengah porsi',
        chipNoRice: 'Tanpa nasi',
        chipExtra: 'Tambah minuman',
        typed: 'Nasinya saya makan setengah saja',
        beforeLabel: 'SEBELUM',
        before: '644',
        afterLabel: 'SESUDAH',
        after: '498',
      },

      day: {
        title: 'Lihat harimu terisi',
        subtitle: 'Cincin itu sisanya. Barnya adalah karbo, protein dan lemak.',
        ringCaption: 'SISA KKAL',
        carbs: 'Karbo',
        protein: 'Protein',
        fat: 'Lemak',
        note: 'Gerakan dari jam tanganmu ditambahkan di atas, tidak pernah dikurangi.',
      },
    },

    saving: {
      title: 'Menyimpan jawabanmu…',
      offlineTitle: 'Menunggu koneksi',
      offlineBody: 'Jawabanmu aman di ponsel ini. Kami akan menyimpannya begitu kamu online.',
      failedTitle: 'Kami tidak bisa menyimpan jawabanmu',
      failedBody: 'Tidak ada yang hilang. Cek koneksimu lalu coba lagi.',
    },

    account: {
      title: 'Simpan progresmu',
      subtitle: 'Jawabanmu sudah siap. Akun menjaganya tetap aman kalau kamu ganti ponsel.',
      signInTitle: 'Selamat datang kembali',
      signInSubtitle: 'Masuk dan buku harianmu lanjut dari tempat terakhir.',
      apple: 'Lanjutkan dengan Apple',
      google: 'Lanjutkan dengan Google',
      or: 'ATAU',
      email: 'EMAIL',
      emailPlaceholder: 'you@email.com',
      errors: {
        email: 'Itu tidak terlihat seperti alamat email.',
      },
    },
  },

  logging: {
    today: {
      title: 'Hari ini',
      backToTodayA11y: 'Kembali ke hari ini',
      kcalLeft: 'SISA KKAL',
      kcalOver: 'KKAL LEBIH',
      kcalOfGoal: '/{{goal}} KKAL',
      showGoals: 'Tampilkan jatah hari ini',
      showLeft: 'Tampilkan sisanya',
      overNote: 'Sedikit lebih hari ini, besok hitungan baru.',
      overNoteOn: 'Sedikit lebih di hari itu.',
      burnedNote: '+{{kcal}} dari bergerak hari ini',
      burnedNoteOn: '+{{kcal}} dari bergerak di hari itu',
      logHeading: 'DIMAKAN · {{kcal}} KKAL',
      analysing: 'Membaca piringmu',
      analysingHint: 'Menghitung begitu tahu ini apa',
      describing: 'Membaca yang kamu tulis',
      describingRead: 'Membaca yang kamu tulis…',
      scanningRead: 'Membaca piringmu…',
      scanningMatch: 'Mencarinya di katalog…',
      scanningPortion: 'Mengukur porsinya…',
      scanningCount: 'Menghitung kalorinya…',
      refiningApply: 'Menerapkan koreksimu…',
      refiningCount: 'Menghitung ulang kalorinya…',
      scanDoneTitle: 'Piringmu sudah dihitung',
      describeDoneTitle: 'Makananmu sudah dihitung',
      scanDoneBody: '{{food}} · {{kcal}} kkal',
      scanDoneBodyPlain: 'Ketuk untuk melihat isinya.',
      deleteEntry: 'Hapus',
      noFoodTitle: 'Tidak ada makanan di foto ini',
      noFoodTypedTitle: 'Tidak ada makanan di yang kamu tulis',
      noFoodHint: 'Tidak ada yang ditambahkan ke harimu.',
      noFoodDismiss: 'Tutup',
      analysisFailedTitle: 'Tidak bisa membaca yang ini',
      analysisFailedHint: 'Ketuk untuk memilih hidangannya sendiri',

      noBudgetTitle: 'Belum ada jatah harian',
      noBudgetBody: 'Tentukan targetmu dan cincin itu punya sesuatu untuk diisi.',
      noBudgetAction: 'Tentukan targetku',
    },

    week: {
      a11y: {
        plain: '{{day}}',
        ahead: '{{day}}, belum tiba',
        under: '{{day}}, di bawah target',
        over: '{{day}}, di atas target',
        missed: '{{day}}, tidak ada catatan',
      },
    },

    calendar: {
      showMonth: 'Tampilkan bulan',
      showDay: 'Tampilkan hari',
      previousMonth: 'Bulan sebelumnya',
      nextMonth: 'Bulan berikutnya',
      legend: {
        under: 'Di bawah target',
        over: 'Di atas target',
        missed: 'Tidak dicatat',
      },
      dayHeading: '{{day}}',
      dayKcal: '{{kcal}} kkal',
      dayEmpty: 'Tidak ada catatan di hari itu.',
    },

    selector: {
      title: 'Catat satu hidangan',
      remaining: 'sisa {{count}} kkal',
      snap: 'Foto',
      describe: 'Ceritakan',
      search: 'Cari',
    },

    capture: {
      tabs: 'Kamu mengarahkan ke apa',
      meal: 'Makanan',
      barcode: 'Barkode',
      scansLeft_zero: 'Jatah pindai hari ini habis. Kembali besok.',
      scansLeft_one: 'sisa {{count}} pindai hari ini',
      scansLeft_other: 'sisa {{count}} pindai hari ini',
    },

    barcode: {
      permissionTitle: 'Izinkan RiceCal memakai kamera',
      permissionBody: 'Kamera membaca barkode di kemasan. Tidak ada yang direkam atau diunggah.',
      aim: 'Arahkan kamera ke barkode di kemasan.',
      noCamera: 'Perangkat ini tidak punya kamera, jadi tidak ada yang bisa dipindai di sini.',
      failedTitle: 'Tidak ada jawaban',
      failed:
        'Kami tidak bisa menghubungi katalog saat ini. Kemasannya mungkin tidak apa-apa; koneksinya yang bermasalah.',
      tryAgain: 'Pindai lagi',
      photographLabel: 'Foto labelnya',
      labelPrompt: 'Kemasan ini belum ada pada kami. Foto label gizinya dan kami akan membacanya.',
    },

    describe: {
      placeholder: 'Nasi lemak dengan ayam goreng dan teh tarik',
      send: 'Catat makanan ini',
    },

    camera: {
      title: 'Foto piringmu',
      analysing: 'Mencari tahu apa yang ada di piring',
      permissionTitle: 'Butuh akses kamera',
      permissionBody:
        'RiceCal memakai kamera untuk membaca piringmu. Tidak ada yang keluar dari ponselmu.',
      permissionSettings: 'Buka Pengaturan',
      shutter: 'Ambil foto',
      library: 'Pilih dari galeri',
      flip: 'Balik kamera',
      captured: 'Foto yang baru kamu ambil',
      photoOf: 'Foto {{food}}',
    },

    added: {
      toast: 'Ditambahkan, {{kcal}} kkal',
      removedToast: 'Dihapus dari hari ini',
    },

    search: {
      title: 'Cari',
      placeholder: 'Cari hidangan apa saja',
      clear: 'Bersihkan pencarian',
      tabs: 'Cari di makanan yang mana',
      tabCatalogue: 'Semua makanan',
      tabMine: 'Makanan saya',
      tabPast: 'Pernah dimakan',
      mineEmptyTitle: 'Belum ada makanan buatanmu',
      mineEmptyBody:
        'Satu panci bersama tidak punya ukuran porsi. Masukkan apa saja isinya dan untuk berapa orang, sekali saja, dan mencatatnya cuma satu ketukan setelah itu.',
      mineNoMatchBody: 'Tidak ada makananmu yang cocok dengan itu.',
      mineOfflineBody: 'Makananmu ada di server. Ini akan dimuat begitu kamu kembali online.',
      pastEmptyTitle: 'Belum ada yang dicatat',
      pastEmptyBody: 'Makanan yang Anda catat muncul di sini, siap ditambahkan lagi.',
      pastNoMatchBody: 'Tidak ada yang pernah Anda makan cocok dengan itu.',
      pastOfflineBody: 'Catatan Anda ada di server. Ini akan dimuat begitu Anda kembali online.',
      place: {
        mamak: 'Mamak',
        kopitiam: 'Kopitiam',
        hawker: 'Kaki lima',
        packaged: 'Kemasan',
        home: 'Masakan rumah',
      },
      emptyTitle: 'Tidak ada hidangan dengan nama itu',
      emptyBody: 'Coba kata yang lebih pendek, atau kurangi katanya.',
      offlineTitle: 'Tidak ada koneksi',
      offlineBody: 'Daftar hidangannya ada di server. Ini akan jalan begitu kamu online lagi.',
      errorTitle: 'Tidak bisa mencari',
      errorBody: 'Ada yang tidak beres saat mencarinya. Coba lagi sebentar.',
    },

    detail: {
      servings: 'Porsi',
      typeServings: 'Ketik jumlah persisnya',
      total: 'TOTAL KKAL',
      moreNutrients: 'Nutrisi lainnya',
      fibre: 'Serat',
      sugar: 'Gula',
      sodium: 'Garam (natrium)',
      milligrams: '{{value}}mg',
      fixTitle: 'Perbaiki dengan mengetik',
      fixPlaceholder: 'tanpa sambal, dan porsinya setengah piring',
      fixAction: 'Perbaiki',
      fixNotApplied: 'Tidak bisa menerapkannya. Coba ubah kalimatnya',
      fixNoCalories: 'Itu tidak mengubah kalorinya, jadi tidak ada yang berubah',
      fixNotUnderstood: 'Itu tidak terbaca. Coba katakan dengan cara lain',
      fixNoMatch: 'Hidangan itu tidak terpecahkan. Makanan Anda tidak berubah',
      fixNoChange: 'Tidak ada di piring yang cocok dengan itu',
      fixFailed: 'Itu tidak berhasil dikirim. Coba lagi',
      plateTitle: 'BAHAN',
      plateHeading: 'Bahan',
      plateTotal: 'Total',
      plateNone: 'Ini dihitung sebagai satu hal. Edit untuk memerincinya jadi bahan.',
      addPart: 'Tambah bahan',
      addPartTitle: 'Tambah bahan',
      partAdded: '{{food}} ditambahkan ke piring',
      addPartFailed: 'Tidak bisa menambahkan itu. Coba lagi',
      addPartTyped: 'Entri ini memakai angka kalori Anda sendiri, jadi tidak bisa dirinci',
      plateEmptied:
        'Tidak ada yang tersisa di piring. Catatannya kembali dihitung sebagai satu porsi.',
      times: '× {{amount}}',
      grams: '({{grams}} g)',
      partKcal: '{{kcal}} kkal',
      gramsShort: '{{grams}} g',
      gramsField: 'Berat dalam gram',
      lessOf: 'Kurangi {{name}}',
      moreOf: 'Tambah {{name}}',
      removeOf: 'Hapus {{name}}',
      replacePart: 'Ganti',
      replaceOf: 'Ganti {{name}}',
      partReplaced: '{{food}} ada di piring sebagai gantinya',
      editKcal: 'Kalori',
      figuresTitle: 'Angkamu sendiri',
      macrosTitle: 'Makro',
      editFigures: 'Ubah kalori dan makro',
      editPlate: 'Ubah bahan',
      editDetails: 'Ubah nama, hari dan waktu',
      yourFigures: 'Angkamu sendiri, bukan angka aplikasi.',
      nameField: 'Nama',
      numbersReset: 'Pakai angka aplikasi',
      servingWord: 'porsi',
      quickFix: {
        halfPortion: 'Setengah porsi',
        noSambal: 'Tanpa sambal',
        addEgg: 'Tambah telur',
        extraRice: 'Nasi tambah',
      },
      editByHand: 'Ubah rinciannya sendiri',
      whenValue: '{{day}} pukul {{time}}',
      whenRow: 'Tanggal',
      dayTitle: 'Hari',
      timeTitle: 'Waktu',
      hour: 'Jam',
      minute: 'Menit',
      am: 'pagi',
      pm: 'sore',
      movedTo: 'Dipindah ke {{day}}',
      save: 'Simpan',
      saveFailed: 'Tidak bisa menyimpan perubahan itu',
      discardTitle: 'Keluar tanpa menyimpan?',
      discardBody: 'Yang kamu ubah di sini dibuang dan catatannya tetap seperti semula.',
      discardConfirm: 'Buang',
      deleteEntry: 'Hapus catatan ini',
      deleteTitle: 'Hapus catatan ini?',
      deleteBody: 'Ia langsung keluar dari hari ini dan hitungannya naik lagi.',
      addToDiary: 'Tambahkan ke buku harian',
      decreaseServing: 'Kurang satu',
      increaseServing: 'Tambah satu',
      choosePicture: 'Pilih gambar untuk catatan ini',
      addPicture: 'Ketuk untuk menambah gambar',
      photoFailed: 'Tidak bisa menyimpan foto itu',
      replacePhoto: 'Ganti foto dengan gambar',
      replacePhotoTitle: 'Ganti fotomu?',
      replacePhotoBody:
        'Catatan ini menyimpan foto atau gambar, bukan keduanya. Fotomu dari piring aslinya hilang selamanya.',
      replacePhotoConfirm: 'Pilih gambar',
      shareEntry: 'Bagikan makanan ini',
    },

    share: {
      loggedBy: 'Dicatat oleh',
      brand: 'RiceCal',
      text: '{{food}}, {{kcal}} kkal. Dicatat dengan RiceCal',
      failed: 'Tidak bisa membuat gambar itu',
    },

    icon: {
      title: 'Pilih sebuah gambar',
      searchTab: 'Cari',
      cameraTab: 'Kamera',
      searchLabel: 'Cari gambar',
      searchPlaceholder: 'nasi lemak, teh tarik, ikan',
      noMatch: 'Tidak ada yang cocok dengan “{{query}}”.',
    },

    water: {
      title: 'Air',
      count: '{{filled}} / {{goal}} ml',
      addTitle: 'Tambah air',
      left: 'sisa {{amount}} ml',
      add: 'Tambah {{amount}} ml',
      customLabel: 'Jumlah lain',
      customPlaceholder: '600',
      customAdd: 'Tambahkan jumlah ini',
      customRemove: 'Kurangi jumlah ini',
      added: '{{amount}} ml air',
      removed: '{{amount}} ml dikurangi',
      undo: 'Urungkan',
      level: '{{filled}} dari {{goal}} ml diminum hari ini',
    },
  },

  progress: {
    title: 'Tren',

    ofDays: '{{done}} dari {{total}}',

    metric: {
      calories: 'Kalori',
      water: 'Air',
      weight: 'Berat',
      caloriesUnit: 'rata-rata',
      waterUnit: 'ml',
      none: '—',
      a11y: '{{metric}}, {{value}}',
    },

    range: {
      label: 'Rentang',
      '7d': '7H',
      '30d': '30H',
      '1y': '1T',
      span7d: '7 hari terakhir',
      span30d: '30 hari terakhir',
      span1y: '12 bulan terakhir',
      week: 'Mg {{index}}',
      weekLong: 'Minggu {{index}}',
    },

    calories: {
      goalNote: 'Target {{goal}} kkal per hari',
      goalNoteWeekly: 'Rata-rata mingguan, target {{goal}} per hari',
      goalNoteMonthly: 'Rata-rata bulanan, target {{goal}} per hari',
      noGoal: 'Belum ada jatah harian',
      under: '{{value}} kurang',
      over: '{{value}} lebih',
      chart: 'Kalori per hari, dipecah menurut karbo, protein dan lemak',

      grams: '{{value}} g',
      shareOfIntake: '{{value}}% dari asupan',

      goalTitle: 'DIBANDING TARGETMU',
      daysUnder: 'Hari di bawah {{goal}}',
      daysLogged: 'Hari dicatat penuh',

      notableTitle: 'BULAN YANG MENONJOL',
      monthAverage: 'rata-rata {{value}}',

      emptyTitle: 'Tidak ada makanan di rentang ini',
      emptyBody: 'Catat sesuatu dan barnya terisi mulai hari kamu melakukannya.',
    },

    water: {
      dayNote: 'Setiap kolom adalah satu hari dibanding targetmu',
      weeklyNote: 'Setiap kolom adalah satu minggu, dirata-rata dibanding targetmu',
      monthlyNote: 'Setiap kolom adalah satu bulan, dirata-rata dibanding targetmu',
      goalPill: 'target {{amount}}',
      chart: 'Air per hari dibanding target {{amount}}',

      reached: 'Target tercapai',
      short: 'Kurang dari target',

      goalDays: 'HARI TARGET',
      bestDay: 'HARI TERBAIK',
      bestMonth: 'BULAN TERBAIK',
      yearAverage: 'RATA TAHUN',
      total: 'TOTAL',

      todayTitle: 'HARI INI',

      habitTitle: 'KEBIASAAN',
      daysAtLeast: 'Hari pada {{amount}} atau lebih',
      daysLogged: 'Hari dicatat',
      monthsAveraging: 'Bulan rata-rata {{amount}}+',
      monthsLogged: 'Bulan dicatat',

      emptyTitle: 'Tidak ada air dicatat di rentang ini',
      emptyBody: 'Catat satu minuman di Hari ini dan ini akan terisi.',
    },

    weight: {
      peakOn: '{{value}} {{unit}} pada {{date}}',
      peakIn: '{{value}} {{unit}} di {{month}}',
      change: '{{value}} {{unit}}',
      chart: 'Beratmu selama {{span}}',

      thisWeek: 'MINGGU INI',
      thisMonth: 'BULAN INI',
      thisYear: 'TAHUN INI',
      average7: 'RATA 7 HARI',
      average30: 'RATA 30 HARI',
      lightest: 'TERINGAN',
      weighIns: 'PENIMBANGAN',
      monthsLogged: 'BULAN DICATAT',

      toGoal: '{{value}} {{unit}} lagi ke target {{target}} {{unit}}',
      noTarget: 'Belum ada berat target',
      atGoal: 'Sudah di berat targetmu',
      weeksAway: '~{{count}} minggu',

      recentTitle: 'PENIMBANGAN TERBARU',
      add: 'Tambah',
      weekByWeek: 'MINGGU DEMI MINGGU',
      byQuarter: 'PER KUARTAL',
      quarter: '{{from}} sampai {{to}}',

      reading: '{{value}} {{unit}}',
      readingToday: 'Hari ini',
      firstReading: 'Pertama',

      sheetTitle: 'Tambah berat',
      sheetEditTitle: 'Penimbangan pada {{date}}',
      thisMorning: 'Pagi ini',
      down: '{{value}} {{unit}} turun dari {{day}}',
      up: '{{value}} {{unit}} naik dari {{day}}',
      same: 'Sama seperti {{day}}',
      save: 'Simpan penimbangan',
      saved: 'Penimbangan tersimpan',
      remove: 'Hapus pembacaan ini',
      removeTitle: 'Hapus pembacaan ini?',
      removeBody:
        'Grafiknya kehilangan hari ini. Kalau ini yang terbaru, jatahmu kembali ke yang sebelumnya.',

      emptyTitle: 'Tidak ada penimbangan di rentang ini',
      emptyBody: 'Satu pembacaan menggambar satu titik. Dua menggambar satu garis.',
    },
  },

  profile: {
    home: {
      title: 'Saya',
      memberSince: 'Anggota sejak {{month}}',
      streak: 'RENTETAN',
      goal: 'TARGET',
      pro: 'RiceCal Pro',
      proTrial: 'Uji coba berakhir {{when}}',
      proTrialTomorrow: 'besok',
      proTrialOn: 'pada {{date}}',
      noName: 'Akunmu',
      signOutTitle: 'Keluar?',
      signOutBody: 'Catatanmu tetap aman. Masuk lagi di ponsel mana pun untuk melanjutkannya.',
      proTrialIn_one: 'dalam {{count}} hari',
      proTrialIn_other: 'dalam {{count}} hari',
      proActive: 'Paket {{plan}}, aktif',
      proActivePlain: 'Pro, aktif',
      proNone: 'Paket gratis',
      metric: 'Metrik',
      imperial: 'Imperial',
      settings: 'PENGATURAN',
      personalisation: 'Personalisasi',
      goals: 'Target dan sasaran',
      goalsValue: '{{kcal}} kkal',
      reminders: 'Pengingat',
      remindersValue: '{{count}} aktif',
      healthOff: 'Tidak terhubung',
      units: 'Bahasa dan satuan',
      tutorial: 'Cara kerja RiceCal',
      help: 'Pusat bantuan',
      rate: 'Beri nilai RiceCal',
      account: 'Akun',
      signOut: 'Keluar',
    },

    account: {
      title: 'Akun',
      signedInAs: 'MASUK SEBAGAI',
      legalTitle: 'KETENTUAN RINCI',
      privacy: 'Kebijakan Privasi',
      terms: 'Ketentuan Penggunaan',
      deleteTitle: 'HAPUS AKUN ANDA',
      deleteBody: 'Semua di bawah ini terhapus begitu Anda mengonfirmasi.',
      goesDiary: 'Setiap makanan, timbangan, air dan catatan',
      goesPhotos: 'Setiap foto yang Anda ambil',
      goesRecipes: 'Makanan yang Anda tulis, termasuk yang dipublikasikan',
      goesProfile: 'Profil, pengaturan dan info masuk Anda',
      cancelFirst: 'Batalkan langganan Anda di toko dulu, atau tagihan akan terus berjalan.',
      action: 'Hapus akun saya',
      confirmTitle: 'Hapus akun Anda?',
      confirmBody:
        'Ini tidak bisa dibatalkan. Setelah itu catatan Anda tidak bisa dipulihkan, oleh Anda maupun oleh kami.',
      done: 'Akun Anda sudah dihapus.',
      failed: 'Kami tidak dapat menghapus akun Anda. Coba lagi.',
    },

    rate: {
      title: 'Suka dengan RiceCal?',
      body: 'Jawaban kamu menentukan apa yang kami buat berikutnya.',
      yes: 'Saya suka',
      no: 'Kurang',
      later: 'Nanti saja',
      feedbackTitle: 'Apa yang perlu diperbaiki?',
      feedbackBody: 'Ceritakan di Discord. Sebagian besar isi aplikasi ini datang dari sana.',
      feedbackOpen: 'Buka Discord',
      feedbackSkip: 'Tidak usah',
    },

    help: {
      title: 'Ayo ngobrol dengan kami',
      body: 'Server Discord kami adalah tempat kami menjawab pertanyaan dan memutuskan apa yang dibangun berikutnya.',
      logo: 'Discord',
      bug: 'Laporkan sesuatu yang rusak',
      idea: 'Usulkan sebuah fitur',
      ask: 'Tanya kami apa saja tentang RiceCal',
      action: 'Buka Discord',
      failed: 'Kami tidak bisa membuka Discord',
    },

    shareEarn: {
      row: 'Bagikan dan dapatkan Pro',
      title: 'Bagikan dan dapatkan Pro',
      heroTitle: 'Posting tentang RiceCal, dapat Pro',
      heroBody:
        'Tunjukkan ke orang-orang piring yang kamu catat. Makin banyak postinganmu disukai, makin lama Pro yang kami kirim.',

      platforms: 'POSTING DI',

      rewards: 'BERAPA NILAINYA',
      postReward: '1 bulan Pro',
      postBadge: '30+ suka',
      postBody: 'Postingan publik apa pun tentang aplikasi ini, di salah satu dari ini.',
      likedReward: '1 tahun Pro',
      likedBadge: '100+ suka',
      likedBody: 'Postinganmu menemukan orang yang tepat.',
      viralReward: 'Pro selamanya',
      viralBadge: '500+ suka',
      viralBody: 'Kamu viral. Ini jadi milikmu, tanpa perpanjangan, tanpa yang perlu dibatalkan.',

      how: 'CARA KERJANYA',
      step1:
        'Posting tentang RiceCal di mana pun yang publik. Tangkapan layar buku harianmu, atau piring yang kamu pindai, paling ampuh.',
      step2: 'Beri waktu beberapa hari untuk mengumpulkan suka.',
      step3: 'Bawa tautannya ke Discord kami dan kami kirimkan kode Pro.',

      claim: 'SUDAH POSTING?',
      claimBody: 'Kirim tautannya di Discord kami dan kami akan memeriksanya lalu mengirim kodemu.',
      claimAction: 'Buka Discord',

      finePrint:
        'Satu hadiah per orang. Kami memeriksa postingannya publik dan menghitung sukanya saat kamu klaim, jadi beri waktu dulu.',
      openFailed: 'Kami tidak bisa membuka aplikasi itu',
    },

    goals: {
      title: 'Target dan sasaran',
      dailyCalories: 'KALORI HARIAN',
      recommended: 'Disarankan {{value}}',
      macroTargets: 'TARGET MAKRO',
      macrosAddUpTo: 'Makro berjumlah {{value}} kkal',
      useRecommended: 'Pakai anjuran',
      goal: 'TARGET',
      currentWeight: 'Berat sekarang',
      targetWeight: 'Berat target',
      weeklyPace: 'Laju mingguan',
      paceLosing: 'Turun {{value}} {{unit}}',
      paceGaining: 'Naik {{value}} {{unit}}',
      paceHolding: 'Tetap stabil',
      other: 'LAINNYA',
      waterGoal: 'Target air',
      saved: 'Sasaran tersimpan',
    },

    personalisation: {
      title: 'Personalisasi',
      mealsTitle: 'WAKTU MAKAN',
      mealsNote: 'Ini jam pengingatmu berbunyi.',
      editMeal: 'Ubah kapan {{meal}}',
      hour: 'Jam',
      minute: 'Menit',
      preview: 'Mengingatkan pukul {{time}}',
    },

    reminders: {
      title: 'Pengingat',
      meals: 'MAKAN',
      mealAt: '{{meal}} · {{time}}',
      habits: 'KEBIASAAN',
      water: 'Air setiap 2 jam',
      weighIn: 'Timbang di hari Senin',
      weeklyReport: 'Laporan mingguan',
      monthlyReport: 'Laporan bulanan',
      denied: 'Pengingat butuh izin notifikasi.',
      blockedTitle: 'Notifikasi mati',
      blockedBody: 'Nyalakan di Pengaturan dan sakelar ini akan berfungsi.',
      openSettings: 'Buka Pengaturan',
      push: {
        mealTitle: 'Waktunya {{meal}}',
        mealBody: 'Catat selagi ingat. Cuma sepuluh detik.',
        waterTitle: 'Cek air',
        waterBody: 'Sudah berapa banyak air hari ini?',
        weighInTitle: 'Timbang pagi',
        weighInBody: 'Pagi hari memberi pembacaan paling stabil.',
        weeklyTitle: 'Sepekanmu dalam makanan',
        weeklyBody: 'Tujuh hari catatan, dalam satu layar.',
        monthlyTitle: 'Sebulanmu dalam makanan',
        monthlyBody: 'Empat minggu, dan hasilnya.',
      },
    },

    preferences: {
      title: 'Bahasa dan satuan',
      language: 'BAHASA',
      languageLabel: 'Bahasa aplikasi',
      units: 'SATUAN',
      weight: 'Berat',
      kg: 'kg',
      lb: 'lb',
      energy: 'Energi',
      kcal: 'kkal',
      kj: 'kJ',
      appearance: 'TAMPILAN',
      light: 'Terang',
      dark: 'Gelap',
      auto: 'Otomatis',
    },

    subscription: {
      title: 'Langganan',
      pro: 'RiceCal Pro',
      trialLeft_one: 'Uji coba gratis, sisa {{count}} hari',
      trialLeft_other: 'Uji coba gratis, sisa {{count}} hari',
      renews: 'Diperpanjang di {{price}}.',
      neverRenews: 'Dibayar sekali. Tidak ada perpanjangan.',
      freeBody:
        '{{scans}} pindai per hari, {{recipes}} makanan sendiri, dan tren seminggu terakhir.',
      whatYouGet: 'YANG KAMU DAPAT DENGAN PRO',
      included: 'TERMASUK',
      cancel: 'Batalkan langganan',
      cancelTitle: 'Batalkan langgananmu?',
      cancelBody: 'Kamu tetap Pro sampai akhir periode. Catatanmu tetap bisa dibaca bagaimanapun.',
      cancelConfirm: 'Batalkan paket',
      switchMonthly: 'Ganti ke bulanan',
      switchYearly: 'Ganti ke tahunan',
      manage: 'Kelola di toko',
      switched: 'Paket diperbarui',
    },
  },

  paywall: {
    couldNotCheck: 'Kami tidak bisa memeriksa langgananmu. Coba lagi sebentar.',

    plans: {
      yearly: 'Tahunan',
      perMonth: '{{price}} per bulan',
      yearlyBadge: 'HEMAT {{percent}}%',
      yearlyBilling: 'Ditagih setiap tahun',
      monthly: 'Bulanan',
      monthlyBilling: 'Ditagih setiap bulan',
      lifetime: 'Seumur hidup',
      lifetimeDetail: 'Satu pembayaran, milikmu selamanya',
    },

    hard: {
      appBar: 'RiceCal Pro',
      title: 'Tanpa batas dengan RiceCal Pro',
      assurance: 'Tanpa komitmen, batalkan kapan saja',
      assuranceLifetime: 'Satu pembayaran, bisa dikembalikan lewat toko',
      smallPrintYearly: 'Gratis 7 hari, lalu {{price}} per tahun.',
      smallPrintMonthly: 'Gratis 7 hari, lalu {{price}} per bulan.',
      smallPrintLifetime: 'Satu pembayaran {{price}}. Bukan langganan, tanpa perpanjangan.',
      smallPrintPending: 'Gratis 7 hari.',
      start: 'Mulai uji coba gratis',
      startLifetime: 'Beli akses seumur hidup',
      restore: 'Pulihkan pembelian',
      terms: 'Ketentuan',
      privacy: 'Privasi',
      nothingToRestore: 'Tidak ada yang bisa dipulihkan di akun ini',
      notConfigured: 'Pembelian belum disiapkan di build ini.',
      restored: 'Pembelianmu sudah kembali',
    },

    table: {
      title: 'GRATIS VS PRO',
      free: 'Gratis',
      pro: 'Pro',
      rows: {
        snap: {
          label: 'Foto satu piring',
          free: '{{scans}}/hari',
          pro: 'Tanpa batas',
        },
        describe: {
          label: 'Ceritakan apa yang kamu makan',
          free: '',
          pro: '',
        },
        barcode: {
          label: 'Pindai sebuah kemasan',
          free: '',
          pro: '',
        },
        search: {
          label: 'Cari di basis data makanan',
          free: '',
          pro: '',
        },
        fix: {
          label: 'Perbaiki makanan dengan menceritakannya',
          free: '',
          pro: '',
        },
        suggest: {
          label: 'Tanya mau makan apa berikutnya',
          free: '',
          pro: '',
        },
        recipes: {
          label: 'Simpan yang kamu masak',
          free: '{{recipes}} makanan',
          pro: 'Tanpa batas',
        },
        recipeFill: {
          label: 'Isi makanan dari sebuah foto',
          free: '',
          pro: '',
        },
        budget: {
          label: 'Jatah kalori yang pas untukmu',
          free: '',
          pro: '',
        },
        health: {
          label: 'Apple Health dan Health Connect',
          free: '',
          pro: '',
        },
        reminders: {
          label: 'Pengingat makan',
          free: '',
          pro: '',
        },
        trends: {
          label: 'Tren',
          free: '7 hari',
          pro: 'Sampai setahun',
        },
        reviews: {
          label: 'Ulasan mingguan dan bulanan',
          free: 'Minggu terakhir',
          pro: 'Semuanya',
        },
        photos: {
          label: 'Foto makananmu',
          free: '{{days}} hari',
          pro: 'Tanpa batas',
        },
      },
    },

    intro: {
      title: 'Semua sudah siap. Mau mulai mencatat?',
      body: 'Semuanya jalan tanpa itu. Pro cuma melepas batasnya.',
      later: 'Mungkin nanti',
    },

    reminder: {
      title_one: 'sisa {{count}} hari di uji cobamu',
      title_other: 'sisa {{count}} hari di uji cobamu',
      body: 'Kamu sudah mencatat {{days}} hari berturut-turut dan turun {{kg}} kg. Lanjutkan.',
      daysLogged: 'HARI DICATAT',
      meals: 'MAKAN',
      kgDown: 'KG TURUN',
      starts: 'Paketmu mulai {{date}} seharga {{price}} per tahun.',
      keep: 'Pertahankan paketku',
      manage: 'Kelola langganan',
    },

    ended: {
      heading: 'Hari ini',
      previewMode: 'Mode pratinjau',
      title: 'Uji cobamu sudah berakhir',
      body: 'Riwayat {{days}} harimu aman dan masih bisa dibaca.',
      dataWaiting: 'DATAMU MENUNGGU',
      days: 'HARI',
      meals: 'MAKAN',
      kgDown: 'KG TURUN',
      lockedEntry: 'Terkunci',
      resume: 'Lanjutkan dengan Pro',
      terms: '{{price}} per tahun, diperpanjang sampai Anda batalkan.',
      termsPending: 'Diperpanjang tiap tahun sampai Anda batalkan.',
      browse: 'Terus jelajahi gratis',
    },

    limit: {
      freeReached: 'Itu {{count}} pindai untuk hari ini. Pro memindai sebanyak yang kamu mau.',
      proReached: 'Kamu sudah mencapai batas pindai hari ini. Silakan hubungi admin.',
      notEntitledDetail: 'Langgananmu tidak aktif.',
      confirming: 'Pembelianmu sedang diproses. Beri sebentar lalu coba lagi.',
      feature: {
        camera: 'Memindai satu piring lagi hari ini butuh RiceCal Pro.',
        describe: 'Menceritakan apa yang kamu makan butuh RiceCal Pro.',
        refine: 'Memperbaiki makanan dengan menceritakannya butuh RiceCal Pro.',
        read_recipe: 'Mengisi makanan dari sebuah foto butuh RiceCal Pro.',
        new_recipe: 'Menyimpan lebih dari {{recipes}} makanan sendiri butuh RiceCal Pro.',
        suggest: 'Bertanya mau makan apa berikutnya butuh RiceCal Pro.',
        trend_range: 'Melihat lebih jauh dari seminggu butuh RiceCal Pro.',
        review: 'Membaca ulasan yang lebih lama butuh RiceCal Pro.',
        nudge: 'RiceCal Pro melepas batasnya.',
      },
    },

    checking: 'Sebentar, kami sedang memeriksa paketmu.',

    welcome: {
      title: 'Kamu sudah masuk. Ayo makan.',
      body: '7 hari gratismu mulai sekarang. Semuanya terbuka.',
      bodyActive: 'Semuanya terbuka.',
      bodyLifetime: 'RiceCal Pro jadi milikmu selamanya. Semuanya terbuka.',
      perks: {
        log: 'Foto, pindai atau ceritakan',
        database: 'Setiap hidangan dan kemasan',
        suggest: 'Tanya mau makan apa',
      },
      manageNote: 'Kelola atau batalkan kapan saja di Profil, Langganan.',
      manageNoteLifetime: 'Dibayar sekali. Tidak ada yang perlu diperpanjang atau dibatalkan.',
      start: 'Ke buku harianku',
    },
  },

  recipes: {
    shelf: {
      mine: 'Milikku',
      community: 'Komunitas',
    },

    heading: {
      mine: 'Makananku',
      community: 'Dari komunitas',
    },

    search: {
      community: 'Cari makanan publik',
      mine: 'Cari makananku',
      clear: 'Bersihkan pencarian',
      none: 'Tidak ada yang bernama itu',
      noneBody: 'Coba kata yang lebih pendek, atau sebagian nama hidangannya.',
    },

    empty: {
      mineTitle: 'Belum ada makanan',
      mineBody:
        'Satu panci bersama tidak punya ukuran porsi. Masukkan apa saja isinya dan untuk berapa orang, sekali saja, dan mencatatnya cuma satu ketukan setelah itu.',
      communityTitle: 'Belum ada yang dibagikan',
      communityBody: 'Makanan yang dipublikkan orang akan muncul di sini.',
    },

    servings_one: '{{count}} porsi',
    servings_other: '{{count}} porsi',
    ingredients_one: '{{count}} bahan',
    ingredients_other: '{{count}} bahan',
    savedTimes_one: 'disimpan {{count}} kali',
    savedTimes_other: 'disimpan {{count}} kali',
    byAuthor: '{{name}} · {{saves}}',
    fromAuthor: 'Dari {{name}}',
    someCook: 'Seseorang',

    new: {
      title: 'Makanan baru',
      scanLabel: 'Foto',
      describeLabel: 'Ceritakan',
      scanTitle: 'Isi dari sebuah foto',
      or: 'ATAU ISI SENDIRI',
      describeTitle: 'Ceritakan',
      describePlaceholder:
        'Kari ayam. 600g paha ayam, satu kaleng santan, 3 kentang. Untuk 4 orang.',
      describeHint: 'Takaran dan untuk berapa orang adalah dua hal yang paling layak diketik.',
      describeAction: 'Isi formulirnya',
      describeFailed: 'Kami tidak bisa membaca yang itu. Isi sendiri di bawah.',
      scanFailed: 'Kami tidak bisa membaca yang itu. Isi sendiri di bawah.',

      readingPhoto: 'Membaca fotomu…',
      readingText: 'Membaca yang kamu tulis…',
      readingIngredients: 'Mencari tahu apa isinya…',
      readingPortions: 'Mengukur porsinya…',
      readingSteps: 'Menulis langkahnya…',
      readingHint: 'Tunggu sebentar. Kamu bisa mengubah apa saja setelah jadi.',
    },

    edit: {
      title: 'Ubah makanan',
      name: 'NAMA',
      namePlaceholder: 'Kamu menyebutnya apa?',
      picture: 'GAMBAR',
      changePicture: 'Ganti gambar',
      replacePhotoTitle: 'Pakai ilustrasi saja?',
      replacePhotoBody: 'Foto makanan ini akan dihapus.',
      replacePhotoConfirm: 'Pakai ilustrasi',
      servings: 'BERAPA PORSI',
      ingredients: 'BAHAN',
      ingredientsCount: 'BAHAN · {{count}}',
      ingredientsEmpty: 'Belum ada apa-apa. Cari tiap item dan kami jumlahkan pancinya untukmu.',
      addIngredient: 'Tambah sebuah bahan',
      steps: 'CARA KAMU MEMASAK',
      stepsPlaceholder: 'Satu langkah per baris. Mulai baris baru dan kami memberinya nomor.',
      stepsHint: 'Setiap baris baru menjadi langkah bernomor berikutnya.',
      stepsSheetTitle: 'Cara kamu memasak',
      stepsEditAction: 'Ubah langkahnya',
      stepsEdit_one: 'Ubah langkahnya, {{count}} langkah',
      stepsEdit_other: 'Ubah langkahnya, {{count}} langkah',
      stepsWrite: 'Tulis cara kamu memasak',
      save: 'Simpan makanan',
      saved: 'Makanan tersimpan',
      nameRequired: 'Beri nama dulu',
      saveFailed: 'Tidak bisa menyimpannya. Coba lagi.',
      limitReached: 'Akun gratis menyimpan {{count}} makanan. Pro tanpa batas.',
      totalLabel: 'Per porsi, {{count}}',
      totalWhole: 'Seluruh panci {{kcal}} kkal',
      discardTitle: 'Keluar tanpa menyimpan?',
      discardBody: 'Perubahan yang kamu buat di sini akan hilang.',
      discardConfirm: 'Buang',
    },

    ingredient: {
      title: 'Tambah bahan',
      search: 'Cari sebuah bahan',
      ownTitle: 'Tambah bahanmu sendiri',
      ownBody: 'Tidak ada di daftar? Beri nama dan kalorinya.',
      customBody: 'Untuk yang hanya ada di dapurmu. Baca dari kemasannya atau timbang sekali.',
      name: 'NAMA',
      namePlaceholder: 'Ini apa?',
      calories: 'KALORI',
      macros: 'MAKRO, KALAU KAMU TAHU',
      amount: 'BERAPA BANYAK YANG MASUK',
      add: 'Masukkan ke panci',
      remove: 'Hapus',
      change: 'Ubah berapa banyak {{name}}, saat ini {{measure}}',
      unit: {
        g: 'g',
        ml: 'ml',
        piece_one: 'buah',
        piece_other: 'buah',
      },
    },

    detail: {
      servingLabel_one: 'porsi',
      servingLabel_other: 'porsi',
      portion: {
        half: 'Setengah',
        one: '1 porsi',
        two: '2 porsi',
        pot: 'Seluruh panci',
      },
      ofServings: '{{count}} DARI {{total}} PORSI',
      steps: 'CARA SAYA MEMASAK',
      stepsFrom: 'CARA {{name}} MEMASAK',
      noSteps: 'Tidak ada langkah yang ditulis.',
      ingredients: 'BAHAN',
      addToDay: 'Tambahkan ke hari ini',
      added: 'Ditambahkan ke harimu',
      saveCopy: 'Simpan ke makananku',
      savedCopy: 'Tersimpan ke makananmu',
      saveCopyFailed: 'Tidak bisa menyimpan yang itu. Coba lagi.',
      goneTitle: 'Makanan tidak ditemukan',
      goneBody:
        'Mungkin sudah dihapus, atau dijadikan privat lagi. Minta tautan baru dari yang membagikannya.',
      delete: 'Hapus makanan',
      deleteTitle: 'Hapus makanan ini?',
      deleteBody: 'Makanan yang sudah kamu catat darinya tetap ada di buku harianmu.',
      deleted: 'Makanan dihapus',
    },

    report: {
      title: 'Laporkan makanan ini',
      body: 'Makanan ini langsung berhenti muncul untuk Anda. Pembuatnya tidak diberi tahu.',
      inappropriate: 'Menyinggung atau bukan makanan',
      spam: 'Spam atau iklan',
      dangerous: 'Tidak aman dimasak atau dimakan',
      stolen: 'Karya orang lain',
      block: 'Sembunyikan semua dari {{name}}',
      done: 'Dilaporkan. Anda tidak akan melihatnya lagi.',
      blocked: 'Disembunyikan. Anda tidak akan melihat makanan mereka lagi.',
      failed: 'Tidak bisa melakukannya. Coba lagi.',
    },

    share: {
      action: 'Bagikan',
      title: 'Bagikan makanan ini',
      body: 'Siapa pun yang punya tautannya bisa melihat bahan, langkah dan kalorinya, dan menyimpan salinannya sendiri. Milikmu tetap milikmu.',
      publicTitle: 'Jadikan publik',
      publicBody: 'Ia masuk ke tab komunitas untuk ditemukan dan disimpan siapa saja.',
      publishFailed: 'Tidak bisa mengubahnya. Coba lagi.',
    },

    review: {
      checking: 'Memeriksa makananmu…',
      approved: 'Makananmu sudah masuk komunitas',
      rejected: 'Tidak diterbitkan: {{reason}}',
      rejectedPlain: 'Kami tidak bisa menerbitkan yang ini.',
      pending: 'Kami masih melihatnya. Ia akan muncul setelah lolos.',
      badgePending: 'Dalam tinjauan',
      badgeRejected: 'Tidak diterbitkan',
      badgePublic: 'Publik',
    },
  },

  reviews: {
    title: 'Ulasan',

    entry: {
      title: 'Ulasan',
      subtitle: 'Lihat kembali sepekan atau sebulan',
    },

    kind: {
      week: 'Mingguan',
      month: 'Bulanan',
      label: 'Panjang ulasan',
    },

    list: {
      weekMeta: 'Minggu {{index}}',
      weekSummary: '{{kcal}} kkal per hari, {{done}} dari {{total}} dicatat',
      monthMeta: '{{weeks}} minggu, {{done}} dari {{total}} hari dicatat',
      monthSummary: '{{kcal}} kkal per hari',
      monthSummaryWeight: '{{kcal}} kkal per hari, {{weight}}',
      summaryEmpty: 'Tidak ada catatan',
      a11y: '{{title}}, {{meta}}, {{summary}}',
      a11yLocked: '{{title}}, {{meta}}, {{summary}}, Pro',

      emptyWeekTitle: 'Belum ada minggu untuk dilihat kembali',
      emptyWeekBody:
        'Satu minggu muncul di sini setelah selesai dan kamu mencatat setidaknya empat harinya.',
      emptyMonthTitle: 'Belum ada bulan untuk dilihat kembali',
      emptyMonthBody:
        'Satu bulan muncul di sini setelah selesai dan kamu mencatat setidaknya dua belas harinya.',
    },

    share: {
      card: 'Bagikan {{card}}',
      preview: 'Kartunya seperti yang akan dikirim',
    },

    story: {
      close: 'Tutup',
      share: 'Bagikan',
      missingTitle: 'Ulasan itu tidak ada di sini',
      missingBody: 'Mungkin itu minggu yang isinya terlalu sedikit untuk dilihat kembali.',
    },

    card: {
      brand: 'RiceCal',
      kcalADay: 'kkal per hari',
      under: '{{value}} di bawah target',
      over: '{{value}} di atas target',
      onBudget: 'Pas di jatah',
      logged: 'DICATAT',
      loggedValue: '{{done}} dari {{total}}',
      streak: 'RENTETAN',
      streakValue_one: '{{count}} hari',
      streakValue_other: '{{count}} hari',
      weightChange: 'BERAT',
      noWeight: '—',
      shareText:
        '{{period}}: {{kcal}} kkal per hari, {{done}} dari {{total}} hari dicatat. RiceCal',
    },

    food: {
      title: 'PIRING TERBESAR',
      macros: 'MAKRO PER HARI',
      grams: '{{value}} g',
      share: '{{value}}% dari energi',
    },

    calories: {
      average: 'RATA-RATA PER HARI',
      kcal: 'kkal',
      under: '{{value}} kurang',
      over: '{{value}} lebih',
      goalNote: 'Target {{goal}}. Di bawahnya pada {{done}} dari {{total}} hari.',
      noGoal: 'Belum ada jatah harian yang berlaku saat itu.',
      everyDay: 'SETIAP HARI',
      everyWeek: 'SETIAP MINGGU',
      chart: 'Kalori per hari, dipecah menurut karbo, protein dan lemak',
      lightest: '{{day}}, TERINGAN',
      heaviest: '{{day}}, TERBERAT',
      pastWeeks: 'LIMA MINGGU TERAKHIR',
      pastMonths: 'LIMA BULAN TERAKHIR',
      noData: '—',
    },

    body: {
      weight: 'BERAT',
      weighIns_one: 'Satu penimbangan',
      weighIns_other: '{{count}} penimbangan',
      weightChart: 'Berat selama periode itu',
      steps: 'LANGKAH PER HARI',
      stepGoal: '{{done}} dari {{total}} hari melewati {{goal}} langkah',
      stepsChart: 'Langkah per hari',
      others: 'LAINNYA',
      water: 'Air',
      waterValue: '{{amount}} per hari',
      waterNote_one: 'Penuh di satu hari',
      waterNote_other: 'Penuh di {{count}} hari',
      move: 'Menit aktif',
      moveNote_one: 'Satu olahraga',
      moveNote_other: '{{count}} olahraga',
      moveNoteNone: 'Tidak ada olahraga tercatat',
      burn: 'Dibakar per hari',
      burnValue: '{{value}} kkal',
      distanceValue: '{{value}} km ditempuh',
    },
  },

  suggest: {
    card: {
      title: 'Bingung mau makan apa?',
    },

    ask: {
      title: 'Kamu lagi cari apa?',
      meal: 'MAKAN',
      focus: 'MAKRO',
      cuisine: 'MASAKAN',
      limit: 'BATAS KALORI',
      editCuisines: 'Ubah masakannya',
      addCuisine: 'Tambah sebuah masakan',
      addCuisinePlaceholder: 'Thai, Nyonya, Jepang',
      removeCuisine: 'Hapus {{cuisine}}',
      kcal: 'kkal',
      less: 'Kurangi kalori',
      more: 'Tambah kalori',
      leftToday: 'sisa {{kcal}}',
      healthy: 'Lebih ringan',
      anything: 'Apa saja',
      healthyA11y: 'Condong ke hidangan yang lebih ringan',
      action: 'Sarankan sesuatu',
    },

    picks: {
      title: 'Ide untuk {{meal}}',
      thinking: 'Mencari sesuatu untuk {{meal}}',
      thinkingA11y: 'Memikirkan apa yang mau disarankan',
      summary: '{{focus}}, {{cuisine}}, di bawah {{kcal}} kkal',
      protein: '{{grams}}g protein',
      retry: 'Coba lagi',
      emptyTitle: 'Tidak ada yang terlintas',
      emptyBody: 'Tanya lagi, atau longgarkan salah satu jawabannya.',
    },

    detail: {
      unit: 'KKAL, {{portion}}',
      leftAfter: 'sisa {{kcal}} kkal sesudahnya',
      overAfter: 'lebih {{kcal}} kkal sesudahnya',
      why: 'KENAPA INI COCOK',
      protein: 'Protein',
      carbs: 'Karbo',
      fat: 'Lemak',
      sodium: 'Natrium',
    },

    meal: {
      breakfast: 'Sarapan',
      lunch: 'Makan siang',
      dinner: 'Makan malam',
      snack: 'Camilan',
    },
    mealFor: {
      breakfast: 'sarapan',
      lunch: 'makan siang',
      dinner: 'makan malam',
      snack: 'camilan',
    },
    focus: {
      protein: 'Protein',
      balanced: 'Seimbang',
      carbs: 'Karbo',
    },
    focusShort: {
      protein: 'Tinggi protein',
      balanced: 'Seimbang',
      carbs: 'Tinggi karbo',
    },

    sodium: {
      low: 'rendah',
      medium: 'sedang',
      high: 'tinggi',
    },

    ready_one: '{{count}} ide sudah siap',
    ready_other: '{{count}} ide sudah siap',
    readyAction: 'Lihat',

    failed: 'Tidak bisa mengambil saran apa pun. Coba lagi sebentar.',
  },
} satisfies Bundle
