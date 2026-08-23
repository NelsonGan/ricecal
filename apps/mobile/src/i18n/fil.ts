import type { Bundle } from './bundle'

/**
 * Filipino.
 *
 * Filipino DOES have two plural categories, unlike the other Southeast Asian
 * bundles here, so `_one` and `_other` are written out separately wherever the
 * count changes the wording.
 *
 * The one thing date-fns cannot do: it ships no Filipino locale, so month and
 * weekday names in this interface come out in English. See `languages.ts`.
 *
 * Read `en/` before changing anything here. The comments there are the brief.
 */
export const fil = {
  common: {
    action: {
      continue: 'Magpatuloy',
      back: 'Bumalik',
      cancel: 'Kanselahin',
      save: 'I-save ang pagbabago',
      done: 'Tapos na',
      edit: 'I-edit',
      delete: 'Burahin',
      add: 'Idagdag',
      undo: 'I-undo',
      keep: 'Panatilihin',
      skip: 'Laktawan',
      retry: 'Subukan ulit',
      close: 'Isara',
    },

    nav: {
      today: 'Ngayon',
      recipes: 'Recipe',
      activity: 'Aktibidad',
      trends: 'Mga trend',
      me: 'Ako',
      log: 'I-log ang pagkain',
    },

    date: {
      today: 'Ngayon',
      yesterday: 'Kahapon',
    },

    meal: {
      breakfast: 'Almusal',
      lunch: 'Tanghalian',
      dinner: 'Hapunan',
      snack: 'Meryenda',
    },

    macro: {
      carbs: 'Carbs',
      protein: 'Protina',
      fat: 'Taba',
    },

    unit: {
      kcal: 'kcal',
      kcalUpper: 'KCAL',
      grams: '{{value}}g',
      gramsOfGoal: '{{value}}/{{goal}}g',
      kg: 'kg',
      lb: 'lb',
      cm: 'cm',
      gramsLong: '{{value}} gramo',
    },

    volume: {
      ml: '{{value}} ml',
      l: '{{value}} L',
      mlUnit: 'ml',
      lUnit: 'L',
    },

    count: {
      dayStreak_one: '{{count}} araw na sunod-sunod',
      dayStreak_other: '{{count}} araw na sunod-sunod',
      times_one: '{{count}} beses',
      times_other: '{{count}} beses',
    },

    aiLanguage: {
      open: 'Anong wika ang ginagamit ng mga AI feature',
      title: 'Gumagana sa Ingles ang mga AI feature',
      body: 'Ang pagkuha ng litrato ng plato, ang pagsasabi sa salita kung ano ang kinain mo at ang pagtatanong kung ano ang susunod na kakainin ay pumupunta lahat sa isang modelong pinakamahusay sa Ingles. Ilarawan ang pagkain mo sa Ingles at mas malapit ang pagkakaintindi nito.',
      results:
        'Sa Ingles din ang bumabalik. Nakaimbak sa Ingles ang mga pangalan ng ulam, sangkap at laki ng serving sa food catalogue, kaya iyon ang wikang darating anuman ang naka-set sa app.',
      dishes: 'Nananatili ang pangalan ng ulam sa wikang isinulat ito.',
      note: 'Ilarawan ang pagkain sa Ingles para sa pinakatumpak. Sa Ingles din ang resulta.',
    },

    notFound: {
      title: 'Lumipat na ang screen na iyon',
      body: 'Ang link na sinundan mo ay hindi tumuturo kahit saan sa bersyong ito ng app.',
      action: 'Pumunta sa Ngayon',
    },

    offline: {
      title: 'Naghihintay ng koneksyon',
      body: 'Hindi pa namin ito na-save sa telepono mo. Mag-lo-load ito pagkakonekta mo.',
      dayTitle: 'Wala sa telepono mo ang araw na ito',
      dayBody: 'Pumili ng araw na binuksan mo na, o bumalik kapag may koneksyon ka.',
    },

    a11y: {
      back: 'Bumalik',
      close: 'Isara',
      more: 'Iba pang opsyon',
      decrease: 'Bawasan',
      increase: 'Dagdagan',
      step: 'Hakbang {{current}} sa {{total}}',
      backspace: 'Burahin ang huling numero',
      decimalPoint: 'Tuldok desimal',
    },
  },

  activity: {
    title: 'Aktibidad',

    connect: {
      title: 'Hayaang ang relo ang magbilang',
      body: 'Ikonekta ang health app ng telepono mo at bawat lakad, takbo at laro ng badminton ay idadagdag pabalik sa badyet ngayong araw.',

      readTitle: 'ANO ANG BINABASA NAMIN',
      energy: 'Aktibong enerhiya',
      energyBody: 'Ang nasunog mo habang gumagalaw',
      steps: 'Hakbang at distansya',
      stepsBody: 'Ugali araw-araw, hindi target',
      workouts: 'Mga workout',
      workoutsBody: 'Uri, oras, bilis, tibok ng puso',

      privacy:
        'Basa lang. Hindi kami kailanman nagsusulat pabalik, at ang health data mo ay nasa sarili mong account lamang.',

      apple: 'Apple Health',
      appleBody: 'iPhone at Apple Watch',
      connectHealth: 'Health Connect',
      connectHealthBody: 'Samsung Health, Fitbit, Garmin',
      heart: 'Tibok ng puso',
      demo: 'Gumamit ng demo data',
      demoBody: 'Ginawa sa device na ito, para sa development',

      connecting: 'Binabasa ang kasaysayan mo…',
      progress: '{{done}} sa {{total}}',

      emptyTitle: 'Walang bumalik',
      emptyBody:
        'Wala kaming nabasang aktibidad. Kung na-off mo ang RiceCal sa privacy settings ng Health, i-on mo ulit at subukan muli.',
      retry: 'Subukan ulit',

      unavailableTitle: 'Walang health data dito',
      simulator:
        'Walang Health store ang device na ito na mababasa. Sa simulator, ginawang data ang pumupuno sa mga screen na ito.',
      notInstalled:
        'Hindi pa naka-set up ang Health Connect sa teleponong ito. I-install ito mula sa Play Store, mag-on ng app na nagre-record ng galaw mo, tapos bumalik ka dito.',
      notLinked:
        'Walang kasamang health module ang build na ito. I-rebuild ang dev client pagkatapos itong i-install.',
      wrongPlatform: 'Walang health store ang teleponong ito na mababasa ng RiceCal.',
      openStore: 'Buksan ang Play Store',
      checkAgain: 'Suriin ulit',
    },

    today: {
      syncedJustNow: 'Ngayon lang',
      syncedMinutes: '{{count}} min ang nakalipas',
      syncedHours: '{{count}} oras ang nakalipas',
      syncedDays: '{{count}} araw ang nakalipas',
      syncedNever: 'Hindi pa na-sync',

      move: 'Galaw',
      exercise: 'Ehersisyo',
      stand: 'Tayo',
      stepsRing: 'Hakbang',
      moveUnit: '/ {{goal}} kcal',
      exerciseUnit: '/ {{goal}} min',
      standUnit: '/ {{goal}} oras',
      stepsUnit: '/ {{goal}}',
      avgUnit: '/ {{value}} average',
      none: '—',
      noGoal: 'kcal',
      noGoalMinutes: 'min',
      noGoalHours: 'oras',

      budgetTitle: 'BADYET KASAMA ANG GALAW',
      goal: 'TARGET',
      eaten: 'NAKAIN',
      burned: 'NASUNOG',
      left: 'NATITIRA',
      over: 'LAMPAS',
      budgetOff: 'Hindi pinahahaba ng galaw ang badyet mo. I-on ito sa Activity settings.',

      todayTitle: 'NGAYON',
      weekTitle: 'NGAYONG LINGGO',
      stepsRow: 'Hakbang',
      stepsRowValue: '{{steps}} ngayong araw',
      balanceRow: 'Balanse',
      balanceDeficit: '{{value}} kulang bawat araw',
      balanceSurplus: '{{value}} sobra bawat araw',
      balanceUnknown: 'Kulang pa ang naka-log',
      historyRowValue_one: '{{count}} workout · {{time}}',
      historyRowValue_other: '{{count}} workout · {{time}}',
      historyNone: 'Wala pang workout',

      syncing: 'Nagsi-sync…',

      demoBadge: 'Demo data',

      storeEmpty:
        'Nakakonekta ang health store na ito pero walang laman, ganito ang hitsura ng simulator. Ginawang data ang pupuno sa mga screen na ito.',

      noStandNoteGeneric:
        'Hindi nagre-report ng oras ng pagtayo ang health app mo, kaya hakbang ang ipinapakita namin.',
    },

    workout: {
      distance: 'DISTANSYA',
      time: 'ORAS',
      pace: 'PACE',
      speed: 'BILIS',
      paceUnit: '{{value}} /km',
      speedUnit: '{{value}} km/h',
      avgHr: 'AVG HR',
      maxHr: 'MAX HR',
      elevation: 'TAAS',
      bpm: '{{value}} bpm',
      metres: '{{value}} m',

      zonesTitle: 'MGA ZONE NG TIBOK NG PUSO',

      from: 'Mula sa {{source}}',
      missing: 'Wala na ang workout na ito sa health app mo.',
    },

    steps: {
      title: 'Hakbang',
      todaySoFar: 'Ngayong araw hanggang ngayon',
      goalLine: 'Target {{goal}} hakbang',
      over: '{{value}} lampas',
      under: '{{value}} pa',
      unit: 'hakbang · {{distance}}',

      morning: 'Umaga',
      afternoon: 'Hapon',
      evening: 'Gabi',
      noHours: 'Walang breakdown kada oras para sa araw na ito.',

      weekTitle: 'NGAYONG LINGGO',
      dailyAvg: 'AVG KADA ARAW',
      goalDays: 'ARAW NA TARGET',
      best: 'PINAKAMATAAS',

      steadyNote: 'Pantay ang mga araw mo. Anuman ang ginagawa mo, ugali na ito ngayon.',
      shortNote: 'Kulang pa ang araw para makita ang pattern.',
    },

    balance: {
      chartTitle: 'Pasok laban sa labas',
      deficit: '{{value}} kulang',
      surplus: '{{value}} sobra',
      even: 'Patas',
      eatenLegend: 'Nakain',
      burnedLegend: 'Nasunog',

      splitTitle7d: 'SAAN NANGGALING ANG NASUNOG · 7 ARAW',
      splitTitle30d: 'SAAN NANGGALING ANG NASUNOG · 30 ARAW',
      splitTitle1y: 'SAAN NANGGALING ANG NASUNOG · 12 BUWAN',
      resting: 'Pahinga',
      restingBody: 'Sa pagiging buhay lang',
      workouts: 'Mga workout',
      workoutsBody: 'Ang nagastos ng mga session mo',
      walking: 'Paglalakad',
      walkingBody: 'Hakbang at mga lakad-lakad',
      kcal: '{{value}} kcal',

      partial: 'Batay sa {{days}} sa {{total}} araw na may parehong food log at resting figure.',
      noRestingTitle: 'Walang resting energy',
      noRestingBody:
        'Hindi nagre-report ang health app mo kung ano ang sinusunog ng katawan mo habang nagpapahinga, kaya walang araw-araw na balanse na maiguguhit. Hindi apektado ang hakbang, workout at aktibong enerhiya.',
      empty: 'Mag-log ng ilang pagkain habang suot ang relo mo at mapupuno ito.',
    },

    history: {
      title: 'Kasaysayan',
      weekTitle: 'NGAYONG LINGGO',
      sessions: 'SESSION',
      time: 'ORAS',
      burned: 'NASUNOG',
      allTitle: 'LAHAT NG SESSION',
      empty: 'Wala pang naitalang workout.',
      emptyBody: 'Lahat ng naire-record ng relo o telepono mo ay dadating dito.',
    },

    settings: {
      title: 'Health sync',
      connectedTitle: 'NAKAKONEKTA',
      sourceTitle: 'ANO ANG BINABASA NAMIN',
      lastSynced: 'Huling na-sync {{when}}',
      syncNow: 'Mag-sync ngayon',
      syncing: 'Nagsi-sync…',
      extendBudget: 'Pinahahaba ng galaw ang badyet ko',
      extendBudgetBody:
        'Ang nasunog na calories ay idinadagdag sa araw, hindi kailanman binabawas sa kinain mo.',
      stepGoal: 'Target na hakbang',
      disconnect: 'Idiskonekta',
      disconnectBody: 'Hihinto ang pag-sync. Nananatili sa kasaysayan mo ang lahat ng nabasa na.',
      disconnectConfirm: 'Ihinto ang pag-sync?',
      disconnectConfirmBody:
        'Hihinto ang RiceCal sa pagbasa ng health app mo. Mananatili ang aktibidad na naitala na.',
      clearDemo: 'Burahin ang demo data',
      clearDemoBody: 'Aalisin ang bawat ginawang araw at session mula sa account na ito.',
      granted: 'Naka-on',
      notGranted: 'Hindi pinayagan',
      partial: 'May data na hindi ibinabahagi',
    },

    provider: {
      apple_health: 'Apple Health',
      health_connect: 'Health Connect',
      demo: 'Demo data',
    },

    zone: {
      easy: 'Madali',
      steady: 'Pantay',
      hard: 'Mabigat',
      peak: 'Rurok',
    },

    kind: {
      run: 'Takbo',
      walk: 'Lakad',
      hike: 'Hiking',
      cycle: 'Pagbibisikleta',
      swim: 'Paglangoy',
      badminton: 'Badminton',
      tennis: 'Tennis',
      football: 'Football',
      basketball: 'Basketball',
      volleyball: 'Volleyball',
      gym: 'Gym',
      strength: 'Weights',
      hiit: 'HIIT',
      yoga: 'Yoga',
      dance: 'Sayaw',
      martialArts: 'Martial arts',
      rowing: 'Rowing',
      stairs: 'Hagdan',
      other: 'Workout',
    },

    unit: {
      kcal: '{{value}} kcal',
    },
  },

  auth: {
    choose: {
      email: 'Magpatuloy gamit ang email',
    },

    password: {
      signUpTitle: 'Pumili ng password',
      signUpSubtitle: 'Para sa {{email}}. Ito ang gagamitin mo para mag-sign in ulit.',
      signInTitle: 'Ilagay ang password mo',
      signInSubtitle: 'Nagsa-sign in bilang {{email}}.',

      field: 'PASSWORD',
      confirmField: 'KUMPIRMAHIN ANG PASSWORD',
      placeholder: 'Hindi bababa sa 8 karakter',
      show: 'Ipakita ang password',
      hide: 'Itago ang password',

      createAccount: 'Gumawa ng account',
      signIn: 'Mag-sign in',
      forgot: 'Nakalimutan ang password mo?',

      codeInstead: 'I-email na lang sa akin ang code',

      haveAccount: 'May account ka na? Mag-sign in',
      needAccount: 'Bago ka rito? Gumawa ng account',

      maybeExisting:
        'Kung may account na sa address na ito, mag-sign in sa ibaba o humingi ng code.',
    },

    verify: {
      title: 'Tingnan ang email mo',
      sentTo: 'Nagpadala kami ng 6 na digit na code sa {{email}}. Nasa subject line din ito.',
      sendingTo: 'Nagpapadala ng 6 na digit na code sa {{email}}...',

      field: 'CODE',
      placeholder: '000000',
      submit: 'Magpatuloy',

      resend: 'Ipadala ulit',
      resendIn: 'Ipadala ulit sa loob ng {{seconds}}s',
      resent: 'Naipadala. Tingnan ulit ang email mo.',
    },

    reset: {
      askTitle: 'I-reset ang password mo',
      askSubtitle: 'Sabihin sa amin ang address sa account mo at ipapadala namin ang code.',
      send: 'I-email sa akin ang reset code',

      newTitle: 'Pumili ng bagong password',
      newSubtitle: 'Malapit na. Pumili ng maaalala mo.',
      field: 'BAGONG PASSWORD',
      confirmField: 'KUMPIRMAHIN ANG BAGONG PASSWORD',
      save: 'I-save at mag-sign in',
      done: 'Napalitan ang password. Naka-sign in ka na.',
    },

    captcha: {
      title: 'Isang mabilis na check',
      body: 'Gustong kumpirmahin ng Cloudflare na tao ka. Isang segundo lang ito.',
    },

    ended: {
      title: 'Naka-sign out',
      body: 'Tapos na ang session na ito. Mag-sign in ulit para magpatuloy.',
    },

    errors: {
      passwordShort: 'Gumamit ng hindi bababa sa 8 karakter.',
      passwordRequired: 'Ilagay ang password mo.',
      passwordMismatch: 'Hindi magkatugma ang dalawang password.',
      codeLength: 'Ang code ay 6 na digit.',

      invalid_credentials:
        'Hindi tugma ang email at password na iyon. Subukan ulit, o humingi ng code.',
      email_not_confirmed:
        'Kumpirmahin muna ang email address mo. Nagpadala na kami ng bagong code.',
      account_exists:
        'Subukang mag-sign in sa address na ito, o hilingin sa amin na mag-email ng code.',
      code_invalid: 'Mali o expired na ang code na iyon. Humingi ng bago.',
      weak_password: 'Masyadong madaling hulaan ang password na iyon. Subukan ang mas mahaba.',
      same_password: 'Iyan ang password na mayroon ka na. Pumili ng iba.',
      rate_limited: 'Maghintay sandali bago humingi ng isa pang email.',
      rate_limited_in: 'Maghintay ng {{seconds}} segundo bago humingi ng isa pang email.',
      captcha: 'Hindi namin makumpirma na tao ka. Tingnan ang koneksyon mo at subukan ulit.',
      offline: 'Walang koneksyon. Subukan ulit kapag online ka na.',
      unknown: 'May nagkamali. Subukan ulit.',
    },
  },

  onboarding: {
    setup: {
      title: 'Bago tayo magsimula',
      subtitle: 'Parehong nagbabago ang wika at sukat ng susunod na ilang screen.',
      unitsTitle: 'MGA UNIT',
      metric: 'Metric',
      imperial: 'Imperial',
      metricNote: 'Sentimetro at kilo.',
      imperialNote: 'Talampakan, pulgada at libra.',
    },

    welcome: {
      title: 'Calorie tracker na gawa para sa mga Asyano',
      subtitle: 'Nasi lemak, pho, laksa, char siu rice.',
      perks: {
        track: {
          title: 'Bilangin ang bawat calorie',
          subtitle: 'Kumuha ng litrato o maghanap sa ilang segundo',
        },
        habit: {
          title: 'Bumuo ng mas malusog na ugali',
          subtitle: 'Banayad na target, streak, walang pang-iinsulto',
        },
        local: {
          title: '50,000 ulam na Asyano',
          subtitle: 'At 3 milyong pakete, binabasa sa barcode',
        },
      },
      start: 'Magsimula',
      signIn: 'May account na ako',
    },

    about: {
      title: 'Ilang pangunahing detalye',
      height: 'TAAS',
      heightPlaceholder: '170',
      weight: 'TIMBANG',
      weightPlaceholder: '65',
      feet: 'ft',
      inches: 'in',
      feetPlaceholder: '5',
      inchesPlaceholder: '9',
      inchesLabel: 'PULGADA',
      weightPlaceholderLb: '145',
      sex: 'KASARIAN',
      female: 'Babae',
      male: 'Lalaki',
      age: 'EDAD',
      agePlaceholder: '29',
      years: 'taon',
      targetWeight: 'TARGET NA TIMBANG',
      targetWeightUnset: '—',
      targetWeightHint: 'I-slide para itakda ang timbang na tinutunton mo.',
      targetWeightLocked: 'Ilagay muna ang timbang mo.',
    },

    activity: {
      title: 'Gaano ka-aktibo ang araw mo?',
      sedentary: { title: 'Madalas nakaupo', subtitle: 'Opisina, pagmamaneho, pag-aaral' },
      light: { title: 'Bahagyang aktibo', subtitle: 'May kaunting lakad, magaan na gawaing bahay' },
      onFeet: { title: 'Palaging nakatayo', subtitle: 'Tindahan, nursing, konstruksyon' },
      veryActive: { title: 'Sobrang aktibo', subtitle: 'Nag-eensayo halos araw-araw' },
    },

    source: {
      title: 'Saan mo kami narinig?',
      subtitle: 'Nakakatulong ito para malaman namin kung saan susunod lilitaw.',
      xiaohongshu: 'XiaoHongShu',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      reddit: 'Reddit',
      facebook: 'Facebook',
      threads: 'Threads',
      appStore: 'App Store',
      googlePlay: 'Google Play',
      friend: 'Kaibigan o pamilya',
      other: 'Ibang lugar',
    },

    calculating: {
      title: 'Binubuo ang plano mo',
      subtitle: 'Kinuwenta mula sa mga sagot mo, hindi sa average.',
      steps: {
        budget: 'Target na calorie kada araw',
        macros: 'Hati ng carbs, protina at taba',
        catalogue: 'Itinutugma ang pagkain mo',
      },
    },

    target: {
      title: 'Ang badyet mo kada araw',
      perDay: 'KCAL KADA ARAW',
      carbs: 'CARBS',
      protein: 'PROTINA',
      fat: 'TABA',
      goalWeight: 'TIMBANG NA LAYUNIN',
      goalBy: 'INAASAHANG MAABOT',
      maintain: 'PANATILIHIN',
      maintainValue: 'Matatag',
      looksRight: 'Tama naman ito',
      adjust: 'Baguhin ang mga sagot ko',
    },

    health: {
      title: 'Hayaang ang relo ang magbilang',
      subtitle: 'Ang nasunog mo ay idinadagdag sa badyet ngayong araw.',
      connectApple: 'Ikonekta ang Apple Health',
      connectAndroid: 'Ikonekta ang Health Connect',
      demo: 'Gumamit ng ginawang aktibidad',
      later: 'Hindi muna ngayon',
      emptyToast: 'Walang bumalik mula sa Health. Puwede kang kumonekta ulit mula sa Aktibidad.',
      failedToast:
        'Hindi kami makakonekta sa health store mo. Puwede mong subukan ulit mula sa Aktibidad.',
      reassurance: 'Basa lang. Puwede kang kumonekta mamaya mula sa Aktibidad.',
      offline: 'Naghihintay ng koneksyon. Puwede mo itong laktawan at kumonekta mamaya.',
    },

    notifications: {
      title: 'Isang paalala sa tamang sandali',
      subtitle: 'Tatlong paalala sa pagkain, sa sarili mong oras.',
      meals: 'Mga paalala sa pagkain',
      scans: 'Nabilang na ang plato mo',
      nothingElse: 'At wala nang iba',
      promise: 'I-off ang alinman dito sa Ako, Mga paalala.',
      enable: 'I-on ang mga notification',
      later: 'Baka mamaya',
      blocked:
        'Naka-off ang mga paalala para sa RiceCal. Puwede mo itong i-on sa Ako, Mga paalala.',
    },

    tutorial: {
      appBar: 'Paano gumagana ang RiceCal',
      skip: 'Laktawan',
      next: 'Susunod',
      done: 'Magsimulang mag-log',
      offerTitle: 'Bago ka rito?',
      offerBody: 'Isang 30 segundong tour kung paano mag-log.',
      offerAction: 'Ipakita mo',

      log: {
        title: 'Apat na paraan ng pag-log',
        subtitle: 'I-tap ang berdeng button sa Ngayon, tapos pumili ng isa.',
        snap: 'Litrato',
        snapBody: 'Isang litrato ng plato',
        describe: 'Ilarawan',
        describeBody: 'I-type ang kinain mo',
        search: 'Hanapin',
        searchBody: 'Hanapin sa pangalan',
        recipes: 'Recipe',
        recipesBody: 'Isang bagay na niluto mo',
        barcode: 'May pakete? Nagba-barcode din ang camera.',
      },

      read: {
        title: 'Napupunta ito sa araw mo',
        subtitle: 'Pinapangalanan namin ang ulam, sinusukat ang bahagi at binibilang para sa iyo.',
        exampleName: 'Nasi lemak ayam',
        exampleDetail: '1 plato, 320 g',
        exampleKcal: '644',
        tip: 'Kunan mula sa itaas, kasama ang buong plato sa frame.',
      },

      fix: {
        title: 'Mali? Sabihin mo lang',
        subtitle: 'I-tap ang entry, tapos ang sparkle. Sapat na ang simpleng salita.',
        chipHalf: 'Kalahating bahagi',
        chipNoRice: 'Walang kanin',
        chipExtra: 'Dagdagan ng inumin',
        typed: 'Kalahati lang ng kanin ang kinain ko',
        beforeLabel: 'BAGO',
        before: '644',
        afterLabel: 'PAGKATAPOS',
        after: '498',
      },

      day: {
        title: 'Panoorin ang araw mong mapuno',
        subtitle: 'Ang singsing ay ang natitira. Ang mga bar ay carbs, protina at taba.',
        ringCaption: 'KCAL NA NATITIRA',
        carbs: 'Carbs',
        protein: 'Protina',
        fat: 'Taba',
        note: 'Ang galaw mula sa relo mo ay idinadagdag sa itaas, hindi kailanman binabawas.',
      },
    },

    saving: {
      title: 'Sini-save ang mga sagot mo…',
      offlineTitle: 'Naghihintay ng koneksyon',
      offlineBody: 'Ligtas ang mga sagot mo sa teleponong ito. Sasave namin ito pagkakonekta mo.',
      failedTitle: 'Hindi namin na-save ang mga sagot mo',
      failedBody: 'Walang nawala. Tingnan ang koneksyon mo at subukan ulit.',
    },

    account: {
      title: 'I-save ang progreso mo',
      subtitle:
        'Handa na ang mga sagot mo. Pinananatiling ligtas ito ng account kung magpapalit ka ng telepono.',
      signInTitle: 'Maligayang pagbabalik',
      signInSubtitle: 'Mag-sign in at itutuloy ng diary mo kung saan ito tumigil.',
      apple: 'Magpatuloy gamit ang Apple',
      google: 'Magpatuloy gamit ang Google',
      or: 'O',
      email: 'EMAIL',
      emailPlaceholder: 'you@email.com',
      errors: {
        email: 'Hindi ito mukhang email address.',
      },
    },
  },

  logging: {
    today: {
      title: 'Ngayon',
      backToTodayA11y: 'Bumalik sa ngayon',
      kcalLeft: 'KCAL NA NATITIRA',
      kcalOver: 'KCAL NA LAMPAS',
      kcalOfGoal: '/{{goal}} KCAL',
      showGoals: 'Ipakita ang badyet ng araw',
      showLeft: 'Ipakita ang natitira',
      overNote: 'Bahagyang lampas ngayon, bukas bagong bilang.',
      overNoteOn: 'Bahagyang lampas noong araw na iyon.',
      burnedNote: '+{{kcal}} mula sa paggalaw ngayong araw',
      burnedNoteOn: '+{{kcal}} mula sa paggalaw noong araw na iyon',
      logHeading: 'NAKAIN · {{kcal}} KCAL',
      analysing: 'Binabasa ang plato mo',
      analysingHint: 'Bibilangin pagkaalam kung ano ito',
      describing: 'Binabasa ang isinulat mo',
      describingRead: 'Binabasa ang isinulat mo…',
      scanningRead: 'Binabasa ang plato mo…',
      scanningMatch: 'Hinahanap ito sa catalogue…',
      scanningPortion: 'Sinusukat ang bahagi…',
      scanningCount: 'Binibilang ang calories…',
      refiningApply: 'Inilalapat ang pagwawasto mo…',
      refiningCount: 'Muling binibilang ang calories…',
      scanDoneTitle: 'Nabilang na ang plato mo',
      describeDoneTitle: 'Nabilang na ang pagkain mo',
      scanDoneBody: '{{food}} · {{kcal}} kcal',
      scanDoneBodyPlain: 'I-tap para makita kung ano ang laman.',
      deleteEntry: 'Burahin',
      noFoodTitle: 'Walang pagkain sa litratong ito',
      noFoodTypedTitle: 'Walang pagkain sa isinulat mo',
      noFoodHint: 'Walang naidagdag sa araw mo.',
      noFoodDismiss: 'I-dismiss',
      analysisFailedTitle: 'Hindi mabasa ito',
      analysisFailedHint: 'I-tap para pumili ng ulam mismo',

      noBudgetTitle: 'Wala pang badyet kada araw',
      noBudgetBody: 'Itakda ang target mo at may pupunuin na ang singsing.',
      noBudgetAction: 'Itakda ang target ko',
    },

    week: {
      a11y: {
        plain: '{{day}}',
        ahead: '{{day}}, hindi pa dumarating',
        under: '{{day}}, mas mababa sa target',
        over: '{{day}}, lampas sa target',
        missed: '{{day}}, walang naka-log',
      },
    },

    calendar: {
      showMonth: 'Ipakita ang buwan',
      showDay: 'Ipakita ang araw',
      previousMonth: 'Nakaraang buwan',
      nextMonth: 'Susunod na buwan',
      legend: {
        under: 'Mas mababa sa target',
        over: 'Lampas sa target',
        missed: 'Hindi naka-log',
      },
      dayHeading: '{{day}}',
      dayKcal: '{{kcal}} kcal',
      dayEmpty: 'Walang naka-log noong araw na iyon.',
    },

    selector: {
      title: 'Mag-log ng ulam',
      remaining: '{{count}} kcal ang natitira',
      snap: 'Litrato',
      describe: 'Ilarawan',
      search: 'Hanapin',
    },

    capture: {
      tabs: 'Ano ang tinututukan mo',
      meal: 'Pagkain',
      barcode: 'Barcode',
      scansLeft_zero: 'Wala nang natitirang scan ngayong araw. Babalik ito bukas.',
      scansLeft_one: '{{count}} scan pa ngayong araw',
      scansLeft_other: '{{count}} scan pa ngayong araw',
    },

    barcode: {
      permissionTitle: 'Payagan ang RiceCal na gamitin ang camera',
      permissionBody:
        'Binabasa ng camera ang barcode sa pakete. Walang naire-record o na-a-upload.',
      aim: 'Itutok ang camera sa barcode ng pakete.',
      noCamera: 'Walang camera ang device na ito, kaya walang mai-scan dito.',
      missTitle: 'Bagong pakete',
      unknown: 'Wala pa kami nito. Ilarawan mo na lang at kami ang bahala.',
      failedTitle: 'Walang sagot',
      failed:
        'Hindi namin maabot ang catalogue ngayon. Baka maayos naman ang pakete; ang koneksyon ang hindi.',
      tryAgain: 'Mag-scan ulit',
      describeInstead: 'Ilarawan na lang',
    },

    describe: {
      placeholder: 'Nasi lemak na may fried chicken at teh tarik',
      send: 'I-log ang pagkaing ito',
    },

    camera: {
      title: 'Kunan ang plato mo',
      analysing: 'Inaalam kung ano ang nasa plato',
      permissionTitle: 'Kailangan ng access sa camera',
      permissionBody:
        'Ginagamit ng RiceCal ang camera para basahin ang plato mo. Walang umaalis sa telepono mo.',
      permissionGrant: 'Payagan ang camera',
      shutter: 'Kumuha ng litrato',
      library: 'Pumili mula sa mga litrato',
      flip: 'Baligtarin ang camera',
      captured: 'Ang litratong kakakuha mo lang',
      photoOf: 'Litrato ng {{food}}',
    },

    added: {
      toast: 'Naidagdag, {{kcal}} kcal',
      removedToast: 'Inalis mula ngayong araw',
    },

    search: {
      title: 'Hanapin',
      placeholder: 'Maghanap ng kahit anong ulam',
      clear: 'I-clear ang paghahanap',
      place: {
        mamak: 'Mamak',
        kopitiam: 'Kopitiam',
        hawker: 'Karinderya',
        packaged: 'Nakabalot',
        home: 'Lutong bahay',
      },
      emptyTitle: 'Walang ulam na ganoon ang pangalan',
      emptyBody: 'Subukan ang mas maikling salita, o bawasan ang mga ito.',
      offlineTitle: 'Walang koneksyon',
      offlineBody: 'Nasa server ang listahan ng ulam. Tatakbo ito pagbalik mo online.',
      errorTitle: 'Hindi makahanap',
      errorBody: 'May nagkamali sa paghahanap niyan. Subukan ulit maya-maya.',
    },

    detail: {
      servings: 'Serving',
      typeServings: 'I-type ang eksaktong dami',
      total: 'KABUUANG KCAL',
      moreNutrients: 'Iba pang nutrients',
      fibre: 'Hibla',
      sugar: 'Asukal',
      sodium: 'Asin (sodium)',
      milligrams: '{{value}}mg',
      fixTitle: 'Ayusin sa pagta-type',
      fixPlaceholder: 'walang sambal, at kalahating plato lang',
      fixAction: 'Ayusin',
      fixNotApplied: 'Hindi mailapat iyan. Subukang baguhin ang pananalita',
      plateTitle: 'MGA SANGKAP',
      plateTotal: 'Kabuuan',
      plateEmptied:
        'Wala nang natira sa plato. Babalik ang entry sa pagbibilang bilang isang serving.',
      times: '× {{amount}}',
      grams: '({{grams}} g)',
      count: '(× {{amount}})',
      partKcal: '{{kcal}} kcal',
      gramsShort: '{{grams}} g',
      gramsField: 'Timbang sa gramo',
      lessOf: 'Bawasan ang {{name}}',
      moreOf: 'Dagdagan ang {{name}}',
      removeOf: 'Alisin ang {{name}}',
      editKcal: 'Calories',
      figuresTitle: 'Sarili mong mga numero',
      macrosTitle: 'Macros',
      editFigures: 'I-edit ang calories at macros',
      editPlate: 'I-edit ang mga sangkap',
      editDetails: 'I-edit ang pangalan, araw at oras',
      yourFigures: 'Sarili mong mga numero, hindi sa app.',
      nameField: 'Pangalan',
      numbersReset: 'Gamitin ang numero ng app',
      servingWord: 'serving',
      quickFix: {
        halfPortion: 'Kalahating bahagi',
        noSambal: 'Walang sambal',
        addEgg: 'Dagdagan ng itlog',
        extraRice: 'Dagdag na kanin',
      },
      editByHand: 'I-edit ang detalye nang mano-mano',
      whenValue: '{{day}} nang {{time}}',
      whenRow: 'Petsa',
      dayTitle: 'Araw',
      timeTitle: 'Oras',
      hour: 'Oras',
      minute: 'Minuto',
      am: 'ng umaga',
      pm: 'ng hapon',
      movedTo: 'Inilipat sa {{day}}',
      save: 'I-save',
      saveFailed: 'Hindi ma-save ang mga pagbabagong iyon',
      discardTitle: 'Umalis nang hindi nagse-save?',
      discardBody: 'Mawawala ang binago mo dito at mananatili ang entry gaya ng dati.',
      discardConfirm: 'Itapon',
      deleteEntry: 'Burahin ang entry na ito',
      deleteTitle: 'Burahin ang entry na ito?',
      deleteBody: 'Aalis ito agad sa ngayong araw at babalik pataas ang bilang.',
      addToDiary: 'Idagdag sa diary',
      decreaseServing: 'Bawas ng isa',
      increaseServing: 'Dagdag ng isa',
      choosePicture: 'Pumili ng larawan para sa entry na ito',
      addPicture: 'I-tap para magdagdag ng larawan',
      photoFailed: 'Hindi ma-save ang litratong iyon',
      replacePhoto: 'Palitan ang litrato ng isang larawan',
      replacePhotoTitle: 'Palitan ang litrato mo?',
      replacePhotoBody:
        'Nagtatago ang entry na ito ng litrato o larawan, hindi pareho. Mawawala nang tuluyan ang litrato mo ng totoong plato.',
      replacePhotoConfirm: 'Pumili ng larawan',
      shareEntry: 'Ibahagi ang pagkaing ito',
    },

    share: {
      loggedBy: 'Ni-log ni',
      brand: 'RiceCal',
      text: '{{food}}, {{kcal}} kcal. Ni-log gamit ang RiceCal',
      failed: 'Hindi magawa ang larawang iyon',
    },

    icon: {
      title: 'Pumili ng larawan',
      searchTab: 'Hanapin',
      cameraTab: 'Camera',
      searchLabel: 'Maghanap ng larawan',
      searchPlaceholder: 'nasi lemak, teh tarik, isda',
      noMatch: 'Walang tumutugma sa “{{query}}”.',
    },

    water: {
      title: 'Tubig',
      count: '{{filled}} / {{goal}} ml',
      addTitle: 'Magdagdag ng tubig',
      left: '{{amount}} ml pa',
      add: 'Dagdagan ng {{amount}} ml',
      customLabel: 'Ibang dami',
      customPlaceholder: '600',
      customAdd: 'Idagdag ang daming ito',
      customRemove: 'Bawasan ng daming ito',
      added: '{{amount}} ml na tubig',
      removed: '{{amount}} ml ang binawas',
      undo: 'I-undo',
      level: '{{filled}} sa {{goal}} ml ang nainom ngayong araw',
    },
  },

  progress: {
    title: 'Mga trend',

    ofDays: '{{done}} sa {{total}}',

    metric: {
      calories: 'Calories',
      water: 'Tubig',
      weight: 'Timbang',
      caloriesUnit: 'avg',
      waterUnit: 'ml',
      none: '—',
      a11y: '{{metric}}, {{value}}',
    },

    range: {
      label: 'Saklaw',
      '7d': '7A',
      '30d': '30A',
      '1y': '1T',
      span7d: 'Huling 7 araw',
      span30d: 'Huling 30 araw',
      span1y: 'Huling 12 buwan',
      week: 'Ling {{index}}',
      weekLong: 'Linggo {{index}}',
    },

    calories: {
      goalNote: 'Target {{goal}} kcal kada araw',
      goalNoteWeekly: 'Average bawat linggo, target {{goal}} kada araw',
      goalNoteMonthly: 'Average bawat buwan, target {{goal}} kada araw',
      noGoal: 'Wala pang naitakdang badyet kada araw',
      under: '{{value}} kulang',
      over: '{{value}} lampas',
      chart: 'Calories kada araw, hinati sa carbs, protina at taba',

      grams: '{{value}} g',
      shareOfIntake: '{{value}}% ng nakain',

      goalTitle: 'LABAN SA TARGET MO',
      daysUnder: 'Araw na mas mababa sa {{goal}}',
      daysLogged: 'Araw na buong naka-log',

      notableTitle: 'MGA KAPANSIN-PANSING BUWAN',
      monthAverage: '{{value}} avg',

      emptyTitle: 'Walang pagkain sa saklaw na ito',
      emptyBody: 'Mag-log ng kahit ano at mapupuno ang mga bar mula sa araw na ginawa mo iyon.',
    },

    water: {
      dayNote: 'Bawat haligi ay isang araw laban sa target mo',
      weeklyNote: 'Bawat haligi ay isang linggo, ina-average laban sa target mo',
      monthlyNote: 'Bawat haligi ay isang buwan, ina-average laban sa target mo',
      goalPill: 'target {{amount}}',
      chart: 'Tubig kada araw laban sa target na {{amount}}',

      reached: 'Naabot ang target',
      short: 'Kulang sa target',

      goalDays: 'ARAW NA TARGET',
      bestDay: 'PINAKAMAHUSAY NA ARAW',
      bestMonth: 'PINAKAMAHUSAY NA BUWAN',
      yearAverage: 'AVG NG TAON',
      total: 'KABUUAN',

      todayTitle: 'NGAYON',

      habitTitle: 'UGALI',
      daysAtLeast: 'Araw na {{amount}} pataas',
      daysLogged: 'Araw na naka-log',
      monthsAveraging: 'Buwan na nag-a-average ng {{amount}}+',
      monthsLogged: 'Buwan na naka-log',

      emptyTitle: 'Walang tubig na naka-log sa saklaw na ito',
      emptyBody: 'Mag-record ng inumin sa Ngayon at mapupuno ito.',
    },

    weight: {
      peakOn: '{{value}} {{unit}} noong {{date}}',
      peakIn: '{{value}} {{unit}} noong {{month}}',
      change: '{{value}} {{unit}}',
      chart: 'Ang timbang mo sa {{span}}',

      thisWeek: 'NGAYONG LINGGO',
      thisMonth: 'NGAYONG BUWAN',
      thisYear: 'NGAYONG TAON',
      average7: 'AVG NG 7 ARAW',
      average30: 'AVG NG 30 ARAW',
      lightest: 'PINAKAMAGAAN',
      weighIns: 'BILANG NG TIMBANG',
      monthsLogged: 'BUWAN NA NAKA-LOG',

      toGoal: '{{value}} {{unit}} pa sa target mong {{target}} {{unit}}',
      noTarget: 'Walang naitakdang target na timbang',
      atGoal: 'Nasa target mong timbang',
      weeksAway: '~{{count}} linggo',

      recentTitle: 'MGA HULING TIMBANG',
      add: 'Idagdag',
      weekByWeek: 'LINGGO KADA LINGGO',
      byQuarter: 'KADA QUARTER',
      quarter: '{{from}} hanggang {{to}}',

      reading: '{{value}} {{unit}}',
      readingToday: 'Ngayon',
      firstReading: 'Una',

      sheetTitle: 'Magdagdag ng timbang',
      sheetEditTitle: 'Pagtimbang noong {{date}}',
      thisMorning: 'Ngayong umaga',
      down: '{{value}} {{unit}} na mas magaan kaysa {{day}}',
      up: '{{value}} {{unit}} na mas mabigat kaysa {{day}}',
      same: 'Pareho ng {{day}}',
      save: 'I-save ang pagtimbang',
      saved: 'Na-save ang pagtimbang',
      remove: 'Alisin ang basang ito',
      removeTitle: 'Alisin ang basang ito?',
      removeBody:
        'Mawawala sa chart ang araw na ito. Kung ito ang pinakahuli, babalik ang badyet mo sa nauna.',

      emptyTitle: 'Walang pagtimbang sa saklaw na ito',
      emptyBody: 'Isang basa ay isang tuldok. Dalawa ang gumuguhit ng linya.',
    },
  },

  profile: {
    home: {
      title: 'Ako',
      memberSince: 'Miyembro mula {{month}}',
      streak: 'STREAK',
      goal: 'TARGET',
      pro: 'RiceCal Pro',
      proTrial: 'Magtatapos ang trial {{when}}',
      proTrialTomorrow: 'bukas',
      proTrialOn: 'sa {{date}}',
      noName: 'Ang account mo',
      signOutTitle: 'Mag-sign out?',
      signOutBody: 'Ligtas ang log mo. Mag-sign in ulit sa kahit anong telepono para ituloy ito.',
      proTrialIn_one: 'sa loob ng {{count}} araw',
      proTrialIn_other: 'sa loob ng {{count}} araw',
      proActive: 'Planong {{plan}}, aktibo',
      proActivePlain: 'Pro, aktibo',
      proNone: 'Libreng plano',
      metric: 'Metric',
      imperial: 'Imperial',
      settings: 'MGA SETTING',
      personalisation: 'Personalisasyon',
      goals: 'Mga target at layunin',
      goalsValue: '{{kcal}} kcal',
      reminders: 'Mga paalala',
      remindersValue: '{{count}} naka-on',
      healthOff: 'Hindi nakakonekta',
      units: 'Wika at unit',
      tutorial: 'Paano gumagana ang RiceCal',
      help: 'Help centre',
      rate: 'I-rate ang RiceCal',
      signOut: 'Mag-sign out',
    },

    rate: {
      title: 'Nagugustuhan mo ba ang RiceCal?',
      body: 'Ang sagot mo ang magpapasya kung ano ang susunod naming gagawin.',
      yes: 'Gusto ko',
      no: 'Hindi masyado',
      later: 'Mamaya na lang',
      feedbackTitle: 'Ano ang dapat ayusin?',
      feedbackBody: 'Sabihin mo sa amin sa Discord. Karamihan sa laman ng app ay nagsimula doon.',
      feedbackOpen: 'Buksan ang Discord',
      feedbackSkip: 'Huwag na',
    },

    help: {
      title: 'Halika at makipag-usap sa amin',
      body: 'Sa Discord server namin kami sumasagot ng tanong at nagpapasya kung ano ang susunod na gagawin.',
      logo: 'Discord',
      bug: 'Mag-report ng sira',
      idea: 'Magmungkahi ng feature',
      ask: 'Tanungin kami ng kahit ano tungkol sa RiceCal',
      action: 'Buksan ang Discord',
      failed: 'Hindi namin mabuksan ang Discord',
    },

    shareEarn: {
      row: 'Mag-share at kumita ng Pro',
      title: 'Mag-share at kumita ng Pro',
      heroTitle: 'Mag-post sa RiceCal, libreng Pro',
      heroBody:
        'Ipakita sa mga tao ang platong ni-log mo. Habang dumarami ang like ng post mo, humahaba ang Pro na ipapadala namin.',

      platforms: 'I-POST DITO',

      rewards: 'ANO ANG HALAGA NITO',
      postReward: '1 buwang Pro',
      postBadge: '30+ na like',
      postBody: 'Kahit anong pampublikong post tungkol sa app, sa alinman sa mga ito.',
      likedReward: '1 taong Pro',
      likedBadge: '100+ na like',
      likedBody: 'Nahanap ng post mo ang mga taong para dito.',
      viralReward: 'Pro habambuhay',
      viralBadge: '500+ na like',
      viralBody: 'Naging viral ka. Sa iyo na ito, walang renewal, walang kakanselahin.',

      how: 'PAANO ITO GUMAGANA',
      step1:
        'Mag-post tungkol sa RiceCal kahit saang pampubliko. Screenshot ng diary mo, o isang platong ni-scan mo, ang pinakaepektibo.',
      step2: 'Bigyan ito ng ilang araw para makaipon ng like.',
      step3: 'Dalhin ang link sa Discord namin at padadalhan ka namin ng Pro code.',

      claim: 'NAKAPAG-POST NA?',
      claimBody:
        'I-drop ang link sa Discord namin at titingnan namin ito at ipapadala ang code mo.',
      claimAction: 'Buksan ang Discord',

      finePrint:
        'Isang reward kada tao. Tinitingnan namin kung pampubliko ang post at binibilang ang mga like kapag nag-claim ka, kaya bigyan mo muna ito ng panahon.',
      openFailed: 'Hindi namin mabuksan ang app na iyon',
    },

    goals: {
      title: 'Mga target at layunin',
      dailyCalories: 'CALORIES KADA ARAW',
      recommended: 'INIREREKOMENDA {{value}}',
      macroTargets: 'MGA TARGET NA MACRO',
      macroValue: '{{grams}} g · {{percent}}%',
      goal: 'TARGET',
      currentWeight: 'Kasalukuyang timbang',
      targetWeight: 'Target na timbang',
      weeklyPace: 'Bilis kada linggo',
      paceLosing: 'Bumababa ng {{value}} {{unit}}',
      paceGaining: 'Tumataas ng {{value}} {{unit}}',
      paceHolding: 'Nananatiling matatag',
      other: 'IBA PA',
      waterGoal: 'Target na tubig',
      saved: 'Na-save ang mga layunin',
    },

    personalisation: {
      title: 'Personalisasyon',
      mealsTitle: 'ORAS NG PAGKAIN',
      mealsNote: 'Ito ang oras na tumutunog ang mga paalala mo.',
      editMeal: 'Baguhin kung kailan ang {{meal}}',
      hour: 'Oras',
      minute: 'Minuto',
      preview: 'Magpapaalala nang {{time}}',
    },

    reminders: {
      title: 'Mga paalala',
      meals: 'PAGKAIN',
      mealAt: '{{meal}} · {{time}}',
      habits: 'MGA UGALI',
      water: 'Tubig kada 2 oras',
      weighIn: 'Magtimbang tuwing Lunes',
      weeklyReport: 'Ulat bawat linggo',
      monthlyReport: 'Ulat bawat buwan',
      denied: 'Kailangan ng notification permission ang mga paalala.',
      blockedTitle: 'Naka-off ang mga notification',
      blockedBody: 'I-on ito sa Settings at gagana ang mga switch na ito.',
      openSettings: 'Buksan ang Settings',
      push: {
        mealTitle: 'Oras na para sa {{meal}}',
        mealBody: 'I-log habang naaalala mo. Sampung segundo lang ito.',
        waterTitle: 'Check ng tubig',
        waterBody: 'Gaano na karaming tubig ngayong araw?',
        weighInTitle: 'Pagtimbang sa umaga',
        weighInBody: 'Ang pinakaunang oras ang nagbibigay ng pinakatatag na basa.',
        weeklyTitle: 'Ang linggo mo sa pagkain',
        weeklyBody: 'Pitong araw ng pag-log, sa isang screen.',
        monthlyTitle: 'Ang buwan mo sa pagkain',
        monthlyBody: 'Apat na linggo, at ang naging resulta.',
      },
    },

    preferences: {
      title: 'Wika at unit',
      language: 'WIKA',
      languageLabel: 'Wika ng app',
      units: 'MGA UNIT',
      weight: 'Timbang',
      kg: 'kg',
      lb: 'lb',
      energy: 'Enerhiya',
      kcal: 'kcal',
      kj: 'kJ',
      appearance: 'ITSURA',
      light: 'Maliwanag',
      dark: 'Madilim',
      auto: 'Awto',
    },

    subscription: {
      title: 'Subscription',
      pro: 'RiceCal Pro',
      trialLeft_one: 'Libreng trial, {{count}} araw na natitira',
      trialLeft_other: 'Libreng trial, {{count}} araw na natitira',
      renews: 'Magre-renew sa {{price}}.',
      neverRenews: 'Bayad nang isang beses. Walang nagre-renew.',
      freeBody: '{{scans}} scan kada araw, {{recipes}} recipe, at ang trend ng nakaraang linggo.',
      whatYouGet: 'ANO ANG MAKUKUHA MO SA PRO',
      included: 'KASAMA',
      cancel: 'Kanselahin ang subscription',
      cancelTitle: 'Kanselahin ang subscription mo?',
      cancelBody:
        'Mananatili kang Pro hanggang matapos ang panahon. Mababasa pa rin ang log mo alinman ang mangyari.',
      cancelConfirm: 'Kanselahin ang plano',
      switchMonthly: 'Lumipat sa buwanan',
      switchYearly: 'Lumipat sa taunan',
      manage: 'Pamahalaan sa store',
      switched: 'Na-update ang plano',
    },
  },

  paywall: {
    couldNotCheck: 'Hindi namin ma-check ang subscription mo. Subukan ulit maya-maya.',

    plans: {
      yearly: 'Taunan',
      perMonth: '{{price}} kada buwan',
      yearlyBadge: 'MAKAKATIPID NG {{percent}}%',
      yearlyBilling: 'Sinisingil bawat taon',
      monthly: 'Buwanan',
      monthlyBilling: 'Sinisingil bawat buwan',
      lifetime: 'Habambuhay',
      lifetimeDetail: 'Isang bayad, sa iyo habambuhay',
    },

    hard: {
      appBar: 'RiceCal Pro',
      title: 'Walang limitasyon sa RiceCal Pro',
      assurance: 'Walang commitment, kanselahin anumang oras',
      assuranceLifetime: 'Isang bayad, maibabalik sa pamamagitan ng store',
      smallPrintYearly: 'Libre nang 7 araw, tapos {{price}} kada taon.',
      smallPrintMonthly: 'Libre nang 7 araw, tapos {{price}} kada buwan.',
      smallPrintLifetime: 'Isang bayad na {{price}}. Walang subscription, walang renewal.',
      smallPrintPending: 'Libre nang 7 araw.',
      start: 'Simulan ang libreng trial',
      startLifetime: 'Bilhin ang habambuhay na access',
      restore: 'Ibalik ang binili',
      nothingToRestore: 'Walang maibabalik sa account na ito',
      notConfigured: 'Hindi pa naka-set up ang pagbili sa build na ito.',
      restored: 'Nakabalik na ang binili mo',
    },

    table: {
      title: 'LIBRE VS PRO',
      free: 'Libre',
      pro: 'Pro',
      rows: {
        snap: {
          label: 'Kunan ang plato',
          free: '{{scans}}/araw',
          pro: 'Walang limitasyon',
        },
        describe: {
          label: 'Sabihin ang kinain mo, sa salita',
          free: '',
          pro: '',
        },
        barcode: {
          label: 'Mag-scan ng pakete',
          free: '',
          pro: '',
        },
        search: {
          label: 'Maghanap sa food database',
          free: '',
          pro: '',
        },
        fix: {
          label: 'Ayusin ang pagkain sa paglalarawan',
          free: '',
          pro: '',
        },
        suggest: {
          label: 'Magtanong kung ano ang susunod na kakainin',
          free: '',
          pro: '',
        },
        recipes: {
          label: 'I-save ang niluluto mo',
          free: '{{recipes}} recipe',
          pro: 'Walang limitasyon',
        },
        recipeFill: {
          label: 'Punan ang recipe mula sa litrato',
          free: '',
          pro: '',
        },
        budget: {
          label: 'Badyet ng calorie na bagay sa iyo',
          free: '',
          pro: '',
        },
        health: {
          label: 'Apple Health at Health Connect',
          free: '',
          pro: '',
        },
        reminders: {
          label: 'Mga paalala sa pagkain',
          free: '',
          pro: '',
        },
        trends: {
          label: 'Mga trend',
          free: '7 araw',
          pro: 'Hanggang isang taon',
        },
        reviews: {
          label: 'Review bawat linggo at buwan',
          free: 'Pinakahuling linggo',
          pro: 'Lahat',
        },
        photos: {
          label: 'Mga litrato ng pagkain mo',
          free: '{{days}} araw',
          pro: 'Walang limitasyon',
        },
      },
    },

    intro: {
      title: 'Handa ka na. Magsimula nang mag-log?',
      body: 'Gumagana ang lahat kahit wala ito. Inaalis lang ng Pro ang mga limitasyon.',
      later: 'Baka mamaya',
    },

    reminder: {
      title_one: '{{count}} araw na lang sa trial mo',
      title_other: '{{count}} araw na lang sa trial mo',
      body: 'Nakapag-log ka na ng {{days}} araw na sunod-sunod at bumaba ng {{kg}} kg. Ituloy mo lang.',
      daysLogged: 'ARAW NA NAKA-LOG',
      meals: 'PAGKAIN',
      kgDown: 'KG NA BUMABA',
      starts: 'Magsisimula ang plano mo sa {{date}} sa halagang {{price}} kada taon.',
      keep: 'Panatilihin ang plano ko',
      manage: 'Pamahalaan ang subscription',
    },

    ended: {
      heading: 'Ngayon',
      previewMode: 'Preview mode',
      title: 'Tapos na ang trial mo',
      body: 'Ligtas at nababasa pa rin ang {{days}} araw ng kasaysayan mo.',
      dataWaiting: 'NAGHIHINTAY ANG DATA MO',
      days: 'ARAW',
      meals: 'PAGKAIN',
      kgDown: 'KG NA BUMABA',
      lockedEntry: 'Naka-lock',
      resume: 'Magpatuloy sa Pro',
      browse: 'Magpatuloy nang libre',
    },

    limit: {
      freeReached:
        'Iyan ang {{count}} scan mo ngayong araw. Nagsa-scan ang Pro nang walang limitasyon.',
      proReached: 'Naabot mo na ang limitasyon sa pag-scan ngayong araw. Makipag-ugnayan sa admin.',
      notEntitledDetail: 'Hindi aktibo ang subscription mo.',
      confirming: 'Pinoproseso ang binili mo. Sandali lang at subukan ulit.',
      feature: {
        camera: 'Kailangan ng RiceCal Pro para mag-scan ng isa pang plato ngayong araw.',
        describe: 'Kailangan ng RiceCal Pro para sabihin ang kinain mo sa salita.',
        refine: 'Kailangan ng RiceCal Pro para ayusin ang pagkain sa paglalarawan.',
        read_recipe: 'Kailangan ng RiceCal Pro para punan ang recipe mula sa litrato.',
        new_recipe: 'Kailangan ng RiceCal Pro para magtago ng higit sa {{recipes}} recipe.',
        suggest: 'Kailangan ng RiceCal Pro para magtanong kung ano ang susunod na kakainin.',
        trend_range: 'Kailangan ng RiceCal Pro para tumingin nang lampas sa isang linggo.',
        review: 'Kailangan ng RiceCal Pro para magbasa ng mas lumang review.',
        nudge: 'Inaalis ng RiceCal Pro ang mga limitasyon.',
      },
    },

    checking: 'Sandali lang, chine-check namin ang plano mo.',

    welcome: {
      title: 'Nakapasok ka na. Kain na tayo.',
      body: 'Nagsisimula na ngayon ang 7 libreng araw mo. Bukas ang lahat.',
      bodyActive: 'Bukas ang lahat.',
      bodyLifetime: 'Sa iyo na habambuhay ang RiceCal Pro. Bukas ang lahat.',
      perks: {
        log: 'Kunan, i-scan o sabihin',
        database: 'Bawat ulam at pakete',
        suggest: 'Magtanong kung ano ang kakainin',
      },
      manageNote: 'Pamahalaan o kanselahin anumang oras sa Profile, Subscription.',
      manageNoteLifetime: 'Bayad nang isang beses. Walang ire-renew o kakanselahin.',
      start: 'Pumunta sa diary ko',
    },
  },

  recipes: {
    shelf: {
      mine: 'Akin',
      official: 'Opisyal',
      community: 'Komunidad',
    },

    heading: {
      mine: 'Recipe ko',
      official: 'Kusina ng RiceCal',
      community: 'Mula sa komunidad',
    },

    search: {
      official: 'Maghanap ng opisyal na recipe',
      community: 'Maghanap ng pampublikong recipe',
      mine: 'Maghanap sa mga recipe ko',
      clear: 'I-clear ang paghahanap',
      none: 'Walang ganoong pangalan',
      noneBody: 'Subukan ang mas maikling salita, o bahagi ng pangalan ng ulam.',
    },

    empty: {
      mineTitle: 'Wala pang recipe',
      mineBody:
        'Walang nakatakdang serving ang isang kaldero. Ilagay kung ano ang inilagay at para sa ilan ito, isang beses lang, at isang tap na lang ang pag-log mula noon.',
      officialTitle: 'Walang laman ang kusina',
      officialBody: 'Lilitaw dito ang mga recipe mula sa amin.',
      communityTitle: 'Wala pang ibinabahagi',
      communityBody: 'Lilitaw dito ang mga recipe na ginawang pampubliko.',
    },

    servings_one: '{{count}} serving',
    servings_other: '{{count}} serving',
    ingredients_one: '{{count}} sangkap',
    ingredients_other: '{{count}} sangkap',
    savedTimes_one: 'na-save {{count}} beses',
    savedTimes_other: 'na-save {{count}} beses',
    byAuthor: '{{name}} · {{saves}}',
    fromAuthor: 'Mula kay {{name}}',
    someCook: 'May isang tao',

    new: {
      title: 'Bagong recipe',
      scanLabel: 'Litrato',
      describeLabel: 'Ilarawan',
      scanTitle: 'Punan mula sa litrato',
      or: 'O PUNAN ITO MISMO',
      describeTitle: 'Ilarawan ito',
      describePlaceholder:
        'Kari ayam. 600g na hita ng manok, isang lata ng gata, 3 patatas. Para sa 4.',
      describeHint: 'Ang dami at kung para sa ilan ito ang dalawang sulit i-type.',
      describeAction: 'Punan ang form',
      describeFailed: 'Hindi namin mabasa iyon. Punan mo na lang sa ibaba.',
      scanFailed: 'Hindi namin mabasa iyon. Punan mo na lang sa ibaba.',

      readingPhoto: 'Binabasa ang litrato mo…',
      readingText: 'Binabasa ang isinulat mo…',
      readingIngredients: 'Inaalam kung ano ang inilagay…',
      readingPortions: 'Sinusukat ang mga bahagi…',
      readingSteps: 'Isinusulat ang mga hakbang…',
      readingHint: 'Sandali lang. Mababago mo ang kahit ano pagkatapos.',
    },

    edit: {
      title: 'I-edit ang recipe',
      name: 'PANGALAN',
      namePlaceholder: 'Ano ang tawag mo dito?',
      picture: 'LARAWAN',
      changePicture: 'Palitan ang larawan',
      replacePhotoTitle: 'Gumamit na lang ng drawing?',
      replacePhotoBody: 'Aalisin ang litrato ng recipe na ito.',
      replacePhotoConfirm: 'Gamitin ang drawing',
      servings: 'ILANG SERVING',
      ingredients: 'MGA SANGKAP',
      ingredientsCount: 'MGA SANGKAP · {{count}}',
      ingredientsEmpty: 'Wala pa. Hanapin ang bawat item at kami ang magtotototal ng kaldero.',
      addIngredient: 'Magdagdag ng sangkap',
      steps: 'PAANO MO ITO NILULUTO',
      stepsPlaceholder:
        'Isang hakbang kada linya. Magsimula ng bagong linya at kami ang magbibilang.',
      stepsHint: 'Bawat bagong linya ang nagiging susunod na numeradong hakbang.',
      stepsSheetTitle: 'Paano mo ito niluluto',
      stepsEditAction: 'I-edit ang mga hakbang',
      stepsEdit_one: 'I-edit ang mga hakbang, {{count}} hakbang',
      stepsEdit_other: 'I-edit ang mga hakbang, {{count}} hakbang',
      stepsWrite: 'Isulat kung paano mo ito niluluto',
      save: 'I-save ang recipe',
      saved: 'Na-save ang recipe',
      nameRequired: 'Pangalanan mo muna ito',
      saveFailed: 'Hindi ma-save iyon. Subukan ulit.',
      limitReached: 'Nagtatago ang libreng account ng {{count}} recipe. Walang limitasyon ang Pro.',
      totalLabel: 'Kada serving, {{count}}',
      totalWhole: 'Buong kaldero {{kcal}} kcal',
      discardTitle: 'Umalis nang hindi nagse-save?',
      discardBody: 'Mawawala ang mga pagbabagong ginawa mo dito.',
      discardConfirm: 'Itapon',
    },

    ingredient: {
      title: 'Magdagdag ng sangkap',
      search: 'Maghanap ng sangkap',
      ownTitle: 'Magdagdag ng sarili mong sangkap',
      ownBody: 'Wala sa listahan? Pangalanan ito at ilagay ang calories.',
      customBody:
        'Para sa mga bagay na nasa kusina mo lang. Basahin sa pakete o timbangin ito minsan.',
      name: 'PANGALAN',
      namePlaceholder: 'Ano ito?',
      calories: 'CALORIES',
      macros: 'MACROS, KUNG ALAM MO',
      amount: 'GAANO KARAMI ANG INILAGAY',
      add: 'Ilagay sa kaldero',
      remove: 'Alisin',
      change: 'Baguhin kung gaano karaming {{name}}, kasalukuyang {{measure}}',
      unit: {
        g: 'g',
        ml: 'ml',
        piece_one: 'piraso',
        piece_other: 'piraso',
      },
    },

    detail: {
      servingLabel_one: 'serving',
      servingLabel_other: 'serving',
      portion: {
        half: 'Kalahati',
        one: '1 serving',
        two: '2 serving',
        pot: 'Buong kaldero',
      },
      ofServings: '{{count}} SA {{total}} SERVING',
      steps: 'PAANO KO ITO NILULUTO',
      stepsFrom: 'PAANO ITO NILULUTO NI {{name}}',
      noSteps: 'Walang naisulat na hakbang.',
      ingredients: 'MGA SANGKAP',
      addToDay: 'Idagdag sa ngayong araw',
      added: 'Naidagdag sa araw mo',
      saveCopy: 'I-save sa mga recipe ko',
      savedCopy: 'Na-save sa mga recipe mo',
      saveCopyFailed: 'Hindi ma-save iyon. Subukan ulit.',
      goneTitle: 'Hindi mahanap ang recipe',
      goneBody:
        'Baka nabura na ito, o ginawang pribado ulit. Humingi ng bagong link sa nagbahagi nito.',
      official: 'Mula sa kusina ng RiceCal',
      delete: 'Burahin ang recipe',
      deleteTitle: 'Burahin ang recipe na ito?',
      deleteBody: 'Mananatili sa diary mo ang mga pagkaing ni-log mo na mula rito.',
      deleted: 'Nabura ang recipe',
    },

    share: {
      action: 'Ibahagi',
      title: 'Ibahagi ang recipe na ito',
      body: 'Makikita ng sinumang may link ang mga sangkap, hakbang at calories, at makakapag-save ng sarili nilang kopya. Sa iyo pa rin ang sa iyo.',
      publicTitle: 'Gawin itong pampubliko',
      publicBody: 'Sasali ito sa community tab para mahanap at ma-save ninuman.',
      publishFailed: 'Hindi mapalitan iyon. Subukan ulit.',
    },

    review: {
      checking: 'Sinusuri ang recipe mo…',
      approved: 'Nasa komunidad na ang recipe mo',
      rejected: 'Hindi na-publish: {{reason}}',
      rejectedPlain: 'Hindi namin ma-publish ito.',
      pending: 'Tinitingnan pa namin ito. Lilitaw ito kapag pumasa na.',
      badgePending: 'Sinusuri',
      badgeRejected: 'Hindi na-publish',
      badgePublic: 'Pampubliko',
    },

    log: {
      action: 'Recipe',
      empty: {
        mine: 'Wala pang recipe. Magdagdag ng isa at isang tap na lang ang pag-log.',
        official: 'Wala pang laman ang kusina.',
        community: 'Wala pang ibinabahagi. Lilitaw dito ang mga recipe na ginawang pampubliko.',
      },
    },
  },

  reviews: {
    title: 'Mga review',

    entry: {
      title: 'Mga review',
      subtitle: 'Balikan ang isang linggo o isang buwan',
    },

    kind: {
      week: 'Lingguhan',
      month: 'Buwanan',
      label: 'Haba ng review',
    },

    list: {
      weekMeta: 'Linggo {{index}}',
      weekSummary: '{{kcal}} kcal kada araw, {{done}} sa {{total}} ang naka-log',
      monthMeta: '{{weeks}} linggo, {{done}} sa {{total}} araw ang naka-log',
      monthSummary: '{{kcal}} kcal kada araw',
      monthSummaryWeight: '{{kcal}} kcal kada araw, {{weight}}',
      summaryEmpty: 'Walang naka-log',
      a11y: '{{title}}, {{meta}}, {{summary}}',
      a11yLocked: '{{title}}, {{meta}}, {{summary}}, Pro',

      emptyWeekTitle: 'Wala pang linggong mababalikan',
      emptyWeekBody:
        'Lilitaw dito ang isang linggo kapag natapos na ito at ni-log mo ang hindi bababa sa apat na araw nito.',
      emptyMonthTitle: 'Wala pang buwang mababalikan',
      emptyMonthBody:
        'Lilitaw dito ang isang buwan kapag natapos na ito at ni-log mo ang hindi bababa sa labindalawang araw nito.',
    },

    share: {
      card: 'Ibahagi ang {{card}}',
      preview: 'Ang card gaya ng ipapadala ito',
    },

    story: {
      close: 'Isara',
      share: 'Ibahagi',
      missingTitle: 'Wala rito ang review na iyon',
      missingBody: 'Baka isa itong linggong masyadong kaunti ang laman para balikan.',
    },

    card: {
      brand: 'RiceCal',
      kcalADay: 'kcal kada araw',
      under: '{{value}} sa ilalim ng target',
      over: '{{value}} lampas sa target',
      onBudget: 'Nasa badyet',
      logged: 'NAKA-LOG',
      loggedValue: '{{done}} sa {{total}}',
      streak: 'STREAK',
      streakValue_one: '{{count}} araw',
      streakValue_other: '{{count}} araw',
      weightChange: 'TIMBANG',
      noWeight: '—',
      shareText:
        '{{period}}: {{kcal}} kcal kada araw, {{done}} sa {{total}} araw ang naka-log. RiceCal',
    },

    food: {
      title: 'ANG PINAKAMALALAKING PLATO',
      macros: 'MACROS KADA ARAW',
      grams: '{{value}} g',
      share: '{{value}}% ng enerhiya',
    },

    calories: {
      average: 'AVERAGE KADA ARAW',
      kcal: 'kcal',
      under: '{{value}} kulang',
      over: '{{value}} lampas',
      goalNote: 'Target {{goal}}. Nasa ilalim nito sa {{done}} sa {{total}} araw.',
      noGoal: 'Walang badyet kada araw na umiiral noon.',
      everyDay: 'ARAW-ARAW',
      everyWeek: 'LINGGO-LINGGO',
      chart: 'Calories kada araw, hinati sa carbs, protina at taba',
      lightest: '{{day}}, PINAKAMAGAAN',
      heaviest: '{{day}}, PINAKAMABIGAT',
      pastWeeks: 'HULING LIMANG LINGGO',
      pastMonths: 'HULING LIMANG BUWAN',
      noData: '—',
    },

    body: {
      weight: 'TIMBANG',
      weighIns_one: 'Isang pagtimbang',
      weighIns_other: '{{count}} pagtimbang',
      weightChart: 'Timbang sa buong panahon',
      steps: 'HAKBANG KADA ARAW',
      stepGoal: '{{done}} sa {{total}} araw na lampas sa {{goal}} hakbang',
      stepsChart: 'Hakbang kada araw',
      others: 'IBA PA',
      water: 'Tubig',
      waterValue: '{{amount}} kada araw',
      waterNote_one: 'Puno sa isang araw',
      waterNote_other: 'Puno sa {{count}} araw',
      move: 'Aktibong minuto',
      moveNote_one: 'Isang workout',
      moveNote_other: '{{count}} workout',
      moveNoteNone: 'Walang naitalang workout',
      burn: 'Nasunog kada araw',
      burnValue: '{{value}} kcal',
      distanceValue: '{{value}} km ang nalakbay',
    },
  },

  suggest: {
    card: {
      title: 'Hindi sigurado kung ano ang kakainin?',
    },

    ask: {
      title: 'Ano ang hinahanap mo?',
      meal: 'PAGKAIN',
      focus: 'MACROS',
      cuisine: 'LUTUIN',
      limit: 'LIMITASYON NG CALORIE',
      editCuisines: 'I-edit ang mga lutuin',
      addCuisine: 'Magdagdag ng lutuin',
      addCuisinePlaceholder: 'Thai, Nyonya, Hapon',
      removeCuisine: 'Alisin ang {{cuisine}}',
      kcal: 'kcal',
      less: 'Bawasan ang calories',
      more: 'Dagdagan ang calories',
      leftToday: '{{kcal}} ang natitira',
      healthy: 'Mas magaan',
      anything: 'Kahit ano',
      healthyA11y: 'Kumiling sa mas magagaang ulam',
      action: 'Magmungkahi ng kahit ano',
    },

    picks: {
      title: 'Mga ideya para sa {{meal}}',
      thinking: 'Naghahanap ng kahit ano para sa {{meal}}',
      thinkingA11y: 'Iniisip kung ano ang imumungkahi',
      summary: '{{focus}}, {{cuisine}}, mas mababa sa {{kcal}} kcal',
      protein: '{{grams}}g na protina',
      retry: 'Subukan ulit',
      emptyTitle: 'Walang naisip',
      emptyBody: 'Magtanong ulit, o luwagan ang isa sa mga sagot.',
    },

    detail: {
      unit: 'KCAL, {{portion}}',
      leftAfter: '{{kcal}} kcal ang matitira pagkatapos',
      overAfter: '{{kcal}} kcal ang lalampas pagkatapos',
      why: 'BAKIT ITO BAGAY',
      protein: 'Protina',
      carbs: 'Carbs',
      fat: 'Taba',
      sodium: 'Sodium',
    },

    meal: {
      breakfast: 'Almusal',
      lunch: 'Tanghalian',
      dinner: 'Hapunan',
      snack: 'Meryenda',
    },
    mealFor: {
      breakfast: 'almusal',
      lunch: 'tanghalian',
      dinner: 'hapunan',
      snack: 'meryenda',
    },
    focus: {
      protein: 'Protina',
      balanced: 'Balanse',
      carbs: 'Carbs',
    },
    focusShort: {
      protein: 'Mataas sa protina',
      balanced: 'Balanse',
      carbs: 'Mataas sa carbs',
    },

    sodium: {
      low: 'mababa',
      medium: 'katamtaman',
      high: 'mataas',
    },

    ready_one: 'Handa na ang {{count}} ideya',
    ready_other: 'Handa na ang {{count}} ideya',
    readyAction: 'Tingnan',

    failed: 'Hindi makakuha ng anumang mungkahi. Subukan ulit maya-maya.',
  },
} satisfies Bundle
