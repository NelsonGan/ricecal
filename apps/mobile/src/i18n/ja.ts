import type { Bundle } from './bundle'

/**
 * 日本語.
 *
 * Read `en/` before changing anything here. The comments there are the brief.
 */
export const ja = {
  common: {
    action: {
      continue: '続ける',
      back: '戻る',
      cancel: 'キャンセル',
      save: '変更を保存',
      done: '完了',
      edit: '編集',
      delete: '削除',
      add: '追加',
      undo: '元に戻す',
      skip: 'スキップ',
      retry: 'もう一度試す',
      close: '閉じる',
    },

    nav: {
      today: '今日',
      recipes: 'レシピ',
      activity: '活動',
      trends: 'トレンド',
      me: '自分',
      log: '食事を記録',
    },

    date: {
      today: '今日',
      yesterday: '昨日',
    },

    meal: {
      breakfast: '朝食',
      lunch: '昼食',
      dinner: '夕食',
      snack: '間食',
    },

    macro: {
      carbs: '炭水化物',
      protein: 'たんぱく質',
      fat: '脂質',
    },

    unit: {
      kcal: 'kcal',
      kcalUpper: 'KCAL',
      grams: '{{value}}g',
      gramsOfGoal: '{{value}}/{{goal}}g',
      kg: 'kg',
      lb: 'lb',
      cm: 'cm',
      gramsLong: '{{value}} グラム',
    },

    volume: {
      ml: '{{value}} ml',
      l: '{{value}} L',
      mlUnit: 'ml',
      lUnit: 'L',
    },

    count: {
      dayStreak_one: '{{count}} 日連続',
      dayStreak_other: '{{count}} 日連続',
      times_one: '{{count}} 回',
      times_other: '{{count}} 回',
    },

    notFound: {
      title: 'この画面は移動しました',
      body: '開いたリンクは、このバージョンのアプリではどこにもつながっていません。',
      action: '今日へ移動',
    },

    offline: {
      title: '接続を待っています',
      body: 'これはまだ端末に保存されていません。オンラインになり次第、読み込まれます。',
      dayTitle: 'この日は端末にありません',
      dayBody: '一度開いたことのある日を選ぶか、オンラインのときにまた見てください。',
    },

    a11y: {
      back: '戻る',
      close: '閉じる',
      more: 'その他の操作',
      decrease: '減らす',
      increase: '増やす',
      step: '{{total}} 中 {{current}} ステップ目',
      backspace: '最後の桁を削除',
      decimalPoint: '小数点',
    },
  },

  activity: {
    title: '活動',

    connect: {
      title: '数えるのは時計にまかせる',
      body: '端末のヘルスアプリをつなぐと、散歩もランニングもバドミントンも、今日の枠に足し戻されます。',

      readTitle: '読み取る内容',
      energy: 'アクティブエネルギー',
      energyBody: '動いて消費した分',
      steps: '歩数と距離',
      stepsBody: '目標ではなく、毎日の習慣として',
      workouts: 'ワークアウト',
      workoutsBody: '種目、時間、ペース、心拍数',

      privacy:
        '読み取り専用です。こちらから書き戻すことは一切なく、健康データはあなた自身のアカウントにのみ保存されます。',

      apple: 'Apple ヘルスケア',
      appleBody: 'iPhone と Apple Watch',
      connectHealth: 'Health Connect',
      connectHealthBody: 'Samsung Health、Fitbit、Garmin',
      heart: '心拍数',
      demo: 'デモデータを使う',
      demoBody: 'この端末で生成、開発用',

      connecting: '履歴を読み込んでいます…',
      progress: '{{total}} 件中 {{done}} 件',

      emptyTitle: '何も返ってきませんでした',
      emptyBody:
        '活動を何も読み取れませんでした。ヘルスケアのプライバシー設定で RiceCal をオフにしている場合は、オンに戻してからもう一度お試しください。',
      retry: 'もう一度試す',

      unavailableTitle: 'ここには健康データがありません',
      simulator:
        'この端末には読み取れるヘルスケアのデータがありません。シミュレータでは、生成されたデータがこれらの画面を埋めます。',
      notInstalled:
        'この端末では Health Connect が未設定です。Play ストアからインストールし、動きを記録するアプリをオンにしてから戻ってきてください。',
      notLinked:
        'このビルドにはヘルスモジュールが含まれていません。インストール後に dev client をビルドし直してください。',
      wrongPlatform: 'この端末には RiceCal が読める健康データの保存先がありません。',
      openStore: 'Play ストアを開く',
      checkAgain: 'もう一度確認',
    },

    today: {
      syncedJustNow: 'たった今',
      syncedMinutes: '{{count}} 分前',
      syncedHours: '{{count}} 時間前',
      syncedDays: '{{count}} 日前',
      syncedNever: 'まだ同期していません',

      move: 'ムーブ',
      exercise: 'エクササイズ',
      stand: 'スタンド',
      stepsRing: '歩数',
      moveUnit: '/ {{goal}} kcal',
      exerciseUnit: '/ {{goal}} 分',
      standUnit: '/ {{goal}} 時間',
      stepsUnit: '/ {{goal}}',
      avgUnit: '/ 平均 {{value}}',
      none: '—',
      noGoal: 'kcal',
      noGoalMinutes: '分',
      noGoalHours: '時間',

      budgetTitle: '運動を含めた枠',
      goal: '目標',
      eaten: '摂取',
      burned: '消費',
      left: '残り',
      over: '超過',
      budgetNote: '消費したカロリーはバーを伸ばすだけで、食べた分を削ることはありません。',
      budgetOff: '運動は今のところ枠を広げていません。活動の設定でオンにできます。',

      todayTitle: '今日',
      weekTitle: '今週',
      stepsRow: '歩数',
      stepsRowValue: '今日 {{steps}}',
      balanceRow: '収支',
      balanceDeficit: '1日あたり {{value}} の不足',
      balanceSurplus: '1日あたり {{value}} の余剰',
      balanceUnknown: '記録が足りません',
      historyRowValue_one: 'ワークアウト {{count}} 件 · {{time}}',
      historyRowValue_other: 'ワークアウト {{count}} 件 · {{time}}',
      historyNone: 'まだワークアウトはありません',

      syncing: '同期中…',

      demoBadge: 'デモデータ',

      storeEmpty:
        'このヘルスデータは接続済みですが中身が空で、まさにシミュレータの状態です。生成されたデータがこれらの画面を埋めます。',

      noStandNoteGeneric:
        'お使いのヘルスアプリはスタンド時間を返さないため、代わりに歩数を表示しています。',
    },

    workout: {
      distance: '距離',
      time: '時間',
      pace: 'ペース',
      speed: '速度',
      paceUnit: '{{value}} /km',
      speedUnit: '{{value}} km/h',
      avgHr: '平均心拍',
      maxHr: '最大心拍',
      elevation: '獲得標高',
      bpm: '{{value}} bpm',
      metres: '{{value}} m',

      zonesTitle: '心拍ゾーン',
      zonesNone: 'セッション平均のみ、ゾーンなし',
      zonesNoneBody:
        '{{source}} はセッションごとに平均値を1つ送るだけです。ゾーンとスプリットを見るには、1分ごとに記録する時計をつないでください。',
      zonesNoneBodyGeneric:
        'このセッションは1分ごとの値ではなく平均値1つだけで届いたため、ゾーンに分けられません。',

      noHeartRate: '心拍数は記録されていません',
      noHeartRateBody:
        '{{source}} はこのセッションを心拍数なしで記録しました。時計があれば追加されます。',
      noHeartRateBodyGeneric:
        'このセッションの脈拍を記録したものがありません。スマホは時間は測れても脈は測れません。',

      from: '{{source}} より',
      missing: 'このワークアウトはヘルスアプリにもう存在しません。',
    },

    steps: {
      title: '歩数',
      todaySoFar: '今日ここまで',
      goalLine: '目標 {{goal}} 歩',
      over: '{{value}} 超過',
      under: 'あと {{value}}',
      unit: '歩 · {{distance}}',

      busiest: 'いちばん動いたのは {{hour}} でした。',
      morning: '午前',
      afternoon: '午後',
      evening: '夜',
      noHours: 'この日の時間別の内訳はありません。',

      weekTitle: '今週',
      dailyAvg: '1日平均',
      goalDays: '達成日数',
      best: '最高',

      weekendNote: '合計を数日が支えています。静かな日に少し歩けば、ならされます。',
      steadyNote: '毎日が均等です。何をしているにせよ、もう習慣になっています。',
      shortNote: '傾向を見るにはまだ日数が足りません。',
    },

    balance: {
      chartTitle: '摂取と消費',
      chartBody: '摂取と総消費の比較',
      deficit: '{{value}} の不足',
      surplus: '{{value}} の余剰',
      even: '同じ',
      eatenLegend: '摂取',
      burnedLegend: '消費',

      splitTitle7d: '消費の内訳 · 7日',
      splitTitle30d: '消費の内訳 · 30日',
      splitTitle1y: '消費の内訳 · 12か月',
      resting: '安静時',
      restingBody: '生きているだけで',
      workouts: 'ワークアウト',
      workoutsBody: 'セッションで使った分',
      walking: '歩行',
      walkingBody: '歩数と日々の用事',
      kcal: '{{value}} kcal',

      partial:
        '食事の記録と安静時代謝の両方がそろった {{total}} 日中 {{days}} 日に基づいています。',
      noRestingTitle: '安静時エネルギーがありません',
      noRestingBody:
        'お使いのヘルスアプリは安静時の消費を返さないため、日々の収支を描けません。歩数、ワークアウト、アクティブエネルギーには影響しません。',
      empty: '時計をつけたまま何食か記録すると、ここが埋まります。',
    },

    history: {
      title: '履歴',
      weekTitle: '今週',
      sessions: '回数',
      time: '時間',
      burned: '消費',
      allTitle: 'すべてのセッション',
      empty: 'まだワークアウトの記録はありません。',
      emptyBody: '時計やスマホが記録したものは、すべてここに届きます。',
    },

    settings: {
      title: 'ヘルス同期',
      connectedTitle: '接続済み',
      sourceTitle: '読み取る内容',
      lastSynced: '最終同期 {{when}}',
      syncNow: '今すぐ同期',
      syncing: '同期中…',
      extendBudget: '運動で枠を広げる',
      extendBudgetBody:
        '消費したカロリーはその日に加算され、食べた分から引かれることはありません。',
      stepGoal: '歩数目標',
      disconnect: '接続を解除',
      disconnectBody: '同期を止めます。すでに読み取った分は履歴に残ります。',
      disconnectConfirm: '同期を止めますか',
      disconnectConfirmBody:
        'RiceCal はヘルスアプリの読み取りを停止します。すでに記録された活動は残ります。',
      clearDemo: 'デモデータを削除',
      clearDemoBody: 'このアカウントから、生成された日とセッションをすべて削除します。',
      granted: 'オン',
      notGranted: '未許可',
      partial: '一部のデータが共有されていません',
    },

    provider: {
      apple_health: 'Apple ヘルスケア',
      health_connect: 'Health Connect',
      demo: 'デモデータ',
    },

    zone: {
      easy: 'イージー',
      steady: '一定',
      hard: 'ハード',
      peak: 'ピーク',
    },

    kind: {
      run: 'ランニング',
      walk: 'ウォーキング',
      hike: 'ハイキング',
      cycle: 'サイクリング',
      swim: '水泳',
      badminton: 'バドミントン',
      tennis: 'テニス',
      football: 'サッカー',
      basketball: 'バスケットボール',
      volleyball: 'バレーボール',
      gym: 'ジム',
      strength: '筋トレ',
      hiit: 'HIIT',
      yoga: 'ヨガ',
      dance: 'ダンス',
      martialArts: '格闘技',
      rowing: 'ローイング',
      stairs: '階段',
      other: 'ワークアウト',
    },

    unit: {
      kcal: '{{value}} kcal',
    },
  },

  auth: {
    choose: {
      email: 'メールで続ける',
    },

    password: {
      signUpTitle: 'パスワードを決める',
      signUpSubtitle: '{{email}} 用です。次回のログインに使います。',
      signInTitle: 'パスワードを入力',
      signInSubtitle: '{{email}} としてログインします。',

      field: 'パスワード',
      confirmField: 'パスワードの確認',
      placeholder: '8 文字以上',
      show: 'パスワードを表示',
      hide: 'パスワードを隠す',

      createAccount: 'アカウントを作成',
      signIn: 'ログイン',
      forgot: 'パスワードをお忘れですか',

      codeInstead: '代わりにコードをメールで送る',

      haveAccount: 'すでにアカウントをお持ちですか。ログイン',
      needAccount: 'はじめてですか。アカウントを作成',

      maybeExisting:
        'このアドレスにすでにアカウントがある場合は、下からログインするかコードを請求してください。',
    },

    verify: {
      title: 'メールを確認してください',
      sentTo: '{{email}} に 6 桁のコードを送りました。件名にも入っています。',
      sendingTo: '{{email}} に 6 桁のコードを送信中…',

      field: 'コード',
      placeholder: '000000',
      submit: '続ける',

      resend: 'もう一度送る',
      resendIn: '{{seconds}} 秒後にもう一度送れます',
      resent: '送信しました。メールをもう一度確認してください。',
    },

    reset: {
      askTitle: 'パスワードを再設定',
      askSubtitle: 'アカウントのメールアドレスを教えてください。コードをお送りします。',
      send: '再設定用コードを送る',

      newTitle: '新しいパスワードを決める',
      newSubtitle: 'あと少しです。覚えられるものを選んでください。',
      field: '新しいパスワード',
      confirmField: '新しいパスワードの確認',
      save: '保存してログイン',
      done: 'パスワードを変更しました。ログイン済みです。',
    },

    captcha: {
      title: '簡単な確認',
      body: 'Cloudflare があなたが人間であることを確認します。1 秒で終わります。',
    },

    errors: {
      passwordShort: '8 文字以上にしてください。',
      passwordRequired: 'パスワードを入力してください。',
      passwordMismatch: '2 つのパスワードが一致しません。',
      codeLength: 'コードは 6 桁です。',

      invalid_credentials:
        'そのメールとパスワードは一致しません。もう一度試すか、コードを請求してください。',
      email_not_confirmed: '先にメールアドレスを確認してください。新しいコードをお送りしました。',
      account_exists: 'このアドレスでログインするか、コードをメールで送らせてください。',
      code_invalid: 'そのコードは誤っているか期限切れです。新しいものを請求してください。',
      weak_password: 'そのパスワードは推測されやすすぎます。もっと長いものにしてください。',
      same_password: 'それは今お使いのパスワードです。別のものを選んでください。',
      rate_limited: '次のメールを請求するまで少しお待ちください。',
      rate_limited_in: '次のメールを請求するまで {{seconds}} 秒お待ちください。',
      captcha: 'あなたが人間であることを確認できませんでした。接続を確認して再度お試しください。',
      offline: '接続がありません。オンラインに戻ったら試してください。',
      unknown: '問題が起きました。もう一度お試しください。',
    },
  },

  onboarding: {
    language: {
      title: '言語を選んでください',
      subtitle: 'あとから「自分」で変更できます。',
    },

    welcome: {
      title: 'どの一皿も、もう数えてあります',
      subtitle: 'ナシレマ、フォー、ラクサ、チャーシュー飯。アジアの料理を、きちんと数える。',
      perks: {
        track: { title: '1 kcal まで記録', subtitle: '写真を撮るか、数秒で検索' },
        habit: { title: 'より健康な習慣をつくる', subtitle: 'ゆるい目標、連続記録、責めません' },
        local: {
          title: 'アジア料理 50,000 品',
          subtitle: 'さらに 300 万点の商品をバーコードで読み取り',
        },
      },
      start: 'はじめる',
      signIn: 'すでにアカウントがあります',
    },

    about: {
      title: '基本のことを少しだけ',
      height: '身長',
      heightPlaceholder: '170',
      weight: '体重',
      weightPlaceholder: '65',
      sex: '性別',
      female: '女性',
      male: '男性',
      age: '年齢',
      agePlaceholder: '29',
      years: '歳',
      targetWeight: '目標体重',
      targetWeightUnset: '—',
      targetWeightHint: 'スライドして目指す体重を決めてください。',
      targetWeightLocked: '先に体重を入力してください。',
    },

    activity: {
      title: '1 日はどのくらい動きますか',
      sedentary: { title: 'ほぼ座っている', subtitle: 'デスクワーク、運転、勉強' },
      light: { title: '少し動く', subtitle: '多少の歩行、軽い家事' },
      onFeet: { title: '立ち仕事が多い', subtitle: '販売、看護、現場仕事' },
      veryActive: { title: 'とてもよく動く', subtitle: 'ほぼ毎日トレーニング' },
    },

    source: {
      title: '何で知りましたか',
      subtitle: '次にどこへ出ていくべきかの参考になります。',
      xiaohongshu: 'XiaoHongShu',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      reddit: 'Reddit',
      facebook: 'Facebook',
      threads: 'Threads',
      appStore: 'App Store',
      googlePlay: 'Google Play',
      friend: '友人か家族',
      other: 'その他',
    },

    calculating: {
      title: 'プランを組み立てています',
      subtitle: '身長、体重、目標、そして 1 日の過ごし方から。',
      steps: {
        budget: '1 日のカロリー目標',
        macros: '炭水化物、たんぱく質、脂質の配分',
        catalogue: 'あなたの食べ物と照合',
      },
    },

    target: {
      title: '1 日の枠',
      perDay: '1 日 KCAL',
      carbs: '炭水化物',
      protein: 'たんぱく質',
      fat: '脂質',
      goalWeight: '目標体重',
      goalBy: '到達見込み',
      maintain: '維持',
      maintainValue: '安定',
      splitTitle: '1 日の配分',
      looksRight: 'これで良さそう',
      adjust: '回答を変更する',
    },

    health: {
      title: '数えるのは時計にまかせる',
      subtitle: '消費した分は今日の枠に足されます。',
      connectApple: 'Apple ヘルスケアをつなぐ',
      connectAndroid: 'Health Connect をつなぐ',
      demo: '生成した活動を使う',
      later: '今はしない',
      emptyToast: 'ヘルスケアから何も返ってきませんでした。活動画面から再度つなげます。',
      failedToast: 'ヘルスデータに接続できませんでした。活動画面からもう一度お試しください。',
      reassurance: '読み取り専用です。あとから活動画面でつなげます。',
      offline: '接続を待っています。ここは飛ばして、あとでつないでも大丈夫です。',
    },

    notifications: {
      title: 'ちょうどいいタイミングでひと声',
      subtitle: '食事のリマインダーを 3 つ、あなたの時間で。',
      meals: '食事のリマインダー',
      scans: 'お皿を数え終えました',
      nothingElse: 'それ以外は送りません',
      promise: '自分のリマインダーで、どれでもオフにできます。',
      enable: '通知をオンにする',
      later: 'あとで',
      blocked: 'RiceCal のリマインダーはオフです。自分のリマインダーからオンにできます。',
    },

    tutorial: {
      appBar: 'RiceCal の使い方',
      skip: 'スキップ',
      next: '次へ',
      done: '記録をはじめる',
      offerTitle: 'はじめてですか',
      offerBody: '記録の仕組みを 30 秒で。',
      offerAction: '見てみる',

      log: {
        title: '記録の方法は 4 つ',
        subtitle: '「今日」の緑のボタンを押して、どれかを選びます。',
        snap: '撮る',
        snapBody: 'お皿の写真を 1 枚',
        describe: '書く',
        describeBody: '食べたものを入力',
        search: '探す',
        searchBody: '名前で見つける',
        recipes: 'レシピ',
        recipesBody: '自分で作ったもの',
        barcode: '商品ですか。カメラはバーコードも読みます。',
      },

      read: {
        title: 'その日の記録に入ります',
        subtitle: '料理名をつけ、量を見積もり、代わりに数えます。',
        exampleName: 'ナシレマ アヤム',
        exampleDetail: '1 皿、320 g',
        exampleKcal: '644',
        tip: '真上から、お皿全体がフレームに入るように撮ってください。',
      },

      fix: {
        title: '違ったら、そう言うだけ',
        subtitle: '記録をタップして、きらめきのアイコンへ。ふつうの言葉で十分です。',
        chipHalf: '半分だけ',
        chipNoRice: 'ごはん抜き',
        chipExtra: '飲み物を追加',
        typed: 'ごはんは半分しか食べていません',
        beforeLabel: '前',
        before: '644',
        afterLabel: '後',
        after: '498',
      },

      day: {
        title: '1 日が埋まっていくのを見る',
        subtitle: 'リングは残り。バーは炭水化物、たんぱく質、脂質です。',
        ringCaption: '残り KCAL',
        carbs: '炭水化物',
        protein: 'たんぱく質',
        fat: '脂質',
        note: '時計の運動は上に足されるだけで、引かれることはありません。',
      },
    },

    saving: {
      title: '回答を保存しています…',
      offlineTitle: '接続を待っています',
      offlineBody: '回答はこの端末に安全に残っています。オンラインになり次第、保存します。',
      failedTitle: '回答を保存できませんでした',
      failedBody: '何も失われていません。接続を確認して、もう一度お試しください。',
    },

    account: {
      title: '進捗を保存する',
      subtitle: '回答の準備ができました。アカウントがあれば、機種変更しても残ります。',
      signInTitle: 'おかえりなさい',
      signInSubtitle: 'ログインすれば、記録は前回の続きから始まります。',
      apple: 'Apple で続ける',
      google: 'Google で続ける',
      or: 'または',
      email: 'メール',
      emailPlaceholder: 'you@email.com',
      errors: {
        email: 'メールアドレスではないようです。',
      },
    },
  },

  logging: {
    today: {
      title: '今日',
      backToTodayA11y: '今日に戻る',
      kcalLeft: '残り KCAL',
      kcalOver: '超過 KCAL',
      kcalOfGoal: '/{{goal}} KCAL',
      showGoals: 'その日の枠を表示',
      showLeft: '残りを表示',
      overNote: '今日は少し超えました。明日はまた新しく数えます。',
      overNoteOn: 'その日は少し超えました。',
      burnedNote: '今日の運動で +{{kcal}}',
      burnedNoteOn: 'その日の運動で +{{kcal}}',
      logHeading: '摂取 · {{kcal}} KCAL',
      analysing: 'お皿を読み取っています',
      analysingHint: '何かわかり次第、数えます',
      describing: '書かれた内容を読んでいます',
      describingRead: '書かれた内容を読んでいます…',
      scanningRead: 'お皿を読み取っています…',
      scanningMatch: 'カタログから探しています…',
      scanningPortion: '量を見積もっています…',
      scanningCount: 'カロリーを数えています…',
      refiningApply: '修正を反映しています…',
      refiningCount: 'カロリーを数え直しています…',
      scanDoneTitle: 'お皿を数え終えました',
      describeDoneTitle: '食事を数え終えました',
      scanDoneBody: '{{food}} · {{kcal}} kcal',
      scanDoneBodyPlain: 'タップすると中身が見られます。',
      deleteEntry: '削除',
      noFoodTitle: 'この写真に食べ物がありません',
      noFoodTypedTitle: '書かれた内容に食べ物がありません',
      noFoodHint: 'その日には何も追加されていません。',
      noFoodDismiss: '閉じる',
      analysisFailedTitle: 'これは読み取れませんでした',
      analysisFailedHint: 'タップして自分で料理を選ぶ',

      noBudgetTitle: 'まだ 1 日の枠がありません',
      noBudgetBody: '目標を決めれば、リングにも埋めるものができます。',
      noBudgetAction: '目標を設定する',
    },

    week: {
      a11y: {
        plain: '{{day}}',
        ahead: '{{day}}、まだ来ていません',
        under: '{{day}}、目標以内',
        over: '{{day}}、目標超え',
        missed: '{{day}}、記録なし',
      },
    },

    calendar: {
      showMonth: '月で見る',
      showDay: '日で見る',
      previousMonth: '前の月',
      nextMonth: '次の月',
      legend: {
        under: '目標以内',
        over: '目標超え',
        missed: '記録なし',
      },
      dayHeading: '{{day}}',
      dayKcal: '{{kcal}} kcal',
      dayEmpty: 'その日は記録がありません。',
    },

    selector: {
      title: '料理を記録',
      remaining: '残り {{count}} kcal',
      snap: '撮る',
      describe: '書く',
      search: '探す',
    },

    capture: {
      tabs: '何に向けていますか',
      meal: '料理',
      barcode: 'バーコード',
      scansLeft_zero: '今日の撮影回数を使い切りました。明日また戻ります。',
      scansLeft_one: '今日はあと {{count}} 回',
      scansLeft_other: '今日はあと {{count}} 回',
    },

    barcode: {
      permissionTitle: 'RiceCal にカメラの使用を許可',
      permissionBody: 'カメラは商品のバーコードを読み取ります。録画もアップロードもしません。',
      aim: 'カメラを商品のバーコードに向けてください。',
      noCamera: 'この端末にはカメラがないため、ここでは読み取れません。',
      missTitle: '新しい商品',
      unknown: 'これはまだ登録がありません。言葉で書いていただければ、こちらで計算します。',
      failedTitle: '応答がありません',
      failed:
        '今はカタログに接続できませんでした。商品は問題ないかもしれません。問題は接続のほうです。',
      tryAgain: 'もう一度読み取る',
      describeInstead: '代わりに言葉で書く',
    },

    describe: {
      placeholder: 'ナシレマとフライドチキン、それにテータレ',
      send: 'この食事を記録',
    },

    camera: {
      title: 'お皿を撮る',
      analysing: 'お皿の中身を判定しています',
      permissionTitle: 'カメラへのアクセスが必要です',
      permissionBody:
        'RiceCal はカメラでお皿を読み取ります。端末から何かが出ていくことはありません。',
      permissionGrant: 'カメラを許可',
      shutter: '撮影',
      library: '写真から選ぶ',
      flip: 'カメラを切り替え',
      captured: '今撮った写真',
      photoOf: '{{food}} の写真',
    },

    added: {
      toast: '追加しました、{{kcal}} kcal',
      removedToast: '今日から削除しました',
    },

    search: {
      title: '検索',
      placeholder: 'どんな料理でも検索',
      clear: '検索をクリア',
      place: {
        mamak: 'ママック',
        kopitiam: 'コピティアム',
        hawker: '屋台',
        packaged: '市販品',
        home: '家庭料理',
      },
      emptyTitle: 'その名前の料理はありません',
      emptyBody: 'もっと短い言葉か、語数を減らして試してください。',
      offlineTitle: '接続がありません',
      offlineBody: '料理の一覧はサーバー側にあります。オンラインに戻り次第、検索されます。',
      errorTitle: '検索できませんでした',
      errorBody: '検索中に問題が起きました。少し経ってからもう一度お試しください。',
    },

    detail: {
      servings: '人前',
      typeServings: '正確な量を入力',
      total: '合計 KCAL',
      moreNutrients: 'その他の栄養素',
      fibre: '食物繊維',
      sugar: '糖質',
      sodium: '塩分（ナトリウム）',
      milligrams: '{{value}}mg',
      fixTitle: '入力して修正',
      fixPlaceholder: 'サンバル抜きで、量は半分でした',
      fixAction: '修正する',
      fixNotApplied: 'それは反映できませんでした。言い方を変えてみてください',
      plateTitle: '材料',
      plateTotal: '合計',
      plateEmptied: 'お皿に何も残っていません。この記録は 1 人前として数え直されます。',
      times: '× {{amount}}',
      grams: '（{{grams}} g）',
      count: '（× {{amount}}）',
      partKcal: '{{kcal}} kcal',
      gramsShort: '{{grams}} g',
      gramsField: '重さ（グラム）',
      lessOf: '{{name}} を減らす',
      moreOf: '{{name}} を増やす',
      removeOf: '{{name}} を外す',
      editKcal: 'カロリー',
      figuresTitle: '自分で入れた数値',
      macrosTitle: 'マクロ',
      editFigures: 'カロリーとマクロを編集',
      editPlate: '材料を編集',
      editDetails: '名前、日付、時刻を編集',
      yourFigures: 'アプリの数値ではなく、あなたの数値です。',
      nameField: '名前',
      numbersReset: 'アプリの数値を使う',
      servingWord: '人前',
      quickFix: {
        halfPortion: '半分の量',
        noSambal: 'サンバル抜き',
        addEgg: '卵を追加',
        extraRice: 'ごはん大盛り',
      },
      editByHand: '詳細を手で編集',
      whenValue: '{{day}} {{time}}',
      whenRow: '日付',
      dayTitle: '日',
      timeTitle: '時刻',
      hour: '時',
      minute: '分',
      am: '午前',
      pm: '午後',
      movedTo: '{{day}} に移動しました',
      save: '保存',
      saveFailed: 'その変更を保存できませんでした',
      discardTitle: '保存せずに戻りますか',
      discardBody: 'ここでの変更は破棄され、記録は元のままになります。',
      discardConfirm: '破棄',
      deleteEntry: 'この記録を削除',
      deleteTitle: 'この記録を削除しますか',
      deleteBody: '今日からすぐに外れ、その分だけ枠が戻ります。',
      addToDiary: '記録に追加',
      decreaseServing: '1 つ減らす',
      increaseServing: '1 つ増やす',
      choosePicture: 'この記録の絵を選ぶ',
      addPicture: 'タップして絵を追加',
      photoFailed: 'その写真を保存できませんでした',
      replacePhoto: '写真を絵に置き換える',
      replacePhotoTitle: '写真を置き換えますか',
      replacePhotoBody:
        'この記録が持てるのは写真か絵のどちらかで、両方は持てません。実際のお皿の写真は完全に失われます。',
      replacePhotoConfirm: '絵を選ぶ',
      shareEntry: 'この食事をシェア',
    },

    share: {
      loggedBy: '記録者',
      brand: 'RiceCal',
      text: '{{food}}、{{kcal}} kcal。RiceCal で記録',
      failed: 'その画像を作成できませんでした',
    },

    icon: {
      title: '絵を選ぶ',
      searchTab: '検索',
      cameraTab: 'カメラ',
      searchLabel: '絵を検索',
      searchPlaceholder: 'ナシレマ、テータレ、魚',
      noMatch: '「{{query}}」に一致するものはありません。',
    },

    water: {
      title: '水分',
      count: '{{filled}} / {{goal}} ml',
      addTitle: '水分を追加',
      left: '残り {{amount}} ml',
      add: '{{amount}} ml 追加',
      customLabel: 'ほかの量',
      customPlaceholder: '600',
      customAdd: 'この量を足す',
      customRemove: 'この量を引く',
      added: '水分 {{amount}} ml',
      removed: '{{amount}} ml 引きました',
      undo: '元に戻す',
      level: '今日は {{goal}} ml のうち {{filled}} ml',
    },
  },

  progress: {
    title: 'トレンド',

    ofDays: '{{total}} 日中 {{done}} 日',

    metric: {
      calories: 'カロリー',
      water: '水分',
      weight: '体重',
      caloriesUnit: '平均',
      waterUnit: 'ml',
      none: '—',
      a11y: '{{metric}}、{{value}}',
    },

    range: {
      label: '期間',
      '7d': '7日',
      '30d': '30日',
      '1y': '1年',
      span7d: '直近 7 日',
      span30d: '直近 30 日',
      span1y: '直近 12 か月',
      week: '第{{index}}週',
      weekLong: '第 {{index}} 週',
    },

    calories: {
      goalNote: '目標 1 日 {{goal}} kcal',
      goalNoteWeekly: '週平均、目標は 1 日 {{goal}}',
      goalNoteMonthly: '月平均、目標は 1 日 {{goal}}',
      noGoal: '1 日の枠がまだ設定されていません',
      under: '{{value}} 少ない',
      over: '{{value}} 多い',
      chart: '1 日のカロリー、炭水化物、たんぱく質、脂質の内訳',

      grams: '{{value}} g',
      shareOfIntake: '摂取の {{value}}%',

      goalTitle: '目標との比較',
      daysUnder: '{{goal}} を下回った日数',
      daysLogged: '完全に記録した日数',

      notableTitle: '目立った月',
      monthAverage: '平均 {{value}}',

      emptyTitle: 'この期間に食事の記録はありません',
      emptyBody: '何か記録すれば、その日からバーが埋まります。',
    },

    water: {
      dayNote: '1 本の柱が 1 日、目標との比較です',
      weeklyNote: '1 本の柱が 1 週間の平均、目標との比較です',
      monthlyNote: '1 本の柱が 1 か月の平均、目標との比較です',
      goalPill: '目標 {{amount}}',
      chart: '1 日の水分、目標 {{amount}} との比較',

      reached: '目標達成',
      short: '目標に届かず',

      goalDays: '達成日数',
      bestDay: '最多の日',
      bestMonth: '最多の月',
      yearAverage: '年平均',
      total: '合計',

      todayTitle: '今日',

      habitTitle: '習慣',
      daysAtLeast: '{{amount}} 以上の日数',
      daysLogged: '記録した日数',
      monthsAveraging: '平均 {{amount}} 以上の月数',
      monthsLogged: '記録した月数',

      emptyTitle: 'この期間に水分の記録はありません',
      emptyBody: '「今日」で 1 杯記録すれば、ここが埋まります。',
    },

    weight: {
      peakOn: '{{date}} の {{value}} {{unit}}',
      peakIn: '{{month}} の {{value}} {{unit}}',
      change: '{{value}} {{unit}}',
      chart: '{{span}}の体重',

      thisWeek: '今週',
      thisMonth: '今月',
      thisYear: '今年',
      average7: '7 日平均',
      average30: '30 日平均',
      lightest: '最軽量',
      weighIns: '計測回数',
      monthsLogged: '記録した月数',

      toGoal: '目標の {{target}} {{unit}} まであと {{value}} {{unit}}',
      noTarget: '目標体重が設定されていません',
      atGoal: '目標体重に到達しています',
      weeksAway: '約 {{count}} 週間',

      recentTitle: '最近の計測',
      add: '追加',
      weekByWeek: '週ごと',
      byQuarter: '四半期ごと',
      quarter: '{{from}} から {{to}}',

      reading: '{{value}} {{unit}}',
      readingToday: '今日',
      firstReading: '最初',

      sheetTitle: '体重を追加',
      sheetEditTitle: '{{date}} の計測',
      thisMorning: '今朝',
      down: '{{day}}より {{value}} {{unit}} 減',
      up: '{{day}}より {{value}} {{unit}} 増',
      same: '{{day}}と同じ',
      save: '計測を保存',
      saved: '計測を保存しました',
      remove: 'この記録を削除',
      removeTitle: 'この記録を削除しますか',
      removeBody: 'グラフからこの日が消えます。これが最新なら、枠はその前の値に戻ります。',

      emptyTitle: 'この期間に計測はありません',
      emptyBody: '1 回で点が 1 つ。2 回で線になります。',
    },
  },

  profile: {
    home: {
      title: '自分',
      memberSince: '{{month}} から利用',
      streak: '連続',
      goal: '目標',
      pro: 'RiceCal Pro',
      proTrial: '無料期間は{{when}}終了',
      proTrialTomorrow: '明日',
      proTrialOn: '{{date}} に',
      noName: 'あなたのアカウント',
      signOutTitle: 'ログアウトしますか',
      signOutBody: '記録は安全に残ります。どの端末でもログインし直せば続きから使えます。',
      proTrialIn_one: 'あと {{count}} 日',
      proTrialIn_other: 'あと {{count}} 日',
      proActive: '{{plan}}プラン、利用中',
      proActivePlain: 'Pro、利用中',
      proNone: '無料プラン',
      metric: 'メートル法',
      imperial: 'ヤード・ポンド法',
      settings: '設定',
      personalisation: 'パーソナライズ',
      goals: '目標と数値',
      goalsValue: '{{kcal}} kcal',
      reminders: 'リマインダー',
      remindersValue: '{{count}} 件オン',
      healthOff: '未接続',
      units: '言語と単位',
      tutorial: 'RiceCal の使い方',
      help: 'ヘルプセンター',
      signOut: 'ログアウト',
    },

    help: {
      title: '気軽に話しかけてください',
      body: 'Discord サーバーは、質問に答え、次に何を作るかを決めている場所です。',
      logo: 'Discord',
      bug: '不具合を報告する',
      idea: '機能を提案する',
      ask: 'RiceCal について何でも聞く',
      action: 'Discord を開く',
      failed: 'Discord を開けませんでした',
    },

    shareEarn: {
      row: 'シェアして Pro をもらう',
      title: 'シェアして Pro をもらう',
      heroTitle: 'RiceCal を投稿して Pro を無料で',
      heroBody:
        '記録したお皿をみんなに見せてください。投稿のいいねが多いほど、お送りする Pro の期間も長くなります。',

      platforms: '投稿先',

      rewards: 'もらえるもの',
      postReward: 'Pro 1 か月',
      postBadge: 'いいね 30+',
      postBody: 'ここに挙げたどのサービスでも、アプリについての公開投稿なら対象です。',
      likedReward: 'Pro 1 年',
      likedBadge: 'いいね 100+',
      likedBody: '投稿が届くべき人に届きました。',
      viralReward: 'Pro を永久に',
      viralBadge: 'いいね 500+',
      viralBody: 'バズりました。あなたのものです。更新も解約も不要です。',

      how: '流れ',
      step1:
        'RiceCal について公開の場に投稿してください。記録のスクリーンショットか、読み取ったお皿がいちばん効きます。',
      step2: '数日おいて、いいねが集まるのを待ちます。',
      step3: 'リンクを Discord に持ってきていただければ、Pro コードをお送りします。',

      claim: 'もう投稿しましたか',
      claimBody: 'リンクを Discord に貼ってください。確認してコードをお送りします。',
      claimAction: 'Discord を開く',

      finePrint:
        '特典はお一人 1 回です。ご申請の時点で投稿が公開かどうかを確認し、いいねを数えますので、少し時間をおいてからお越しください。',
      openFailed: 'そのアプリを開けませんでした',
    },

    goals: {
      title: '目標と数値',
      dailyCalories: '1 日のカロリー',
      recommended: '推奨 {{value}}',
      macroTargets: 'マクロの目標',
      macroValue: '{{grams}} g · {{percent}}%',
      goal: '目標',
      currentWeight: '現在の体重',
      targetWeight: '目標体重',
      weeklyPace: '週あたりのペース',
      paceLosing: '週 {{value}} {{unit}} 減',
      paceGaining: '週 {{value}} {{unit}} 増',
      paceHolding: '維持',
      other: 'その他',
      waterGoal: '水分の目標',
      saved: '数値を保存しました',
    },

    personalisation: {
      title: 'パーソナライズ',
      mealsTitle: '食事の時間',
      mealsNote: 'リマインダーが鳴る時間です。',
      editMeal: '{{meal}}の時間を変更',
      hour: '時',
      minute: '分',
      preview: '{{time}} に通知',
    },

    reminders: {
      title: 'リマインダー',
      meals: '食事',
      mealAt: '{{meal}} · {{time}}',
      habits: '習慣',
      water: '2 時間ごとに水分',
      weighIn: '月曜に体重を測る',
      weeklyReport: '週次レポート',
      monthlyReport: '月次レポート',
      denied: 'リマインダーには通知の許可が必要です。',
      blockedTitle: '通知がオフです',
      blockedBody: '設定でオンにすると、これらのスイッチが働きます。',
      openSettings: '設定を開く',
      push: {
        mealTitle: '{{meal}}の時間です',
        mealBody: '覚えているうちに記録を。10 秒で終わります。',
        waterTitle: '水分チェック',
        waterBody: '今日はどれくらい飲みましたか。',
        weighInTitle: '朝の計測',
        weighInBody: '起きてすぐがいちばん安定した値になります。',
        weeklyTitle: '食事で振り返る 1 週間',
        weeklyBody: '7 日分の記録を、1 画面で。',
        monthlyTitle: '食事で振り返る 1 か月',
        monthlyBody: '4 週間と、その結果。',
      },
    },

    preferences: {
      title: '言語と単位',
      language: '言語',
      languageLabel: 'アプリの言語',
      languageNote: '料理名は書かれたときの言語のままです。',
      units: '単位',
      weight: '体重',
      kg: 'kg',
      lb: 'lb',
      energy: 'エネルギー',
      kcal: 'kcal',
      kj: 'kJ',
      appearance: '外観',
      light: 'ライト',
      dark: 'ダーク',
      auto: '自動',
    },

    subscription: {
      title: 'サブスクリプション',
      pro: 'RiceCal Pro',
      trialLeft_one: '無料トライアル、残り {{count}} 日',
      trialLeft_other: '無料トライアル、残り {{count}} 日',
      renews: '{{price}} で更新されます。',
      neverRenews: '一度きりの支払いです。更新はありません。',
      freeBody: '1 日 {{scans}} 回の撮影、レシピ {{recipes}} 件、直近 1 週間のトレンド。',
      whatYouGet: 'PRO で使えるもの',
      included: '含まれるもの',
      cancel: 'サブスクリプションを解約',
      cancelTitle: 'サブスクリプションを解約しますか',
      cancelBody: '期間の終わりまでは Pro のままです。どちらにしても記録は読めます。',
      cancelConfirm: 'プランを解約',
      switchMonthly: '月額に切り替え',
      switchYearly: '年額に切り替え',
      manage: 'ストアで管理',
      switched: 'プランを更新しました',
    },
  },

  paywall: {
    couldNotCheck: 'サブスクリプションを確認できませんでした。少し経ってからお試しください。',

    plans: {
      yearly: '年額',
      perMonth: '月あたり {{price}}',
      yearlyBadge: '{{percent}}% お得',
      yearlyBilling: '毎年請求',
      monthly: '月額',
      monthlyBilling: '毎月請求',
      lifetime: '買い切り',
      lifetimeDetail: '一度の支払いで、ずっとあなたのもの',
    },

    hard: {
      appBar: 'RiceCal Pro',
      title: 'RiceCal Pro なら上限なし',
      assurance: '縛りなし、いつでも解約できます',
      assuranceLifetime: '一度の支払い、ストアを通じて返金可能',
      smallPrintYearly: '7 日間無料、その後は年 {{price}}。',
      smallPrintMonthly: '7 日間無料、その後は月 {{price}}。',
      smallPrintLifetime: '{{price}} を一度だけ。サブスクではなく、更新もありません。',
      smallPrintPending: '7 日間無料。',
      start: '無料トライアルを始める',
      startLifetime: '買い切りで購入',
      restore: '購入を復元',
      nothingToRestore: 'このアカウントに復元できる購入はありません',
      notConfigured: 'このビルドではまだ購入が設定されていません。',
      restored: '購入が戻りました',
    },

    table: {
      title: '無料と PRO の比較',
      free: '無料',
      pro: 'Pro',
      rows: {
        snap: {
          label: 'お皿を撮る',
          free: '1 日 {{scans}} 回',
          pro: '無制限',
        },
        describe: {
          label: '食べたものを言葉で書く',
          free: '',
          pro: '',
        },
        barcode: {
          label: '商品を読み取る',
          free: '',
          pro: '',
        },
        search: {
          label: '食品データベースを検索',
          free: '',
          pro: '',
        },
        fix: {
          label: '言葉で書いて食事を修正',
          free: '',
          pro: '',
        },
        suggest: {
          label: '次に何を食べるか聞く',
          free: '',
          pro: '',
        },
        recipes: {
          label: '作った料理を保存',
          free: 'レシピ {{recipes}} 件',
          pro: '無制限',
        },
        recipeFill: {
          label: '写真からレシピを埋める',
          free: '',
          pro: '',
        },
        budget: {
          label: '自分に合ったカロリーの枠',
          free: '',
          pro: '',
        },
        health: {
          label: 'Apple ヘルスケアと Health Connect',
          free: '',
          pro: '',
        },
        reminders: {
          label: '食事のリマインダー',
          free: '',
          pro: '',
        },
        trends: {
          label: 'トレンド',
          free: '7 日',
          pro: '最長 1 年',
        },
        reviews: {
          label: '週次と月次の振り返り',
          free: '直近の週',
          pro: 'すべて',
        },
        photos: {
          label: '食事の写真',
          free: '{{days}} 日',
          pro: '無制限',
        },
      },
    },

    intro: {
      title: '準備完了です。記録を始めますか',
      body: 'なくてもすべて使えます。Pro は上限を外すだけです。',
      later: 'あとで',
    },

    reminder: {
      title_one: 'トライアル残り {{count}} 日',
      title_other: 'トライアル残り {{count}} 日',
      body: '{{days}} 日連続で記録し、{{kg}} kg 減りました。この調子で。',
      daysLogged: '記録日数',
      meals: '食事',
      kgDown: '減った KG',
      starts: 'プランは {{date}} から、年 {{price}} で始まります。',
      keep: 'このプランを続ける',
      manage: 'サブスクリプションを管理',
    },

    ended: {
      heading: '今日',
      previewMode: 'プレビュー',
      title: 'トライアルが終了しました',
      body: '{{days}} 日分の履歴は安全で、今も読めます。',
      dataWaiting: 'データはそのまま残っています',
      days: '日',
      meals: '食事',
      kgDown: '減った KG',
      lockedEntry: 'ロック中',
      resume: 'Pro で続ける',
      browse: '無料のまま見る',
    },

    limit: {
      freeReached: '今日の {{count}} 回を使い切りました。Pro なら好きなだけ読み取れます。',
      proReached: '本日の読み取り上限に達しました。管理者にご連絡ください。',
      notEntitledDetail: 'サブスクリプションが有効ではありません。',
      confirming: '購入を処理中です。少し待ってからもう一度お試しください。',
      feature: {
        camera: '今日もう 1 皿読み取るには RiceCal Pro が必要です。',
        describe: '食べたものを言葉で書くには RiceCal Pro が必要です。',
        refine: '言葉で書いて食事を修正するには RiceCal Pro が必要です。',
        read_recipe: '写真からレシピを埋めるには RiceCal Pro が必要です。',
        new_recipe: 'レシピを {{recipes}} 件より多く持つには RiceCal Pro が必要です。',
        suggest: '次に何を食べるか聞くには RiceCal Pro が必要です。',
        trend_range: '1 週間より前を見るには RiceCal Pro が必要です。',
        review: '古い振り返りを読むには RiceCal Pro が必要です。',
        nudge: 'RiceCal Pro なら上限がなくなります。',
      },
    },

    checking: '少しお待ちください。プランを確認しています。',

    welcome: {
      title: '準備完了です。食べましょう。',
      body: '7 日間の無料期間が今から始まります。すべて使えます。',
      bodyActive: 'すべて使えます。',
      bodyLifetime: 'RiceCal Pro はずっとあなたのものです。すべて使えます。',
      perks: {
        log: '撮る、読み取る、書く',
        database: 'すべての料理と商品',
        suggest: '何を食べるか聞く',
      },
      manageNote: 'プロフィールのサブスクリプションから、いつでも管理・解約できます。',
      manageNoteLifetime: '一度きりの支払いです。更新も解約もありません。',
      start: '記録を見にいく',
    },
  },

  recipes: {
    shelf: {
      mine: '自分の',
      official: '公式',
      community: 'みんなの',
    },

    heading: {
      mine: '自分のレシピ',
      official: 'RiceCal キッチン',
      community: 'コミュニティから',
    },

    search: {
      official: '公式レシピを検索',
      community: '公開レシピを検索',
      mine: '自分のレシピを検索',
      clear: '検索をクリア',
      none: 'その名前のものはありません',
      noneBody: 'もっと短い言葉か、料理名の一部で試してください。',
    },

    empty: {
      mineTitle: 'まだレシピがありません',
      mineBody:
        '大鍋の料理には決まった 1 人前がありません。何を入れて何人分かを一度だけ登録すれば、次からはタップ 1 回で記録できます。',
      officialTitle: 'キッチンは空です',
      officialBody: 'こちらのレシピはここに並びます。',
      communityTitle: 'まだ共有はありません',
      communityBody: '公開されたレシピはここに並びます。',
    },

    servings_one: '{{count}} 人前',
    servings_other: '{{count}} 人前',
    ingredients_one: '材料 {{count}} 点',
    ingredients_other: '材料 {{count}} 点',
    savedTimes_one: '{{count}} 回保存',
    savedTimes_other: '{{count}} 回保存',
    byAuthor: '{{name}} · {{saves}}',
    fromAuthor: '{{name}} より',
    someCook: 'どなたか',

    new: {
      title: '新しいレシピ',
      scanLabel: '写真',
      describeLabel: '書く',
      scanTitle: '写真から埋める',
      or: 'または自分で入力',
      describeTitle: '言葉で書く',
      describePlaceholder:
        'カリアヤム。鶏もも 600g、ココナッツミルク 1 缶、じゃがいも 3 個。4 人分。',
      describeHint: '分量と何人分か、この 2 つを書く価値があります。',
      describeAction: 'フォームに入れる',
      describeFailed: 'それは読み取れませんでした。下から自分で入力してください。',
      scanFailed: 'それは読み取れませんでした。下から自分で入力してください。',

      readingPhoto: '写真を読み取っています…',
      readingText: '書かれた内容を読んでいます…',
      readingIngredients: '何が入っているか調べています…',
      readingPortions: '分量を見積もっています…',
      readingSteps: '手順を書いています…',
      readingHint: '少しお待ちください。できあがったら何でも直せます。',
    },

    edit: {
      title: 'レシピを編集',
      name: '名前',
      namePlaceholder: 'なんと呼んでいますか',
      picture: '画像',
      changePicture: '画像を変更',
      replacePhotoTitle: '代わりにイラストを使いますか',
      replacePhotoBody: 'このレシピの写真は削除されます。',
      replacePhotoConfirm: 'イラストを使う',
      servings: '何人分',
      ingredients: '材料',
      ingredientsCount: '材料 · {{count}}',
      ingredientsEmpty: 'まだ何もありません。ひとつずつ検索すれば、鍋ごと合計します。',
      addIngredient: '材料を追加',
      steps: '作り方',
      stepsPlaceholder: '1 行に 1 手順。改行すれば番号をつけます。',
      stepsHint: '改行するたびに、次の番号つき手順になります。',
      stepsSheetTitle: '作り方',
      stepsEditAction: '手順を編集',
      stepsEdit_one: '手順を編集、{{count}} 手順',
      stepsEdit_other: '手順を編集、{{count}} 手順',
      stepsWrite: '作り方を書く',
      save: 'レシピを保存',
      saved: 'レシピを保存しました',
      nameRequired: '先に名前をつけてください',
      saveFailed: 'それは保存できませんでした。もう一度お試しください。',
      limitReached: '無料アカウントで持てるのは {{count}} 件です。Pro なら上限なしです。',
      totalLabel: '1 人前あたり、全 {{count}}',
      totalWhole: '鍋ごと {{kcal}} kcal',
      discardTitle: '保存せずに戻りますか',
      discardBody: 'ここでの変更は失われます。',
      discardConfirm: '破棄',
    },

    ingredient: {
      title: '材料を追加',
      search: '材料を検索',
      ownTitle: '自分の材料を追加',
      ownBody: '一覧にありませんか。名前とカロリーを入れてください。',
      customBody: 'あなたの台所にしかないもの向けです。パッケージを読むか、一度量ってください。',
      name: '名前',
      namePlaceholder: 'これは何ですか',
      calories: 'カロリー',
      macros: 'マクロ（わかれば）',
      amount: 'どれだけ入れたか',
      add: '鍋に入れる',
      remove: '外す',
      change: '{{name}} の量を変更、現在は {{measure}}',
      unit: {
        g: 'g',
        ml: 'ml',
        piece_one: '個',
        piece_other: '個',
      },
    },

    detail: {
      servingLabel_one: '人前',
      servingLabel_other: '人前',
      portion: {
        half: '半人前',
        one: '1 人前',
        two: '2 人前',
        pot: '鍋ごと',
      },
      ofServings: '{{total}} 人前のうち {{count}}',
      steps: '私の作り方',
      stepsFrom: '{{name}} の作り方',
      noSteps: '手順は書かれていません。',
      ingredients: '材料',
      addToDay: '今日に追加',
      added: 'その日に追加しました',
      saveCopy: '自分のレシピに保存',
      savedCopy: '自分のレシピに保存しました',
      saveCopyFailed: 'それは保存できませんでした。もう一度お試しください。',
      goneTitle: 'レシピが見つかりません',
      goneBody:
        '削除されたか、非公開に戻された可能性があります。共有してくれた人に新しいリンクをもらってください。',
      official: 'RiceCal キッチンより',
      delete: 'レシピを削除',
      deleteTitle: 'このレシピを削除しますか',
      deleteBody: 'すでに記録した食事は、記録に残ります。',
      deleted: 'レシピを削除しました',
    },

    share: {
      action: 'シェア',
      title: 'このレシピをシェア',
      body: 'リンクを持つ人は材料、手順、カロリーを見て、自分用に保存できます。あなたのものはあなたのままです。',
      publicTitle: '公開する',
      publicBody: 'コミュニティのタブに並び、誰でも見つけて保存できます。',
      publishFailed: 'それは変更できませんでした。もう一度お試しください。',
    },

    review: {
      checking: 'レシピを確認しています…',
      approved: 'レシピがコミュニティに公開されました',
      rejected: '未公開：{{reason}}',
      rejectedPlain: 'これは公開できませんでした。',
      pending: 'まだ確認中です。通れば表示されます。',
      badgePending: '確認中',
      badgeRejected: '未公開',
      badgePublic: '公開',
    },

    log: {
      action: 'レシピ',
      empty: {
        mine: 'まだレシピがありません。1 つ追加すれば、記録はタップ 1 回です。',
        official: 'キッチンにはまだ何もありません。',
        community: 'まだ共有はありません。公開されたレシピはここに並びます。',
      },
    },
  },

  reviews: {
    title: '振り返り',

    entry: {
      title: '振り返り',
      subtitle: '1 週間や 1 か月を振り返る',
    },

    kind: {
      week: '週次',
      month: '月次',
      label: '振り返りの長さ',
    },

    list: {
      weekMeta: '第 {{index}} 週',
      weekSummary: '1 日 {{kcal}} kcal、{{total}} 日中 {{done}} 日記録',
      monthMeta: '{{weeks}} 週、{{total}} 日中 {{done}} 日記録',
      monthSummary: '1 日 {{kcal}} kcal',
      monthSummaryWeight: '1 日 {{kcal}} kcal、{{weight}}',
      summaryEmpty: '記録なし',
      a11y: '{{title}}、{{meta}}、{{summary}}',
      a11yLocked: '{{title}}、{{meta}}、{{summary}}、Pro',

      emptyWeekTitle: '振り返れる週はまだありません',
      emptyWeekBody: '週が終わり、そのうち 4 日以上を記録していれば、ここに並びます。',
      emptyMonthTitle: '振り返れる月はまだありません',
      emptyMonthBody: '月が終わり、そのうち 12 日以上を記録していれば、ここに並びます。',
    },

    share: {
      card: '{{card}}をシェア',
      preview: '送られるままのカード',
    },

    story: {
      close: '閉じる',
      share: 'シェア',
      missingTitle: 'その振り返りはここにありません',
      missingBody: '振り返るには中身が少なすぎた週かもしれません。',
    },

    card: {
      brand: 'RiceCal',
      kcalADay: '1 日あたり kcal',
      under: '目標より {{value}} 少ない',
      over: '目標より {{value}} 多い',
      onBudget: '枠ぴったり',
      logged: '記録',
      loggedValue: '{{total}} 日中 {{done}} 日',
      streak: '連続',
      streakValue_one: '{{count}} 日',
      streakValue_other: '{{count}} 日',
      weightChange: '体重',
      noWeight: '—',
      shareText: '{{period}}：1 日 {{kcal}} kcal、{{total}} 日中 {{done}} 日記録。RiceCal',
    },

    food: {
      title: 'いちばん大きかった一皿',
      macros: '1 日のマクロ',
      grams: '{{value}} g',
      share: 'エネルギーの {{value}}%',
    },

    calories: {
      average: '1 日平均',
      kcal: 'kcal',
      under: '{{value}} 少ない',
      over: '{{value}} 多い',
      goalNote: '目標 {{goal}}。{{total}} 日中 {{done}} 日は目標以内。',
      noGoal: '当時は 1 日の枠がありませんでした。',
      everyDay: '毎日',
      everyWeek: '毎週',
      chart: '1 日のカロリー、炭水化物、たんぱく質、脂質の内訳',
      lightest: '{{day}}、最少',
      heaviest: '{{day}}、最多',
      pastWeeks: '直近 5 週',
      pastMonths: '直近 5 か月',
      noData: '—',
    },

    body: {
      weight: '体重',
      weighIns_one: '計測 1 回',
      weighIns_other: '計測 {{count}} 回',
      weightChart: '期間中の体重',
      steps: '1 日の歩数',
      stepGoal: '{{total}} 日中 {{done}} 日が {{goal}} 歩超え',
      stepsChart: '1 日の歩数',
      others: 'その他',
      water: '水分',
      waterValue: '1 日 {{amount}}',
      waterNote_one: '1 日は目標達成',
      waterNote_other: '{{count}} 日は目標達成',
      move: '運動した分数',
      moveNote_one: 'ワークアウト 1 回',
      moveNote_other: 'ワークアウト {{count}} 回',
      moveNoteNone: 'ワークアウトの記録なし',
      burn: '1 日の消費',
      burnValue: '{{value}} kcal',
      distanceValue: '{{value}} km 移動',
    },
  },

  suggest: {
    card: {
      title: '何を食べるか迷っていますか',
    },

    ask: {
      title: 'どんなものにしますか',
      meal: '食事',
      focus: 'マクロ',
      cuisine: 'ジャンル',
      limit: 'カロリー上限',
      editCuisines: 'ジャンルを編集',
      addCuisine: 'ジャンルを追加',
      addCuisinePlaceholder: 'タイ、ニョニャ、和食',
      removeCuisine: '{{cuisine}} を外す',
      kcal: 'kcal',
      less: 'カロリーを減らす',
      more: 'カロリーを増やす',
      leftToday: '残り {{kcal}}',
      healthy: '軽め',
      anything: 'なんでも',
      healthyA11y: '軽めの料理に寄せる',
      action: '何かおすすめして',
    },

    picks: {
      title: '{{meal}}のアイデア',
      thinking: '{{meal}}に合うものを探しています',
      thinkingA11y: '何をすすめるか考えています',
      summary: '{{focus}}、{{cuisine}}、{{kcal}} kcal 以内',
      protein: 'たんぱく質 {{grams}}g',
      retry: 'もう一度試す',
      emptyTitle: '思いつきませんでした',
      emptyBody: 'もう一度聞くか、条件をどれかゆるめてください。',
    },

    detail: {
      unit: 'KCAL、{{portion}}',
      leftAfter: '食べても {{kcal}} kcal 残る',
      overAfter: '食べると {{kcal}} kcal 超える',
      why: 'これが合う理由',
      protein: 'たんぱく質',
      carbs: '炭水化物',
      fat: '脂質',
      sodium: 'ナトリウム',
    },

    meal: {
      breakfast: '朝食',
      lunch: '昼食',
      dinner: '夕食',
      snack: '間食',
    },
    mealFor: {
      breakfast: '朝食',
      lunch: '昼食',
      dinner: '夕食',
      snack: '間食',
    },
    focus: {
      protein: 'たんぱく質',
      balanced: 'バランス',
      carbs: '炭水化物',
    },
    focusShort: {
      protein: 'たんぱく質多め',
      balanced: 'バランス',
      carbs: '炭水化物多め',
    },

    sodium: {
      low: '低い',
      medium: '普通',
      high: '高い',
    },

    ready_one: 'アイデアが {{count}} 件そろいました',
    ready_other: 'アイデアが {{count}} 件そろいました',
    readyAction: '見る',

    failed: 'おすすめを取得できませんでした。少し経ってからお試しください。',
  },
} satisfies Bundle
