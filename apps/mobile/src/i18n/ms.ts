import type { Bundle } from './bundle'

/**
 * Bahasa Melayu.
 *
 * The app's home language, and the one place a translation has to be more
 * careful than usual: half the catalogue is already written in it. A dish stays
 * exactly as the catalogue spells it, so nothing here renames nasi lemak, teh
 * tarik or sambal, and the copy around them is written to sit beside a Malay
 * food name without repeating it.
 *
 * Read `en/` before changing anything here. The comments there are the brief.
 */
export const ms = {
  common: {
    action: {
      continue: 'Teruskan',
      back: 'Kembali',
      cancel: 'Batal',
      save: 'Simpan perubahan',
      done: 'Selesai',
      edit: 'Sunting',
      delete: 'Padam',
      add: 'Tambah',
      undo: 'Buat asal',
      keep: 'Kekalkan',
      skip: 'Langkau',
      retry: 'Cuba lagi',
      close: 'Tutup',
    },

    nav: {
      today: 'Hari ini',
      recipes: 'Resipi',
      activity: 'Aktiviti',
      trends: 'Trend',
      me: 'Saya',
      log: 'Rekod makanan',
    },

    date: {
      today: 'Hari ini',
      yesterday: 'Semalam',
    },

    meal: {
      breakfast: 'Sarapan',
      lunch: 'Makan tengah hari',
      dinner: 'Makan malam',
      snack: 'Snek',
    },

    macro: {
      carbs: 'Karbo',
      protein: 'Protein',
      fat: 'Lemak',
    },

    unit: {
      kcal: 'kcal',
      kcalUpper: 'KCAL',
      grams: '{{value}}g',
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
      open: 'Bahasa yang digunakan ciri AI',
      title: 'Ciri AI berfungsi dalam bahasa Inggeris',
      body: 'Snap pinggan, cakap apa yang anda makan dan tanya apa hendak dimakan seterusnya semuanya pergi kepada model yang paling memahami bahasa Inggeris. Terangkan makanan anda dalam bahasa Inggeris dan ia memahami anda dengan lebih tepat.',
      results:
        'Apa yang kembali juga dalam bahasa Inggeris. Nama hidangan, bahan dan saiz hidangan disimpan dalam bahasa Inggeris di dalam katalog makanan, jadi itulah bahasa yang akan muncul walau apa pun tetapan apl.',
      dishes: 'Nama hidangan kekal dalam bahasa ia ditulis.',
      note: 'Terangkan makanan dalam bahasa Inggeris untuk bacaan paling tepat. Hasilnya juga dalam bahasa Inggeris.',
    },

    notFound: {
      title: 'Skrin itu sudah berpindah',
      body: 'Pautan yang anda ikut tidak menuju ke mana-mana dalam versi apl ini.',
      action: 'Pergi ke Hari ini',
    },

    offline: {
      title: 'Menunggu sambungan',
      body: 'Yang ini belum disimpan dalam telefon anda. Ia akan dimuatkan sebaik sahaja anda dalam talian.',
      dayTitle: 'Hari ini tiada dalam telefon anda',
      dayBody: 'Pilih hari yang pernah anda buka, atau datang semula bila anda dalam talian.',
    },

    a11y: {
      back: 'Kembali',
      close: 'Tutup',
      more: 'Lagi pilihan',
      decrease: 'Kurangkan',
      increase: 'Tambahkan',
      step: 'Langkah {{current}} daripada {{total}}',
      backspace: 'Padam digit terakhir',
      decimalPoint: 'Titik perpuluhan',
    },
  },

  activity: {
    title: 'Aktiviti',

    connect: {
      title: 'Biar jam tangan yang kira',
      body: 'Sambungkan apl kesihatan telefon anda dan setiap jalan kaki, larian dan permainan badminton akan menambah semula bajet hari ini.',

      readTitle: 'APA YANG KAMI BACA',
      energy: 'Tenaga aktif',
      energyBody: 'Apa yang anda bakar semasa bergerak',
      steps: 'Langkah dan jarak',
      stepsBody: 'Tabiat harian, bukan sasaran',
      workouts: 'Senaman',
      workoutsBody: 'Jenis, masa, rentak, kadar denyutan jantung',

      privacy:
        'Baca sahaja. Kami tidak pernah menulis apa-apa kembali, dan data kesihatan anda hanya disimpan dalam akaun anda sendiri.',

      apple: 'Apple Health',
      appleBody: 'iPhone dan Apple Watch',
      connectHealth: 'Health Connect',
      connectHealthBody: 'Samsung Health, Fitbit, Garmin',
      heart: 'Kadar denyutan jantung',
      demo: 'Guna data demo',
      demoBody: 'Dijana pada peranti ini, untuk pembangunan',

      connecting: 'Membaca sejarah anda…',
      progress: '{{done}} daripada {{total}}',

      emptyTitle: 'Tiada apa-apa yang kembali',
      emptyBody:
        'Kami tidak dapat membaca sebarang aktiviti. Jika anda mematikan RiceCal dalam tetapan privasi Health, hidupkannya semula dan cuba lagi.',
      retry: 'Cuba lagi',

      unavailableTitle: 'Tiada data kesihatan di sini',
      simulator:
        'Peranti ini tiada stor Health untuk dibaca. Pada simulator, data yang dijana akan mengisi skrin ini.',
      notInstalled:
        'Health Connect belum disediakan pada telefon ini. Pasangkannya dari Play Store, hidupkan apl yang merekod pergerakan anda, kemudian kembali ke sini.',
      notLinked:
        'Binaan ini tidak menyertakan modul kesihatan. Bina semula klien dev selepas memasangnya.',
      wrongPlatform: 'Telefon ini tiada stor kesihatan yang boleh dibaca RiceCal.',
      openStore: 'Buka Play Store',
      checkAgain: 'Semak semula',
    },

    today: {
      syncedJustNow: 'Sebentar tadi',
      syncedMinutes: '{{count}} min lalu',
      syncedHours: '{{count}} jam lalu',
      syncedDays: '{{count}} hari lalu',
      syncedNever: 'Belum disegerakkan',

      move: 'Gerak',
      exercise: 'Senam',
      stand: 'Berdiri',
      stepsRing: 'Langkah',
      moveUnit: '/ {{goal}} kcal',
      exerciseUnit: '/ {{goal}} min',
      standUnit: '/ {{goal}} jam',
      stepsUnit: '/ {{goal}}',
      avgUnit: '/ {{value}} purata',
      none: '—',
      noGoal: 'kcal',
      noGoalMinutes: 'min',
      noGoalHours: 'jam',

      budgetTitle: 'BAJET DENGAN PERGERAKAN',
      goal: 'SASARAN',
      eaten: 'DIMAKAN',
      burned: 'DIBAKAR',
      left: 'BAKI',
      over: 'LEBIH',
      budgetNote:
        'Kalori yang dibakar memanjangkan bar itu, ia tidak pernah mengurangkan apa yang anda makan.',
      budgetOff: 'Pergerakan tidak memanjangkan bajet anda. Hidupkannya dalam tetapan Aktiviti.',

      todayTitle: 'HARI INI',
      weekTitle: 'MINGGU INI',
      stepsRow: 'Langkah',
      stepsRowValue: '{{steps}} hari ini',
      balanceRow: 'Imbangan',
      balanceDeficit: 'defisit {{value}} sehari',
      balanceSurplus: 'lebihan {{value}} sehari',
      balanceUnknown: 'Rekod belum cukup',
      historyRowValue_one: '{{count}} senaman · {{time}}',
      historyRowValue_other: '{{count}} senaman · {{time}}',
      historyNone: 'Belum ada senaman',

      syncing: 'Menyegerak…',

      demoBadge: 'Data demo',

      storeEmpty:
        'Stor kesihatan ini bersambung tetapi kosong, macam mana rupa simulator. Data yang dijana akan mengisi skrin ini.',

      noStandNoteGeneric:
        'Apl kesihatan anda tidak melaporkan jam berdiri, jadi kami tunjukkan langkah.',
    },

    workout: {
      distance: 'JARAK',
      time: 'MASA',
      pace: 'RENTAK',
      speed: 'LAJU',
      paceUnit: '{{value}} /km',
      speedUnit: '{{value}} km/j',
      avgHr: 'PURATA HR',
      maxHr: 'MAKS HR',
      elevation: 'KETINGGIAN',
      bpm: '{{value}} bpm',
      metres: '{{value}} m',

      zonesTitle: 'ZON KADAR DENYUTAN',
      zonesNone: 'Purata sesi sahaja, tiada zon',
      zonesNoneBody:
        '{{source}} menghantar satu purata setiap sesi. Sambungkan jam tangan yang menulis bacaan setiap minit untuk zon dan pecahan.',
      zonesNoneBodyGeneric:
        'Sesi ini datang dengan satu purata dan bukan bacaan setiap minit, jadi tiada apa-apa untuk dibahagikan kepada zon.',

      noHeartRate: 'Tiada kadar denyutan direkodkan',

      from: 'Daripada {{source}}',
      missing: 'Senaman ini sudah tiada dalam apl kesihatan anda.',
    },

    steps: {
      title: 'Langkah',
      todaySoFar: 'Hari ini setakat ini',
      goalLine: 'Sasaran {{goal}} langkah',
      over: '{{value}} lebih',
      under: '{{value}} lagi',
      unit: 'langkah · {{distance}}',

      busiest: 'Jam paling sibuk ialah {{hour}}.',
      morning: 'Pagi',
      afternoon: 'Tengah hari',
      evening: 'Petang',
      noHours: 'Tiada pecahan mengikut jam untuk hari ini.',

      weekTitle: 'MINGGU INI',
      dailyAvg: 'PURATA HARIAN',
      goalDays: 'HARI SASARAN',
      best: 'TERBAIK',

      weekendNote:
        'Beberapa hari sahaja yang membawa jumlah itu. Jalan kaki sekejap pada hari yang senyap akan meratakannya.',
      steadyNote: 'Hari anda sekata. Apa sahaja yang anda buat, ia sudah jadi tabiat.',
      shortNote: 'Belum cukup hari untuk melihat coraknya.',
    },

    balance: {
      chartTitle: 'Masuk lawan keluar',
      chartBody: 'Dimakan berbanding jumlah bakaran',
      deficit: 'defisit {{value}}',
      surplus: 'lebihan {{value}}',
      even: 'Seimbang',
      eatenLegend: 'Dimakan',
      burnedLegend: 'Dibakar',

      splitTitle7d: 'DARI MANA BAKARAN ITU DATANG · 7 HARI',
      splitTitle30d: 'DARI MANA BAKARAN ITU DATANG · 30 HARI',
      splitTitle1y: 'DARI MANA BAKARAN ITU DATANG · 12 BULAN',
      resting: 'Rehat',
      restingBody: 'Sekadar hidup',
      workouts: 'Senaman',
      workoutsBody: 'Kos sesi anda',
      walking: 'Berjalan',
      walkingBody: 'Langkah dan urusan harian',
      kcal: '{{value}} kcal',

      partial:
        'Berdasarkan {{days}} daripada {{total}} hari yang mempunyai rekod makanan dan angka tenaga rehat.',
      noRestingTitle: 'Tiada tenaga rehat',
      noRestingBody:
        'Apl kesihatan anda tidak melaporkan apa yang badan anda bakar semasa rehat, jadi tiada imbangan harian untuk dilukis. Langkah, senaman dan tenaga aktif tidak terjejas.',
      empty: 'Rekod beberapa hidangan dengan jam tangan anda dipakai dan ini akan terisi.',
    },

    history: {
      title: 'Sejarah',
      weekTitle: 'MINGGU INI',
      sessions: 'SESI',
      time: 'MASA',
      burned: 'DIBAKAR',
      allTitle: 'SEMUA SESI',
      empty: 'Belum ada senaman direkodkan.',
      emptyBody: 'Apa sahaja yang jam tangan atau telefon anda rekod akan muncul di sini.',
    },

    settings: {
      title: 'Penyegerakan kesihatan',
      connectedTitle: 'BERSAMBUNG',
      sourceTitle: 'APA YANG KAMI BACA',
      lastSynced: 'Disegerakkan {{when}}',
      syncNow: 'Segerakkan sekarang',
      syncing: 'Menyegerak…',
      extendBudget: 'Pergerakan memanjangkan bajet saya',
      extendBudgetBody:
        'Kalori yang dibakar ditambah kepada hari itu, tidak pernah ditolak daripada apa yang anda makan.',
      stepGoal: 'Sasaran langkah',
      disconnect: 'Putuskan sambungan',
      disconnectBody: 'Berhenti menyegerak. Semua yang sudah dibaca kekal dalam sejarah anda.',
      disconnectConfirm: 'Berhenti menyegerak?',
      disconnectConfirmBody:
        'RiceCal akan berhenti membaca apl kesihatan anda. Aktiviti yang sudah direkodkan kekal.',
      clearDemo: 'Padam data demo',
      clearDemoBody: 'Membuang setiap hari dan sesi yang dijana daripada akaun ini.',
      granted: 'Hidup',
      notGranted: 'Tidak dibenarkan',
      partial: 'Sebahagian data tidak dikongsi',
    },

    provider: {
      apple_health: 'Apple Health',
      health_connect: 'Health Connect',
      demo: 'Data demo',
    },

    zone: {
      easy: 'Senang',
      steady: 'Sekata',
      hard: 'Berat',
      peak: 'Puncak',
    },

    kind: {
      run: 'Larian',
      walk: 'Jalan kaki',
      hike: 'Mendaki',
      cycle: 'Berbasikal',
      swim: 'Berenang',
      badminton: 'Badminton',
      tennis: 'Tenis',
      football: 'Bola sepak',
      basketball: 'Bola keranjang',
      volleyball: 'Bola tampar',
      gym: 'Gim',
      strength: 'Kekuatan',
      hiit: 'HIIT',
      yoga: 'Yoga',
      dance: 'Menari',
      martialArts: 'Seni mempertahankan diri',
      rowing: 'Mendayung',
      stairs: 'Tangga',
      other: 'Senaman',
    },

    unit: {
      kcal: '{{value}} kcal',
    },
  },

  auth: {
    choose: {
      email: 'Teruskan dengan e-mel',
    },

    password: {
      signUpTitle: 'Pilih kata laluan',
      signUpSubtitle: 'Untuk {{email}}. Anda akan gunakannya untuk log masuk semula.',
      signInTitle: 'Masukkan kata laluan anda',
      signInSubtitle: 'Log masuk sebagai {{email}}.',

      field: 'KATA LALUAN',
      confirmField: 'SAHKAN KATA LALUAN',
      placeholder: 'Sekurang-kurangnya 8 aksara',
      show: 'Tunjuk kata laluan',
      hide: 'Sembunyikan kata laluan',

      createAccount: 'Buka akaun',
      signIn: 'Log masuk',
      forgot: 'Lupa kata laluan anda?',

      codeInstead: 'E-melkan saya kod sahaja',

      haveAccount: 'Sudah ada akaun? Log masuk',
      needAccount: 'Baru di sini? Buka akaun',

      maybeExisting:
        'Jika sudah ada akaun pada alamat ini, log masuk di bawah atau minta satu kod.',
    },

    verify: {
      title: 'Semak e-mel anda',
      sentTo: 'Kami hantar kod 6 digit ke {{email}}. Ia ada dalam tajuk e-mel juga.',
      sendingTo: 'Menghantar kod 6 digit ke {{email}}...',

      field: 'KOD',
      placeholder: '000000',
      submit: 'Teruskan',

      resend: 'Hantar sekali lagi',
      resendIn: 'Hantar sekali lagi dalam {{seconds}}s',
      resent: 'Dihantar. Semak e-mel anda sekali lagi.',
    },

    reset: {
      askTitle: 'Tetapkan semula kata laluan anda',
      askSubtitle: 'Beritahu kami alamat pada akaun anda dan kami akan e-melkan satu kod.',
      send: 'E-melkan saya kod tetapan semula',

      newTitle: 'Pilih kata laluan baharu',
      newSubtitle: 'Hampir siap. Pilih sesuatu yang anda akan ingat.',
      field: 'KATA LALUAN BAHARU',
      confirmField: 'SAHKAN KATA LALUAN BAHARU',
      save: 'Simpan dan log masuk',
      done: 'Kata laluan ditukar. Anda sudah log masuk.',
    },

    captcha: {
      title: 'Satu semakan pantas',
      body: 'Cloudflare mahu mengesahkan anda seorang manusia. Ia ambil masa sesaat sahaja.',
    },

    ended: {
      title: 'Telah log keluar',
      body: 'Sesi ini telah tamat. Log masuk semula untuk meneruskan.',
    },

    errors: {
      passwordShort: 'Guna sekurang-kurangnya 8 aksara.',
      passwordRequired: 'Masukkan kata laluan anda.',
      passwordMismatch: 'Dua kata laluan itu tidak sama.',
      codeLength: 'Kod itu 6 digit.',

      invalid_credentials:
        'E-mel dan kata laluan itu tidak sepadan. Cuba lagi, atau minta satu kod.',
      email_not_confirmed:
        'Sahkan alamat e-mel anda dahulu. Kami sudah hantar kod baharu kepada anda.',
      account_exists: 'Cuba log masuk pada alamat ini, atau minta kami e-melkan satu kod.',
      code_invalid: 'Kod itu salah atau sudah luput. Minta yang baharu.',
      weak_password: 'Kata laluan itu terlalu mudah diteka. Cuba yang lebih panjang.',
      same_password: 'Itu kata laluan yang anda sudah ada. Pilih yang lain.',
      rate_limited: 'Tunggu sekejap sebelum meminta e-mel lain.',
      rate_limited_in: 'Tunggu {{seconds}} saat sebelum meminta e-mel lain.',
      captcha:
        'Kami tidak dapat mengesahkan anda seorang manusia. Semak sambungan anda dan cuba lagi.',
      offline: 'Tiada sambungan. Cuba lagi bila anda kembali dalam talian.',
      unknown: 'Ada sesuatu yang tidak kena. Cuba lagi.',
    },
  },

  onboarding: {
    setup: {
      title: 'Sebelum kita mula',
      subtitle: 'Kedua-duanya mengubah bahasa dan ukuran beberapa skrin seterusnya.',
      unitsTitle: 'UNIT',
      metric: 'Metrik',
      imperial: 'Imperial',
      metricNote: 'Sentimeter dan kilogram.',
      imperialNote: 'Kaki, inci dan paun.',
    },

    welcome: {
      title: 'Penjejak kalori untuk orang Asia',
      subtitle: 'Nasi lemak, pho, laksa, nasi char siu.',
      perks: {
        track: {
          title: 'Jejak setiap kalori',
          subtitle: 'Snap gambar atau cari dalam beberapa saat',
        },
        habit: {
          title: 'Bina tabiat lebih sihat',
          subtitle: 'Sasaran lembut, rentetan, tiada kutukan',
        },
        local: {
          title: '50,000 hidangan Asia',
          subtitle: 'Dan 3 juta bungkusan, dibaca melalui barkod',
        },
      },
      start: 'Mula',
      signIn: 'Saya sudah ada akaun',
    },

    about: {
      title: 'Beberapa perkara asas',
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
      sex: 'JANTINA',
      female: 'Perempuan',
      male: 'Lelaki',
      age: 'UMUR',
      agePlaceholder: '29',
      years: 'tahun',
      targetWeight: 'BERAT SASARAN',
      targetWeightUnset: '—',
      targetWeightHint: 'Luncurkan untuk menetapkan berat yang anda sasarkan.',
      targetWeightLocked: 'Masukkan berat anda dahulu.',
    },

    activity: {
      title: 'Sesibuk mana hari anda?',
      sedentary: { title: 'Kebanyakannya duduk', subtitle: 'Pejabat, memandu, belajar' },
      light: { title: 'Aktif sedikit', subtitle: 'Sedikit berjalan, kerja rumah ringan' },
      onFeet: {
        title: 'Berdiri sepanjang hari',
        subtitle: 'Peruncitan, kejururawatan, tapak kerja',
      },
      veryActive: { title: 'Sangat aktif', subtitle: 'Berlatih hampir setiap hari' },
    },

    source: {
      title: 'Dari mana anda dengar tentang kami?',
      subtitle: 'Ia membantu kami tahu di mana perlu muncul seterusnya.',
      xiaohongshu: 'XiaoHongShu',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      reddit: 'Reddit',
      facebook: 'Facebook',
      threads: 'Threads',
      appStore: 'App Store',
      googlePlay: 'Google Play',
      friend: 'Kawan atau keluarga',
      other: 'Tempat lain',
    },

    calculating: {
      title: 'Membina pelan anda',
      subtitle: 'Dikira daripada jawapan anda, bukan purata.',
      steps: {
        budget: 'Sasaran kalori harian',
        macros: 'Pecahan karbo, protein dan lemak',
        catalogue: 'Memadankan makanan anda',
      },
    },

    target: {
      title: 'Bajet harian anda',
      perDay: 'KCAL SEHARI',
      carbs: 'KARBO',
      protein: 'PROTEIN',
      fat: 'LEMAK',
      goalWeight: 'BERAT SASARAN',
      goalBy: 'DIJANGKA MENJELANG',
      maintain: 'KEKALKAN',
      maintainValue: 'Stabil',
      looksRight: 'Ini nampak betul',
      adjust: 'Tukar jawapan saya',
    },

    health: {
      title: 'Biar jam tangan yang kira',
      subtitle: 'Apa yang anda bakar ditambah kepada bajet hari ini.',
      connectApple: 'Sambungkan Apple Health',
      connectAndroid: 'Sambungkan Health Connect',
      demo: 'Guna aktiviti yang dijana',
      later: 'Bukan sekarang',
      emptyToast: 'Tiada apa-apa kembali daripada Health. Anda boleh sambung semula dari Aktiviti.',
      failedToast:
        'Kami tidak dapat menyambung ke stor kesihatan anda. Anda boleh cuba lagi dari Aktiviti.',
      reassurance: 'Baca sahaja. Anda boleh sambung kemudian dari Aktiviti.',
      offline: 'Menunggu sambungan. Anda boleh langkau ini dan sambung kemudian.',
    },

    notifications: {
      title: 'Satu peringatan pada masa yang tepat',
      subtitle: 'Tiga peringatan waktu makan, mengikut masa anda sendiri.',
      meals: 'Peringatan waktu makan',
      scans: 'Pinggan anda sudah dikira',
      nothingElse: 'Dan tiada apa-apa lagi',
      promise: 'Matikan mana-mana daripadanya dalam Saya, Peringatan.',
      enable: 'Hidupkan pemberitahuan',
      later: 'Mungkin nanti',
      blocked: 'Peringatan dimatikan untuk RiceCal. Anda boleh hidupkannya dalam Saya, Peringatan.',
    },

    tutorial: {
      appBar: 'Bagaimana RiceCal berfungsi',
      skip: 'Langkau',
      next: 'Seterusnya',
      done: 'Mula merekod',
      offerTitle: 'Baru di sini?',
      offerBody: 'Lawatan 30 saat tentang cara merekod.',
      offerAction: 'Tunjukkan',

      log: {
        title: 'Empat cara merekod',
        subtitle: 'Ketik butang hijau pada Hari ini, kemudian pilih satu.',
        snap: 'Snap',
        snapBody: 'Gambar pinggan itu',
        describe: 'Terangkan',
        describeBody: 'Taip apa yang anda makan',
        search: 'Cari',
        searchBody: 'Cari mengikut nama',
        recipes: 'Resipi',
        recipesBody: 'Sesuatu yang anda masak',
        barcode: 'Ada bungkusan? Kamera juga mengimbas barkod.',
      },

      read: {
        title: 'Ia mendarat pada hari anda',
        subtitle: 'Kami namakan hidangannya, ukur bahagiannya dan kira untuk anda.',
        exampleName: 'Nasi lemak ayam',
        exampleDetail: '1 pinggan, 320 g',
        exampleKcal: '644',
        tip: 'Ambil gambar dari atas, dengan seluruh pinggan dalam bingkai.',
      },

      fix: {
        title: 'Salah? Cakap sahaja',
        subtitle: 'Ketik rekod itu, kemudian ikon berkilau. Perkataan biasa sudah memadai.',
        chipHalf: 'Separuh bahagian',
        chipNoRice: 'Tanpa nasi',
        chipExtra: 'Tambah minuman',
        typed: 'Saya makan separuh nasi sahaja',
        beforeLabel: 'SEBELUM',
        before: '644',
        afterLabel: 'SELEPAS',
        after: '498',
      },

      day: {
        title: 'Lihat hari anda terisi',
        subtitle: 'Cincin itu ialah bakinya. Bar itu ialah karbo, protein dan lemak.',
        ringCaption: 'BAKI KCAL',
        carbs: 'Karbo',
        protein: 'Protein',
        fat: 'Lemak',
        note: 'Pergerakan dari jam tangan anda ditambah di atas, tidak pernah ditolak.',
      },
    },

    saving: {
      title: 'Menyimpan jawapan anda…',
      offlineTitle: 'Menunggu sambungan',
      offlineBody:
        'Jawapan anda selamat dalam telefon ini. Kami akan simpan sebaik sahaja anda dalam talian.',
      failedTitle: 'Kami tidak dapat menyimpan jawapan anda',
      failedBody: 'Tiada apa-apa yang hilang. Semak sambungan anda dan cuba lagi.',
    },

    account: {
      title: 'Simpan kemajuan anda',
      subtitle: 'Jawapan anda sudah sedia. Akaun memastikan ia selamat jika anda tukar telefon.',
      signInTitle: 'Selamat kembali',
      signInSubtitle: 'Log masuk dan diari anda akan menyambung dari tempat ia berhenti.',
      apple: 'Teruskan dengan Apple',
      google: 'Teruskan dengan Google',
      or: 'ATAU',
      email: 'E-MEL',
      emailPlaceholder: 'you@email.com',
      errors: {
        email: 'Itu tidak nampak seperti alamat e-mel.',
      },
    },
  },

  logging: {
    today: {
      title: 'Hari ini',
      backToTodayA11y: 'Kembali ke hari ini',
      kcalLeft: 'BAKI KCAL',
      kcalOver: 'KCAL LEBIH',
      kcalOfGoal: '/{{goal}} KCAL',
      showGoals: 'Tunjuk peruntukan hari ini',
      showLeft: 'Tunjuk apa yang tinggal',
      overNote: 'Sedikit lebih hari ini, esok kiraan baharu.',
      overNoteOn: 'Sedikit lebih pada hari itu.',
      burnedNote: '+{{kcal}} daripada bergerak hari ini',
      burnedNoteOn: '+{{kcal}} daripada bergerak pada hari itu',
      logHeading: 'DIMAKAN · {{kcal}} KCAL',
      analysing: 'Membaca pinggan anda',
      analysingHint: 'Mengira sebaik sahaja ia tahu ini apa',
      describing: 'Membaca apa yang anda tulis',
      describingRead: 'Membaca apa yang anda tulis…',
      scanningRead: 'Membaca pinggan anda…',
      scanningMatch: 'Mencarinya dalam katalog…',
      scanningPortion: 'Mengukur bahagiannya…',
      scanningCount: 'Mengira kalorinya…',
      refiningApply: 'Menggunakan pembetulan anda…',
      refiningCount: 'Mengira semula kalorinya…',
      scanDoneTitle: 'Pinggan anda sudah dikira',
      describeDoneTitle: 'Hidangan anda sudah dikira',
      scanDoneBody: '{{food}} · {{kcal}} kcal',
      scanDoneBodyPlain: 'Ketik untuk lihat apa yang ada padanya.',
      deleteEntry: 'Padam',
      noFoodTitle: 'Tiada makanan dalam gambar ini',
      noFoodTypedTitle: 'Tiada makanan dalam apa yang anda tulis',
      noFoodHint: 'Tiada apa-apa ditambah kepada hari anda.',
      noFoodDismiss: 'Tutup',
      analysisFailedTitle: 'Tidak dapat membaca yang ini',
      analysisFailedHint: 'Ketik untuk pilih hidangannya sendiri',

      noBudgetTitle: 'Belum ada bajet harian',
      noBudgetBody: 'Tetapkan sasaran anda dan cincin itu ada sesuatu untuk diisi.',
      noBudgetAction: 'Tetapkan sasaran saya',
    },

    week: {
      a11y: {
        plain: '{{day}}',
        ahead: '{{day}}, belum tiba',
        under: '{{day}}, bawah sasaran',
        over: '{{day}}, atas sasaran',
        missed: '{{day}}, tiada rekod',
      },
    },

    calendar: {
      showMonth: 'Tunjuk bulan',
      showDay: 'Tunjuk hari',
      previousMonth: 'Bulan sebelumnya',
      nextMonth: 'Bulan selepasnya',
      legend: {
        under: 'Bawah sasaran',
        over: 'Atas sasaran',
        missed: 'Tiada rekod',
      },
      dayHeading: '{{day}}',
      dayKcal: '{{kcal}} kcal',
      dayEmpty: 'Tiada rekod pada hari itu.',
    },

    selector: {
      title: 'Rekod satu hidangan',
      remaining: 'baki {{count}} kcal',
      snap: 'Snap',
      describe: 'Terangkan',
      search: 'Cari',
    },

    capture: {
      tabs: 'Apa yang anda halakan',
      meal: 'Hidangan',
      barcode: 'Barkod',
      scansLeft_zero: 'Tiada baki imbasan hari ini. Ia kembali esok.',
      scansLeft_one: 'baki {{count}} imbasan hari ini',
      scansLeft_other: 'baki {{count}} imbasan hari ini',
    },

    barcode: {
      permissionTitle: 'Benarkan RiceCal guna kamera',
      permissionBody:
        'Kamera membaca barkod pada bungkusan. Tiada apa-apa dirakam atau dimuat naik.',
      aim: 'Halakan kamera ke barkod pada bungkusan.',
      noCamera: 'Peranti ini tiada kamera, jadi tiada apa-apa untuk mengimbas di sini.',
      missTitle: 'Bungkusan baharu',
      unknown: 'Kami belum ada yang ini. Terangkan sahaja dan kami akan kira.',
      failedTitle: 'Tiada jawapan',
      failed:
        'Kami tidak dapat menghubungi katalog buat masa ini. Bungkusan itu mungkin tiada masalah; sambungannya yang bermasalah.',
      tryAgain: 'Imbas lagi',
      describeInstead: 'Terangkan sahaja',
    },

    describe: {
      placeholder: 'Nasi lemak dengan ayam goreng dan teh tarik',
      send: 'Rekod hidangan ini',
    },

    camera: {
      title: 'Snap pinggan anda',
      analysing: 'Mengenal pasti apa yang ada pada pinggan',
      permissionTitle: 'Akses kamera diperlukan',
      permissionBody:
        'RiceCal guna kamera untuk membaca pinggan anda. Tiada apa-apa meninggalkan telefon anda.',
      permissionGrant: 'Benarkan kamera',
      shutter: 'Ambil gambar',
      library: 'Pilih dari galeri',
      flip: 'Tukar kamera',
      captured: 'Gambar yang baru anda ambil',
      photoOf: 'Gambar {{food}}',
    },

    added: {
      toast: 'Ditambah, {{kcal}} kcal',
      removedToast: 'Dibuang daripada hari ini',
    },

    search: {
      title: 'Cari',
      placeholder: 'Cari mana-mana hidangan',
      clear: 'Kosongkan carian',
      place: {
        mamak: 'Mamak',
        kopitiam: 'Kopitiam',
        hawker: 'Gerai',
        packaged: 'Berbungkus',
        home: 'Masakan rumah',
      },
      emptyTitle: 'Tiada hidangan dengan nama itu',
      emptyBody: 'Cuba perkataan yang lebih pendek, atau kurangkan perkataannya.',
      offlineTitle: 'Tiada sambungan',
      offlineBody:
        'Senarai hidangan berada di pelayan. Ini akan berjalan sebaik sahaja anda kembali dalam talian.',
      errorTitle: 'Tidak dapat mencari',
      errorBody: 'Ada sesuatu yang tidak kena semasa mencarinya. Cuba lagi sebentar nanti.',
    },

    detail: {
      servings: 'Bahagian',
      typeServings: 'Taip jumlah yang tepat',
      total: 'JUMLAH KCAL',
      moreNutrients: 'Lagi nutrien',
      fibre: 'Serat',
      sugar: 'Gula',
      sodium: 'Garam (natrium)',
      milligrams: '{{value}}mg',
      fixTitle: 'Betulkan dengan menaip',
      fixPlaceholder: 'tiada sambal, dan ia separuh pinggan',
      fixAction: 'Betulkan',
      fixNotApplied: 'Tidak dapat menggunakannya. Cuba ubah ayatnya',
      plateTitle: 'BAHAN',
      plateTotal: 'Jumlah',
      plateEmptied:
        'Tiada apa-apa tinggal pada pinggan. Rekod itu kembali dikira sebagai satu bahagian.',
      times: '× {{amount}}',
      grams: '({{grams}} g)',
      count: '(× {{amount}})',
      partKcal: '{{kcal}} kcal',
      gramsShort: '{{grams}} g',
      gramsField: 'Berat dalam gram',
      lessOf: 'Kurangkan {{name}}',
      moreOf: 'Tambahkan {{name}}',
      removeOf: 'Buang {{name}}',
      editKcal: 'Kalori',
      figuresTitle: 'Angka anda sendiri',
      macrosTitle: 'Makro',
      editFigures: 'Sunting kalori dan makro',
      editPlate: 'Sunting bahan',
      editDetails: 'Sunting nama, hari dan masa',
      yourFigures: 'Angka anda sendiri, bukan angka apl.',
      nameField: 'Nama',
      numbersReset: 'Guna angka apl',
      servingWord: 'bahagian',
      quickFix: {
        halfPortion: 'Separuh bahagian',
        noSambal: 'Tiada sambal',
        addEgg: 'Tambah telur',
        extraRice: 'Nasi tambah',
      },
      editByHand: 'Sunting butiran secara manual',
      whenValue: '{{day}} pada {{time}}',
      whenRow: 'Tarikh',
      dayTitle: 'Hari',
      timeTitle: 'Masa',
      hour: 'Jam',
      minute: 'Minit',
      am: 'pagi',
      pm: 'petang',
      movedTo: 'Dipindahkan ke {{day}}',
      save: 'Simpan',
      saveFailed: 'Tidak dapat menyimpan perubahan itu',
      discardTitle: 'Keluar tanpa menyimpan?',
      discardBody: 'Apa yang anda ubah di sini akan digugurkan dan rekod itu kekal seperti asal.',
      discardConfirm: 'Buang',
      deleteEntry: 'Padam rekod ini',
      deleteTitle: 'Padam rekod ini?',
      deleteBody: 'Ia keluar terus daripada hari ini dan kiraannya naik semula.',
      addToDiary: 'Tambah ke diari',
      decreaseServing: 'Kurang satu',
      increaseServing: 'Tambah satu',
      choosePicture: 'Pilih gambar untuk rekod ini',
      addPicture: 'Ketik untuk tambah gambar',
      photoFailed: 'Tidak dapat menyimpan gambar itu',
      replacePhoto: 'Ganti foto dengan gambar',
      replacePhotoTitle: 'Ganti foto anda?',
      replacePhotoBody:
        'Rekod ini menyimpan foto atau gambar, bukan kedua-duanya. Foto pinggan sebenar anda akan hilang selamanya.',
      replacePhotoConfirm: 'Pilih gambar',
      shareEntry: 'Kongsi hidangan ini',
    },

    share: {
      loggedBy: 'Direkod oleh',
      brand: 'RiceCal',
      text: '{{food}}, {{kcal}} kcal. Direkod dengan RiceCal',
      failed: 'Tidak dapat membuat gambar itu',
    },

    icon: {
      title: 'Pilih satu gambar',
      searchTab: 'Cari',
      cameraTab: 'Kamera',
      searchLabel: 'Cari gambar',
      searchPlaceholder: 'nasi lemak, teh tarik, ikan',
      noMatch: 'Tiada yang sepadan dengan “{{query}}”.',
    },

    water: {
      title: 'Air',
      count: '{{filled}} / {{goal}} ml',
      addTitle: 'Tambah air',
      left: 'baki {{amount}} ml',
      add: 'Tambah {{amount}} ml',
      customLabel: 'Jumlah lain',
      customPlaceholder: '600',
      customAdd: 'Tambah jumlah ini',
      customRemove: 'Tolak jumlah ini',
      added: '{{amount}} ml air',
      removed: '{{amount}} ml ditolak',
      undo: 'Buat asal',
      level: '{{filled}} daripada {{goal}} ml diminum hari ini',
    },
  },

  progress: {
    title: 'Trend',

    ofDays: '{{done}} daripada {{total}}',

    metric: {
      calories: 'Kalori',
      water: 'Air',
      weight: 'Berat',
      caloriesUnit: 'purata',
      waterUnit: 'ml',
      none: '—',
      a11y: '{{metric}}, {{value}}',
    },

    range: {
      label: 'Julat',
      '7d': '7H',
      '30d': '30H',
      '1y': '1T',
      span7d: '7 hari lalu',
      span30d: '30 hari lalu',
      span1y: '12 bulan lalu',
      week: 'Mg {{index}}',
      weekLong: 'Minggu {{index}}',
    },

    calories: {
      goalNote: 'Sasaran {{goal}} kcal sehari',
      goalNoteWeekly: 'Purata mingguan, sasaran {{goal}} sehari',
      goalNoteMonthly: 'Purata bulanan, sasaran {{goal}} sehari',
      noGoal: 'Belum ada bajet harian ditetapkan',
      under: '{{value}} kurang',
      over: '{{value}} lebih',
      chart: 'Kalori sehari, dipecahkan mengikut karbo, protein dan lemak',

      grams: '{{value}} g',
      shareOfIntake: '{{value}}% daripada pengambilan',

      goalTitle: 'BERBANDING SASARAN ANDA',
      daysUnder: 'Hari bawah {{goal}}',
      daysLogged: 'Hari direkod sepenuhnya',

      notableTitle: 'BULAN YANG MENONJOL',
      monthAverage: 'purata {{value}}',

      emptyTitle: 'Tiada hidangan dalam julat ini',
      emptyBody: 'Rekod sesuatu dan bar itu akan terisi dari hari anda melakukannya.',
    },

    water: {
      dayNote: 'Setiap lajur ialah satu hari berbanding sasaran anda',
      weeklyNote: 'Setiap lajur ialah satu minggu, dipuratakan berbanding sasaran anda',
      monthlyNote: 'Setiap lajur ialah satu bulan, dipuratakan berbanding sasaran anda',
      goalPill: 'sasaran {{amount}}',
      chart: 'Air sehari berbanding sasaran {{amount}}',

      reached: 'Sasaran dicapai',
      short: 'Kurang daripada sasaran',

      goalDays: 'HARI SASARAN',
      bestDay: 'HARI TERBAIK',
      bestMonth: 'BULAN TERBAIK',
      yearAverage: 'PURATA TAHUN',
      total: 'JUMLAH',

      todayTitle: 'HARI INI',

      habitTitle: 'TABIAT',
      daysAtLeast: 'Hari pada {{amount}} atau lebih',
      daysLogged: 'Hari direkod',
      monthsAveraging: 'Bulan purata {{amount}}+',
      monthsLogged: 'Bulan direkod',

      emptyTitle: 'Tiada air direkod dalam julat ini',
      emptyBody: 'Rekod satu minuman pada Hari ini dan ini akan terisi.',
    },

    weight: {
      peakOn: '{{value}} {{unit}} pada {{date}}',
      peakIn: '{{value}} {{unit}} dalam {{month}}',
      change: '{{value}} {{unit}}',
      chart: 'Berat anda sepanjang {{span}}',

      thisWeek: 'MINGGU INI',
      thisMonth: 'BULAN INI',
      thisYear: 'TAHUN INI',
      average7: 'PURATA 7 HARI',
      average30: 'PURATA 30 HARI',
      lightest: 'PALING RINGAN',
      weighIns: 'TIMBANGAN',
      monthsLogged: 'BULAN DIREKOD',

      toGoal: '{{value}} {{unit}} lagi ke sasaran {{target}} {{unit}} anda',
      noTarget: 'Tiada berat sasaran ditetapkan',
      atGoal: 'Pada berat sasaran anda',
      weeksAway: '~{{count}} minggu',

      recentTitle: 'TIMBANGAN TERKINI',
      add: 'Tambah',
      weekByWeek: 'MINGGU DEMI MINGGU',
      byQuarter: 'MENGIKUT SUKU',
      quarter: '{{from}} hingga {{to}}',

      reading: '{{value}} {{unit}}',
      readingToday: 'Hari ini',
      firstReading: 'Pertama',

      sheetTitle: 'Tambah berat',
      sheetEditTitle: 'Timbangan pada {{date}}',
      thisMorning: 'Pagi ini',
      down: '{{value}} {{unit}} turun daripada {{day}}',
      up: '{{value}} {{unit}} naik daripada {{day}}',
      same: 'Sama seperti {{day}}',
      save: 'Simpan timbangan',
      saved: 'Timbangan disimpan',
      remove: 'Buang bacaan ini',
      removeTitle: 'Buang bacaan ini?',
      removeBody:
        'Carta itu kehilangan hari ini. Jika ia yang terkini, bajet anda kembali kepada yang sebelumnya.',

      emptyTitle: 'Tiada timbangan dalam julat ini',
      emptyBody: 'Satu bacaan melukis satu titik. Dua melukis satu garis.',
    },
  },

  profile: {
    home: {
      title: 'Saya',
      memberSince: 'Ahli sejak {{month}}',
      streak: 'RENTETAN',
      goal: 'SASARAN',
      pro: 'RiceCal Pro',
      proTrial: 'Percubaan tamat {{when}}',
      proTrialTomorrow: 'esok',
      proTrialOn: 'pada {{date}}',
      noName: 'Akaun anda',
      signOutTitle: 'Log keluar?',
      signOutBody:
        'Rekod anda kekal selamat. Log masuk semula pada mana-mana telefon untuk menyambungnya.',
      proTrialIn_one: 'dalam {{count}} hari',
      proTrialIn_other: 'dalam {{count}} hari',
      proActive: 'Pelan {{plan}}, aktif',
      proActivePlain: 'Pro, aktif',
      proNone: 'Pelan percuma',
      metric: 'Metrik',
      imperial: 'Imperial',
      settings: 'TETAPAN',
      personalisation: 'Pemperibadian',
      goals: 'Sasaran dan matlamat',
      goalsValue: '{{kcal}} kcal',
      reminders: 'Peringatan',
      remindersValue: '{{count}} hidup',
      healthOff: 'Tidak bersambung',
      units: 'Bahasa dan unit',
      tutorial: 'Bagaimana RiceCal berfungsi',
      help: 'Pusat bantuan',
      rate: 'Nilai RiceCal',
      signOut: 'Log keluar',
    },

    rate: {
      title: 'Suka RiceCal?',
      body: 'Jawapan anda menentukan apa yang kami bina seterusnya.',
      yes: 'Saya suka',
      no: 'Tidak juga',
      later: 'Nanti dulu',
      feedbackTitle: 'Apa yang perlu diperbaiki?',
      feedbackBody: 'Beritahu kami di Discord. Kebanyakan isi aplikasi ini bermula begitu.',
      feedbackOpen: 'Buka Discord',
      feedbackSkip: 'Bukan sekarang',
    },

    help: {
      title: 'Datang berbual dengan kami',
      body: 'Pelayan Discord kami ialah tempat kami menjawab soalan dan memutuskan apa yang hendak dibina seterusnya.',
      logo: 'Discord',
      bug: 'Laporkan sesuatu yang rosak',
      idea: 'Cadangkan satu ciri',
      ask: 'Tanya kami apa sahaja tentang RiceCal',
      action: 'Buka Discord',
      failed: 'Kami tidak dapat membuka Discord',
    },

    shareEarn: {
      row: 'Kongsi dan dapat Pro',
      title: 'Kongsi dan dapat Pro',
      heroTitle: 'Pos tentang RiceCal, dapat Pro',
      heroBody:
        'Tunjukkan orang pinggan yang anda rekod. Semakin banyak hantaran anda disukai, semakin lama Pro yang kami hantar.',

      platforms: 'HANTAR DI',

      rewards: 'APA NILAINYA',
      postReward: '1 bulan Pro',
      postBadge: '30+ suka',
      postBody: 'Mana-mana hantaran awam tentang apl ini, pada mana-mana daripadanya.',
      likedReward: '1 tahun Pro',
      likedBadge: '100+ suka',
      likedBody: 'Hantaran anda menemui orang yang ia ditujukan.',
      viralReward: 'Pro selamanya',
      viralBadge: '500+ suka',
      viralBody:
        'Anda jadi viral. Ia milik anda, tiada pembaharuan, tiada apa-apa untuk dibatalkan.',

      how: 'BAGAIMANA IA BERFUNGSI',
      step1:
        'Buat hantaran tentang RiceCal di mana-mana tempat awam. Tangkapan skrin diari anda, atau pinggan yang anda imbas, paling berkesan.',
      step2: 'Beri ia beberapa hari untuk mengumpul suka.',
      step3: 'Bawa pautan itu ke Discord kami dan kami hantar kod Pro kepada anda.',

      claim: 'SUDAH BUAT HANTARAN?',
      claimBody: 'Letakkan pautan itu dalam Discord kami dan kami akan semak dan hantar kod anda.',
      claimAction: 'Buka Discord',

      finePrint:
        'Satu ganjaran seorang. Kami semak hantaran itu awam dan kira sukanya semasa anda menuntut, jadi beri ia masa dahulu.',
      openFailed: 'Kami tidak dapat membuka apl itu',
    },

    goals: {
      title: 'Sasaran dan matlamat',
      dailyCalories: 'KALORI HARIAN',
      recommended: 'DISYORKAN {{value}}',
      macroTargets: 'SASARAN MAKRO',
      macroValue: '{{grams}} g · {{percent}}%',
      goal: 'SASARAN',
      currentWeight: 'Berat semasa',
      targetWeight: 'Berat sasaran',
      weeklyPace: 'Kadar mingguan',
      paceLosing: 'Turun {{value}} {{unit}}',
      paceGaining: 'Naik {{value}} {{unit}}',
      paceHolding: 'Kekal stabil',
      other: 'LAIN-LAIN',
      waterGoal: 'Sasaran air',
      saved: 'Sasaran disimpan',
    },

    personalisation: {
      title: 'Pemperibadian',
      mealsTitle: 'WAKTU MAKAN',
      mealsNote: 'Ini masa peringatan anda berbunyi.',
      editMeal: 'Tukar bila {{meal}}',
      hour: 'Jam',
      minute: 'Minit',
      preview: 'Mengingatkan pada {{time}}',
    },

    reminders: {
      title: 'Peringatan',
      meals: 'WAKTU MAKAN',
      mealAt: '{{meal}} · {{time}}',
      habits: 'TABIAT',
      water: 'Air setiap 2 jam',
      weighIn: 'Timbang pada hari Isnin',
      weeklyReport: 'Laporan mingguan',
      monthlyReport: 'Laporan bulanan',
      denied: 'Peringatan memerlukan kebenaran pemberitahuan.',
      blockedTitle: 'Pemberitahuan dimatikan',
      blockedBody: 'Hidupkannya dalam Tetapan dan suis ini akan berfungsi.',
      openSettings: 'Buka Tetapan',
      push: {
        mealTitle: 'Masa untuk {{meal}}',
        mealBody: 'Rekod sementara anda ingat. Ia ambil masa sepuluh saat.',
        waterTitle: 'Semakan air',
        waterBody: 'Berapa banyak air setakat hari ini?',
        weighInTitle: 'Timbang pagi',
        weighInBody: 'Awal pagi memberi bacaan paling stabil.',
        weeklyTitle: 'Minggu anda dalam makanan',
        weeklyBody: 'Tujuh hari rekod, dalam satu skrin.',
        monthlyTitle: 'Bulan anda dalam makanan',
        monthlyBody: 'Empat minggu, dan apa hasilnya.',
      },
    },

    preferences: {
      title: 'Bahasa dan unit',
      language: 'BAHASA',
      languageLabel: 'Bahasa apl',
      units: 'UNIT',
      weight: 'Berat',
      kg: 'kg',
      lb: 'lb',
      energy: 'Tenaga',
      kcal: 'kcal',
      kj: 'kJ',
      appearance: 'RUPA',
      light: 'Cerah',
      dark: 'Gelap',
      auto: 'Auto',
    },

    subscription: {
      title: 'Langganan',
      pro: 'RiceCal Pro',
      trialLeft_one: 'Percubaan percuma, baki {{count}} hari',
      trialLeft_other: 'Percubaan percuma, baki {{count}} hari',
      renews: 'Diperbaharui pada {{price}}.',
      neverRenews: 'Dibayar sekali. Tiada pembaharuan.',
      freeBody: '{{scans}} imbasan sehari, {{recipes}} resipi, dan trend minggu lepas.',
      whatYouGet: 'APA YANG ANDA DAPAT DENGAN PRO',
      included: 'TERMASUK',
      cancel: 'Batalkan langganan',
      cancelTitle: 'Batalkan langganan anda?',
      cancelBody:
        'Anda kekal Pro sehingga tamat tempoh. Rekod anda tetap boleh dibaca sama ada cara.',
      cancelConfirm: 'Batalkan pelan',
      switchMonthly: 'Tukar ke bulanan',
      switchYearly: 'Tukar ke tahunan',
      manage: 'Urus dalam gedung',
      switched: 'Pelan dikemas kini',
    },
  },

  paywall: {
    couldNotCheck: 'Kami tidak dapat menyemak langganan anda. Cuba lagi sebentar nanti.',

    plans: {
      yearly: 'Tahunan',
      perMonth: '{{price}} sebulan',
      yearlyBadge: 'JIMAT {{percent}}%',
      yearlyBilling: 'Dibil setiap tahun',
      monthly: 'Bulanan',
      monthlyBilling: 'Dibil setiap bulan',
      lifetime: 'Seumur hidup',
      lifetimeDetail: 'Satu bayaran, milik anda selamanya',
    },

    hard: {
      appBar: 'RiceCal Pro',
      title: 'Tiada had dengan RiceCal Pro',
      assurance: 'Tiada komitmen, batal bila-bila masa',
      assuranceLifetime: 'Satu bayaran, boleh dikembalikan melalui gedung',
      smallPrintYearly: 'Percuma 7 hari, kemudian {{price}} setahun.',
      smallPrintMonthly: 'Percuma 7 hari, kemudian {{price}} sebulan.',
      smallPrintLifetime: 'Satu bayaran {{price}}. Tiada langganan, tiada pembaharuan.',
      smallPrintPending: 'Percuma 7 hari.',
      start: 'Mula percubaan percuma',
      startLifetime: 'Beli akses seumur hidup',
      restore: 'Pulihkan pembelian',
      nothingToRestore: 'Tiada apa-apa untuk dipulihkan pada akaun ini',
      notConfigured: 'Pembelian belum disediakan dalam binaan ini.',
      restored: 'Pembelian anda sudah kembali',
    },

    table: {
      title: 'PERCUMA LAWAN PRO',
      free: 'Percuma',
      pro: 'Pro',
      rows: {
        snap: {
          label: 'Snap satu pinggan',
          free: '{{scans}}/hari',
          pro: 'Tanpa had',
        },
        describe: {
          label: 'Cakap apa yang anda makan, dalam perkataan',
          free: '',
          pro: '',
        },
        barcode: {
          label: 'Imbas satu bungkusan',
          free: '',
          pro: '',
        },
        search: {
          label: 'Cari dalam pangkalan data makanan',
          free: '',
          pro: '',
        },
        fix: {
          label: 'Betulkan hidangan dengan menerangkannya',
          free: '',
          pro: '',
        },
        suggest: {
          label: 'Tanya apa hendak dimakan seterusnya',
          free: '',
          pro: '',
        },
        recipes: {
          label: 'Simpan apa yang anda masak',
          free: '{{recipes}} resipi',
          pro: 'Tanpa had',
        },
        recipeFill: {
          label: 'Isi resipi daripada gambar',
          free: '',
          pro: '',
        },
        budget: {
          label: 'Bajet kalori yang sesuai untuk anda',
          free: '',
          pro: '',
        },
        health: {
          label: 'Apple Health dan Health Connect',
          free: '',
          pro: '',
        },
        reminders: {
          label: 'Peringatan waktu makan',
          free: '',
          pro: '',
        },
        trends: {
          label: 'Trend',
          free: '7 hari',
          pro: 'Sehingga setahun',
        },
        reviews: {
          label: 'Ulasan mingguan dan bulanan',
          free: 'Minggu terkini',
          pro: 'Setiap satu',
        },
        photos: {
          label: 'Gambar hidangan anda',
          free: '{{days}} hari',
          pro: 'Tanpa had',
        },
      },
    },

    intro: {
      title: 'Semuanya sudah sedia. Nak mula merekod?',
      body: 'Semuanya berfungsi tanpanya. Pro membuang hadnya.',
      later: 'Mungkin nanti',
    },

    reminder: {
      title_one: 'baki {{count}} hari dalam percubaan anda',
      title_other: 'baki {{count}} hari dalam percubaan anda',
      body: 'Anda sudah merekod {{days}} hari berturut-turut dan turun {{kg}} kg. Teruskan.',
      daysLogged: 'HARI DIREKOD',
      meals: 'HIDANGAN',
      kgDown: 'KG TURUN',
      starts: 'Pelan anda bermula {{date}} pada {{price}} setahun.',
      keep: 'Kekalkan pelan saya',
      manage: 'Urus langganan',
    },

    ended: {
      heading: 'Hari ini',
      previewMode: 'Mod pratonton',
      title: 'Percubaan anda sudah tamat',
      body: 'Sejarah {{days}} hari anda selamat dan masih boleh dibaca.',
      dataWaiting: 'DATA ANDA MENUNGGU',
      days: 'HARI',
      meals: 'HIDANGAN',
      kgDown: 'KG TURUN',
      lockedEntry: 'Berkunci',
      resume: 'Teruskan dengan Pro',
      browse: 'Terus melayari secara percuma',
    },

    limit: {
      freeReached:
        'Itu {{count}} imbasan anda untuk hari ini. Pro mengimbas seberapa banyak anda mahu.',
      proReached: 'Anda sudah mencapai had imbasan hari ini. Sila hubungi admin.',
      notEntitledDetail: 'Langganan anda tidak aktif.',
      confirming: 'Pembelian anda sedang diproses. Beri ia sebentar dan cuba lagi.',
      feature: {
        camera: 'Mengimbas satu lagi pinggan hari ini memerlukan RiceCal Pro.',
        describe: 'Mengatakan apa yang anda makan dalam perkataan memerlukan RiceCal Pro.',
        refine: 'Membetulkan hidangan dengan menerangkannya memerlukan RiceCal Pro.',
        read_recipe: 'Mengisi resipi daripada gambar memerlukan RiceCal Pro.',
        new_recipe: 'Menyimpan lebih daripada {{recipes}} resipi memerlukan RiceCal Pro.',
        suggest: 'Bertanya apa hendak dimakan seterusnya memerlukan RiceCal Pro.',
        trend_range: 'Melihat lebih jauh daripada seminggu memerlukan RiceCal Pro.',
        review: 'Membaca ulasan lama memerlukan RiceCal Pro.',
        nudge: 'RiceCal Pro membuang hadnya.',
      },
    },

    checking: 'Sekejap, kami sedang menyemak pelan anda.',

    welcome: {
      title: 'Anda sudah masuk. Jom makan.',
      body: '7 hari percuma anda bermula sekarang. Semuanya terbuka.',
      bodyActive: 'Semuanya terbuka.',
      bodyLifetime: 'RiceCal Pro milik anda selamanya. Semuanya terbuka.',
      perks: {
        log: 'Snap, imbas atau cakap',
        database: 'Setiap hidangan dan bungkusan',
        suggest: 'Tanya apa hendak dimakan',
      },
      manageNote: 'Urus atau batalkan bila-bila masa dalam Profil, Langganan.',
      manageNoteLifetime: 'Dibayar sekali. Tiada apa-apa untuk diperbaharui atau dibatalkan.',
      start: 'Pergi ke diari saya',
    },
  },

  recipes: {
    shelf: {
      mine: 'Saya',
      official: 'Rasmi',
      community: 'Komuniti',
    },

    heading: {
      mine: 'Resipi saya',
      official: 'Dapur RiceCal',
      community: 'Daripada komuniti',
    },

    search: {
      official: 'Cari resipi rasmi',
      community: 'Cari resipi awam',
      mine: 'Cari resipi saya',
      clear: 'Kosongkan carian',
      none: 'Tiada apa-apa dengan nama itu',
      noneBody: 'Cuba perkataan yang lebih pendek, atau sebahagian nama hidangan.',
    },

    empty: {
      mineTitle: 'Belum ada resipi',
      mineBody:
        'Satu periuk kongsi tiada saiz hidangan. Masukkan apa yang dimasukkan dan berapa orang ia cukup, sekali sahaja, dan merekodnya hanya satu ketikan selepas itu.',
      officialTitle: 'Dapur ini kosong',
      officialBody: 'Resipi daripada kami akan muncul di sini.',
      communityTitle: 'Belum ada yang dikongsi',
      communityBody: 'Resipi yang dijadikan awam oleh orang akan muncul di sini.',
    },

    servings_one: '{{count}} hidangan',
    servings_other: '{{count}} hidangan',
    ingredients_one: '{{count}} bahan',
    ingredients_other: '{{count}} bahan',
    savedTimes_one: 'disimpan {{count}} kali',
    savedTimes_other: 'disimpan {{count}} kali',
    byAuthor: '{{name}} · {{saves}}',
    fromAuthor: 'Daripada {{name}}',
    someCook: 'Seseorang',

    new: {
      title: 'Resipi baharu',
      scanLabel: 'Gambar',
      describeLabel: 'Terangkan',
      scanTitle: 'Isi daripada gambar',
      or: 'ATAU ISI SENDIRI',
      describeTitle: 'Terangkan ia',
      describePlaceholder:
        'Kari ayam. 600g peha ayam, satu tin santan, 3 biji kentang. Cukup untuk 4.',
      describeHint: 'Sukatan dan berapa orang ia cukup ialah dua perkara yang berbaloi ditaip.',
      describeAction: 'Isikan borang',
      describeFailed: 'Kami tidak dapat membaca yang itu. Isikannya sendiri di bawah.',
      scanFailed: 'Kami tidak dapat membaca yang itu. Isikannya sendiri di bawah.',

      readingPhoto: 'Membaca gambar anda…',
      readingText: 'Membaca apa yang anda tulis…',
      readingIngredients: 'Mengenal pasti apa yang dimasukkan…',
      readingPortions: 'Mengukur bahagiannya…',
      readingSteps: 'Menulis langkahnya…',
      readingHint: 'Tunggu sekejap. Anda boleh ubah apa sahaja selepas ia siap.',
    },

    edit: {
      title: 'Sunting resipi',
      name: 'NAMA',
      namePlaceholder: 'Apa anda panggil ia?',
      picture: 'GAMBAR',
      changePicture: 'Tukar gambar',
      replacePhotoTitle: 'Guna lukisan sebaliknya?',
      replacePhotoBody: 'Foto resipi ini akan dibuang.',
      replacePhotoConfirm: 'Guna lukisan',
      servings: 'BERAPA HIDANGAN',
      ingredients: 'BAHAN',
      ingredientsCount: 'BAHAN · {{count}}',
      ingredientsEmpty:
        'Belum ada apa-apa. Cari setiap item dan kami jumlahkan periuk itu untuk anda.',
      addIngredient: 'Tambah satu bahan',
      steps: 'BAGAIMANA ANDA MASAK',
      stepsPlaceholder: 'Satu langkah setiap baris. Mulakan baris baharu dan kami nomborkannya.',
      stepsHint: 'Setiap baris baharu menjadi langkah bernombor seterusnya.',
      stepsSheetTitle: 'Bagaimana anda masak',
      stepsEditAction: 'Sunting langkah',
      stepsEdit_one: 'Sunting langkah, {{count}} langkah',
      stepsEdit_other: 'Sunting langkah, {{count}} langkah',
      stepsWrite: 'Tulis bagaimana anda masak',
      save: 'Simpan resipi',
      saved: 'Resipi disimpan',
      nameRequired: 'Beri ia nama dahulu',
      saveFailed: 'Tidak dapat menyimpannya. Cuba lagi.',
      limitReached: 'Akaun percuma menyimpan {{count}} resipi. Pro tiada had.',
      totalLabel: 'Setiap hidangan, {{count}}',
      totalWhole: 'Seluruh periuk {{kcal}} kcal',
      discardTitle: 'Keluar tanpa menyimpan?',
      discardBody: 'Perubahan yang anda buat di sini akan hilang.',
      discardConfirm: 'Buang',
    },

    ingredient: {
      title: 'Tambah bahan',
      search: 'Cari satu bahan',
      ownTitle: 'Tambah bahan anda sendiri',
      ownBody: 'Tiada dalam senarai? Beri ia nama dan kalorinya.',
      customBody:
        'Untuk benda yang hanya dapur anda ada. Baca dari bungkusan atau timbang ia sekali.',
      name: 'NAMA',
      namePlaceholder: 'Apa benda ini?',
      calories: 'KALORI',
      macros: 'MAKRO, JIKA ANDA TAHU',
      amount: 'BERAPA BANYAK DIMASUKKAN',
      add: 'Masukkan ke dalam periuk',
      remove: 'Buang',
      change: 'Tukar berapa banyak {{name}}, kini {{measure}}',
      unit: {
        g: 'g',
        ml: 'ml',
        piece_one: 'biji',
        piece_other: 'biji',
      },
    },

    detail: {
      servingLabel_one: 'hidangan',
      servingLabel_other: 'hidangan',
      portion: {
        half: 'Separuh',
        one: '1 hidangan',
        two: '2 hidangan',
        pot: 'Seluruh periuk',
      },
      ofServings: '{{count}} DARIPADA {{total}} HIDANGAN',
      steps: 'BAGAIMANA SAYA MASAK',
      stepsFrom: 'BAGAIMANA {{name}} MASAK',
      noSteps: 'Tiada langkah ditulis.',
      ingredients: 'BAHAN',
      addToDay: 'Tambah ke hari ini',
      added: 'Ditambah ke hari anda',
      saveCopy: 'Simpan ke resipi saya',
      savedCopy: 'Disimpan ke resipi anda',
      saveCopyFailed: 'Tidak dapat menyimpan yang itu. Cuba lagi.',
      goneTitle: 'Resipi tidak dijumpai',
      goneBody:
        'Ia mungkin sudah dipadam, atau dijadikan peribadi semula. Minta pautan baharu daripada sesiapa yang berkongsinya.',
      official: 'Daripada dapur RiceCal',
      delete: 'Padam resipi',
      deleteTitle: 'Padam resipi ini?',
      deleteBody: 'Hidangan yang sudah anda rekod daripadanya kekal dalam diari anda.',
      deleted: 'Resipi dipadam',
    },

    share: {
      action: 'Kongsi',
      title: 'Kongsi resipi ini',
      body: 'Sesiapa yang ada pautan boleh melihat bahan, langkah dan kalorinya, dan menyimpan salinan mereka sendiri. Milik anda kekal milik anda.',
      publicTitle: 'Jadikan ia awam',
      publicBody: 'Ia menyertai tab komuniti untuk sesiapa sahaja mencari dan menyimpannya.',
      publishFailed: 'Tidak dapat menukarnya. Cuba lagi.',
    },

    review: {
      checking: 'Menyemak resipi anda…',
      approved: 'Resipi anda sudah masuk komuniti',
      rejected: 'Tidak diterbitkan: {{reason}}',
      rejectedPlain: 'Kami tidak dapat menerbitkan yang ini.',
      pending: 'Kami masih melihat yang ini. Ia akan muncul selepas ia lulus.',
      badgePending: 'Dalam semakan',
      badgeRejected: 'Tidak diterbitkan',
      badgePublic: 'Awam',
    },

    log: {
      action: 'Resipi',
      empty: {
        mine: 'Belum ada resipi. Tambah satu dan merekodnya hanya satu ketikan.',
        official: 'Belum ada apa-apa dalam dapur.',
        community: 'Belum ada yang dikongsi. Resipi yang dijadikan awam akan muncul di sini.',
      },
    },
  },

  reviews: {
    title: 'Ulasan',

    entry: {
      title: 'Ulasan',
      subtitle: 'Imbas kembali seminggu atau sebulan',
    },

    kind: {
      week: 'Mingguan',
      month: 'Bulanan',
      label: 'Panjang ulasan',
    },

    list: {
      weekMeta: 'Minggu {{index}}',
      weekSummary: '{{kcal}} kcal sehari, {{done}} daripada {{total}} direkod',
      monthMeta: '{{weeks}} minggu, {{done}} daripada {{total}} hari direkod',
      monthSummary: '{{kcal}} kcal sehari',
      monthSummaryWeight: '{{kcal}} kcal sehari, {{weight}}',
      summaryEmpty: 'Tiada rekod',
      a11y: '{{title}}, {{meta}}, {{summary}}',
      a11yLocked: '{{title}}, {{meta}}, {{summary}}, Pro',

      emptyWeekTitle: 'Belum ada minggu untuk diimbas kembali',
      emptyWeekBody:
        'Satu minggu muncul di sini selepas ia tamat dan anda merekod sekurang-kurangnya empat harinya.',
      emptyMonthTitle: 'Belum ada bulan untuk diimbas kembali',
      emptyMonthBody:
        'Satu bulan muncul di sini selepas ia tamat dan anda merekod sekurang-kurangnya dua belas harinya.',
    },

    share: {
      card: 'Kongsi {{card}}',
      preview: 'Kad itu seperti ia akan dihantar',
    },

    story: {
      close: 'Tutup',
      share: 'Kongsi',
      missingTitle: 'Ulasan itu tiada di sini',
      missingBody: 'Ia mungkin minggu yang terlalu sedikit isinya untuk diimbas kembali.',
    },

    card: {
      brand: 'RiceCal',
      kcalADay: 'kcal sehari',
      under: '{{value}} bawah sasaran',
      over: '{{value}} atas sasaran',
      onBudget: 'Tepat pada bajet',
      logged: 'DIREKOD',
      loggedValue: '{{done}} daripada {{total}}',
      streak: 'RENTETAN',
      streakValue_one: '{{count}} hari',
      streakValue_other: '{{count}} hari',
      weightChange: 'BERAT',
      noWeight: '—',
      shareText:
        '{{period}}: {{kcal}} kcal sehari, {{done}} daripada {{total}} hari direkod. RiceCal',
    },

    food: {
      title: 'PINGGAN TERBESAR',
      macros: 'MAKRO SEHARI',
      grams: '{{value}} g',
      share: '{{value}}% daripada tenaga',
    },

    calories: {
      average: 'PURATA SEHARI',
      kcal: 'kcal',
      under: '{{value}} kurang',
      over: '{{value}} lebih',
      goalNote: 'Sasaran {{goal}}. Bawahnya pada {{done}} daripada {{total}} hari.',
      noGoal: 'Tiada bajet harian berkuat kuasa ketika itu.',
      everyDay: 'SETIAP HARI',
      everyWeek: 'SETIAP MINGGU',
      chart: 'Kalori sehari, dipecahkan mengikut karbo, protein dan lemak',
      lightest: '{{day}}, PALING RINGAN',
      heaviest: '{{day}}, PALING BERAT',
      pastWeeks: 'LIMA MINGGU LEPAS',
      pastMonths: 'LIMA BULAN LEPAS',
      noData: '—',
    },

    body: {
      weight: 'BERAT',
      weighIns_one: 'Satu timbangan',
      weighIns_other: '{{count}} timbangan',
      weightChart: 'Berat sepanjang tempoh itu',
      steps: 'LANGKAH SEHARI',
      stepGoal: '{{done}} daripada {{total}} hari melebihi {{goal}} langkah',
      stepsChart: 'Langkah sehari',
      others: 'LAIN-LAIN',
      water: 'Air',
      waterValue: '{{amount}} sehari',
      waterNote_one: 'Penuh pada satu hari',
      waterNote_other: 'Penuh pada {{count}} hari',
      move: 'Minit aktif',
      moveNote_one: 'Satu senaman',
      moveNote_other: '{{count}} senaman',
      moveNoteNone: 'Tiada senaman direkodkan',
      burn: 'Dibakar sehari',
      burnValue: '{{value}} kcal',
      distanceValue: '{{value}} km dilalui',
    },
  },

  suggest: {
    card: {
      title: 'Tak pasti nak makan apa?',
    },

    ask: {
      title: 'Apa yang anda cari?',
      meal: 'HIDANGAN',
      focus: 'MAKRO',
      cuisine: 'MASAKAN',
      limit: 'HAD KALORI',
      editCuisines: 'Sunting masakan',
      addCuisine: 'Tambah satu masakan',
      addCuisinePlaceholder: 'Thai, Nyonya, Jepun',
      removeCuisine: 'Buang {{cuisine}}',
      kcal: 'kcal',
      less: 'Kurangkan kalori',
      more: 'Tambahkan kalori',
      leftToday: 'baki {{kcal}}',
      healthy: 'Lebih ringan',
      anything: 'Apa sahaja',
      healthyA11y: 'Cenderung ke hidangan yang lebih ringan',
      action: 'Cadangkan sesuatu',
    },

    picks: {
      title: 'Idea untuk {{meal}}',
      thinking: 'Mencari sesuatu untuk {{meal}}',
      thinkingA11y: 'Memikirkan apa hendak dicadangkan',
      summary: '{{focus}}, {{cuisine}}, bawah {{kcal}} kcal',
      protein: '{{grams}}g protein',
      retry: 'Cuba lagi',
      emptyTitle: 'Tiada apa-apa terlintas',
      emptyBody: 'Tanya sekali lagi, atau longgarkan salah satu jawapan.',
    },

    detail: {
      unit: 'KCAL, {{portion}}',
      leftAfter: 'baki {{kcal}} kcal selepasnya',
      overAfter: 'lebih {{kcal}} kcal selepasnya',
      why: 'KENAPA INI SESUAI',
      protein: 'Protein',
      carbs: 'Karbo',
      fat: 'Lemak',
      sodium: 'Natrium',
    },

    meal: {
      breakfast: 'Sarapan',
      lunch: 'Makan tengah hari',
      dinner: 'Makan malam',
      snack: 'Snek',
    },
    mealFor: {
      breakfast: 'sarapan',
      lunch: 'makan tengah hari',
      dinner: 'makan malam',
      snack: 'snek',
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
      medium: 'sederhana',
      high: 'tinggi',
    },

    ready_one: '{{count}} idea sudah sedia',
    ready_other: '{{count}} idea sudah sedia',
    readyAction: 'Lihat',

    failed: 'Tidak dapat mengambil sebarang cadangan. Cuba lagi sebentar nanti.',
  },
} satisfies Bundle
