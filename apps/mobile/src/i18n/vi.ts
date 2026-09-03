import type { Bundle } from './bundle'

/**
 * Tiếng Việt.
 *
 * Read `en/` before changing anything here. The comments there are the brief.
 */
export const vi = {
  common: {
    action: {
      continue: 'Tiếp tục',
      back: 'Quay lại',
      cancel: 'Huỷ',
      save: 'Lưu thay đổi',
      done: 'Xong',
      edit: 'Sửa',
      delete: 'Xoá',
      add: 'Thêm',
      undo: 'Hoàn tác',
      keep: 'Giữ lại',
      skip: 'Bỏ qua',
      retry: 'Thử lại',
      close: 'Đóng',
    },

    nav: {
      today: 'Hôm nay',
      recipes: 'Công thức',
      activity: 'Hoạt động',
      trends: 'Xu hướng',
      me: 'Tôi',
      log: 'Ghi món ăn',
    },

    date: {
      today: 'Hôm nay',
      yesterday: 'Hôm qua',
    },

    meal: {
      breakfast: 'Bữa sáng',
      lunch: 'Bữa trưa',
      dinner: 'Bữa tối',
      snack: 'Ăn vặt',
    },

    macro: {
      carbs: 'Tinh bột',
      protein: 'Đạm',
      fat: 'Chất béo',
    },

    unit: {
      kcal: 'kcal',
      kcalUpper: 'KCAL',
      grams: '{{value}}g',
      /** The bare symbol, for a field whose value is typed beside it. */
      gram: 'g',
      gramsOfGoal: '{{value}}/{{goal}}g',
      kg: 'kg',
      lb: 'lb',
      cm: 'cm',
      gramsLong: '{{value}} gam',
    },

    volume: {
      ml: '{{value}} ml',
      l: '{{value}} L',
      mlUnit: 'ml',
      lUnit: 'L',
    },

    count: {
      dayStreak_one: 'chuỗi {{count}} ngày',
      dayStreak_other: 'chuỗi {{count}} ngày',
      times_one: '{{count}} lần',
      times_other: '{{count}} lần',
    },

    aiLanguage: {
      open: 'Các tính năng AI dùng ngôn ngữ nào',
      title: 'Các tính năng AI hoạt động bằng tiếng Anh',
      body: 'Chụp một đĩa, nói bằng lời bạn đã ăn gì và hỏi nên ăn gì tiếp đều được gửi tới một mô hình đọc tiếng Anh tốt nhất. Hãy mô tả món ăn bằng tiếng Anh để nó hiểu bạn sát hơn.',
      results:
        'Thứ trả về cũng bằng tiếng Anh. Tên món, nguyên liệu và khẩu phần đều được lưu bằng tiếng Anh trong danh mục món ăn, nên đó là ngôn ngữ chúng xuất hiện, dù ứng dụng đang đặt ở ngôn ngữ nào.',
      dishes: 'Tên món ăn giữ nguyên ngôn ngữ lúc được viết ra.',
      note: 'Mô tả món ăn bằng tiếng Anh để đọc sát nhất. Kết quả trả về bằng tiếng Anh.',
    },

    notFound: {
      title: 'Màn hình đó đã chuyển đi',
      body: 'Liên kết bạn vừa mở không dẫn tới đâu trong phiên bản này của ứng dụng.',
      action: 'Về Hôm nay',
    },

    offline: {
      title: 'Đang chờ kết nối',
      body: 'Mục này chưa được lưu vào máy. Nó sẽ tải ngay khi bạn có mạng.',
      dayTitle: 'Ngày này không có trên máy bạn',
      dayBody: 'Chọn một ngày bạn từng mở, hoặc quay lại khi có mạng.',
    },

    a11y: {
      back: 'Quay lại',
      close: 'Đóng',
      more: 'Thêm tuỳ chọn',
      decrease: 'Giảm',
      increase: 'Tăng',
      step: 'Bước {{current}} trên {{total}}',
      backspace: 'Xoá chữ số cuối',
      decimalPoint: 'Dấu thập phân',
    },
  },

  activity: {
    title: 'Hoạt động',

    connect: {
      title: 'Để đồng hồ đếm hộ bạn',
      body: 'Kết nối ứng dụng sức khoẻ trên máy và mỗi lần đi bộ, chạy hay đánh cầu lông đều được cộng lại vào hạn mức hôm nay.',

      readTitle: 'CHÚNG TÔI ĐỌC GÌ',
      energy: 'Năng lượng vận động',
      energyBody: 'Lượng bạn đốt khi vận động',
      steps: 'Bước và quãng đường',
      stepsBody: 'Thói quen hằng ngày, không phải chỉ tiêu',
      workouts: 'Buổi tập',
      workoutsBody: 'Loại hình, thời gian, tốc độ, nhịp tim',

      privacy:
        'Chỉ đọc. Chúng tôi không bao giờ ghi lại bất cứ gì, và dữ liệu sức khoẻ của bạn chỉ được lưu trong tài khoản của chính bạn.',

      appleBody: 'Apple Health, trên iPhone và Apple Watch',
      connectHealthBody: 'Health Connect: Samsung Health, Fitbit, Garmin',
      heart: 'Nhịp tim',
      demo: 'Dùng dữ liệu mẫu',
      demoBody: 'Được tạo trên máy này, phục vụ phát triển',

      connecting: 'Đang đọc lịch sử của bạn…',
      progress: '{{done}} trên {{total}}',

      emptyTitle: 'Không có gì trả về',
      emptyBody:
        'Chúng tôi không đọc được hoạt động nào. Nếu bạn đã tắt RiceCal trong cài đặt quyền riêng tư của Health, hãy bật lại rồi thử lần nữa.',
      retry: 'Thử lại',

      unavailableTitle: 'Không có dữ liệu sức khoẻ ở đây',
      simulator:
        'Thiết bị này không có kho Health để đọc. Trên trình giả lập, dữ liệu tạo sẵn sẽ lấp đầy các màn hình này.',
      notInstalled:
        'Health Connect chưa được thiết lập trên máy này. Cài từ Play Store, bật một ứng dụng ghi lại vận động của bạn, rồi quay lại.',
      notLinked: 'Bản dựng này không kèm mô đun sức khoẻ. Hãy dựng lại dev client sau khi cài.',
      wrongPlatform: 'Máy này không có kho sức khoẻ nào RiceCal đọc được.',
      openStore: 'Mở Play Store',
      checkAgain: 'Kiểm tra lại',
    },

    today: {
      syncedJustNow: 'Vừa xong',
      syncedMinutes: '{{count}} phút trước',
      syncedHours: '{{count}} giờ trước',
      syncedDays: '{{count}} ngày trước',
      syncedNever: 'Chưa đồng bộ',

      move: 'Vận động',
      exercise: 'Tập luyện',
      stand: 'Đứng',
      stepsRing: 'Bước',
      moveUnit: '/ {{goal}} kcal',
      exerciseUnit: '/ {{goal}} phút',
      standUnit: '/ {{goal}} giờ',
      stepsUnit: '/ {{goal}}',
      avgUnit: '/ trung bình {{value}}',
      none: '—',
      noGoal: 'kcal',
      noGoalMinutes: 'phút',
      noGoalHours: 'giờ',

      budgetTitle: 'HẠN MỨC KÈM VẬN ĐỘNG',
      goal: 'MỤC TIÊU',
      eaten: 'ĐÃ ĂN',
      burned: 'ĐÃ ĐỐT',
      left: 'CÒN LẠI',
      over: 'VƯỢT',
      budgetOff: 'Vận động chưa kéo dài hạn mức của bạn. Bật trong cài đặt Hoạt động.',

      todayTitle: 'HÔM NAY',
      weekTitle: 'TUẦN NÀY',
      stepsRow: 'Bước',
      stepsRowValue: '{{steps}} hôm nay',
      balanceRow: 'Cân đối',
      balanceDeficit: 'thiếu hụt {{value}} mỗi ngày',
      balanceSurplus: 'dư {{value}} mỗi ngày',
      balanceUnknown: 'Chưa đủ dữ liệu',
      historyRowValue_one: '{{count}} buổi tập · {{time}}',
      historyRowValue_other: '{{count}} buổi tập · {{time}}',
      historyNone: 'Chưa có buổi tập nào',

      syncing: 'Đang đồng bộ…',

      demoBadge: 'Dữ liệu mẫu',

      storeEmpty:
        'Kho sức khoẻ này đã kết nối nhưng không có dữ liệu bên trong, đúng như trình giả lập. Dữ liệu tạo sẵn sẽ lấp đầy các màn hình này.',

      noStandNoteGeneric:
        'Ứng dụng sức khoẻ của bạn không báo giờ đứng, nên chúng tôi hiển thị số bước thay vào đó.',
    },

    workout: {
      distance: 'QUÃNG ĐƯỜNG',
      time: 'THỜI GIAN',
      pace: 'TỐC ĐỘ PHÚT',
      speed: 'VẬN TỐC',
      paceUnit: '{{value}} /km',
      speedUnit: '{{value}} km/h',
      avgHr: 'NHỊP TB',
      maxHr: 'NHỊP CAO NHẤT',
      elevation: 'ĐỘ CAO',
      bpm: '{{value}} nhịp/phút',
      metres: '{{value}} m',

      zonesTitle: 'VÙNG NHỊP TIM',

      from: 'Từ {{source}}',
      missing: 'Buổi tập này không còn trong ứng dụng sức khoẻ của bạn.',
    },

    steps: {
      title: 'Bước',
      todaySoFar: 'Hôm nay tới giờ',
      goalLine: 'Mục tiêu {{goal}} bước',
      over: 'vượt {{value}}',
      under: 'còn {{value}}',
      unit: 'bước · {{distance}}',

      morning: 'Buổi sáng',
      afternoon: 'Buổi chiều',
      evening: 'Buổi tối',
      noHours: 'Không có chi tiết theo giờ cho ngày này.',

      weekTitle: 'TUẦN NÀY',
      dailyAvg: 'TB MỖI NGÀY',
      goalDays: 'NGÀY ĐẠT',
      best: 'CAO NHẤT',

      steadyNote: 'Các ngày của bạn khá đều. Dù bạn đang làm gì, nó đã thành thói quen.',
      shortNote: 'Chưa đủ ngày để thấy quy luật.',
    },

    balance: {
      chartTitle: 'Vào so với ra',
      deficit: 'thiếu hụt {{value}}',
      surplus: 'dư {{value}}',
      even: 'Cân bằng',
      eatenLegend: 'Đã ăn',
      burnedLegend: 'Đã đốt',

      splitTitle7d: 'LƯỢNG ĐỐT ĐẾN TỪ ĐÂU · 7 NGÀY',
      splitTitle30d: 'LƯỢNG ĐỐT ĐẾN TỪ ĐÂU · 30 NGÀY',
      splitTitle1y: 'LƯỢNG ĐỐT ĐẾN TỪ ĐÂU · 12 THÁNG',
      resting: 'Nghỉ ngơi',
      restingBody: 'Chỉ cần sống thôi',
      workouts: 'Buổi tập',
      workoutsBody: 'Phần các buổi tập tiêu tốn',
      walking: 'Đi bộ',
      walkingBody: 'Bước chân và việc vặt',
      kcal: '{{value}} kcal',

      partial:
        'Dựa trên {{days}} trên {{total}} ngày có cả nhật ký ăn uống và số liệu trao đổi chất khi nghỉ.',
      noRestingTitle: 'Không có năng lượng nghỉ',
      noRestingBody:
        'Ứng dụng sức khoẻ của bạn không báo lượng cơ thể đốt khi nghỉ, nên không có cân đối hằng ngày để vẽ. Bước, buổi tập và năng lượng vận động không bị ảnh hưởng.',
      empty: 'Ghi vài bữa ăn khi đang đeo đồng hồ và phần này sẽ được lấp đầy.',
    },

    history: {
      title: 'Lịch sử',
      weekTitle: 'TUẦN NÀY',
      sessions: 'SỐ BUỔI',
      time: 'THỜI GIAN',
      burned: 'ĐÃ ĐỐT',
      allTitle: 'TẤT CẢ CÁC BUỔI',
      empty: 'Chưa ghi được buổi tập nào.',
      emptyBody: 'Bất cứ gì đồng hồ hay điện thoại của bạn ghi lại sẽ xuất hiện ở đây.',
    },

    settings: {
      title: 'Đồng bộ sức khoẻ',
      connectedTitle: 'ĐÃ KẾT NỐI',
      sourceTitle: 'CHÚNG TÔI ĐỌC GÌ',
      lastSynced: 'Đồng bộ lần cuối {{when}}',
      syncNow: 'Đồng bộ ngay',
      syncing: 'Đang đồng bộ…',
      extendBudget: 'Vận động kéo dài hạn mức của tôi',
      extendBudgetBody:
        'Calo đốt được cộng vào ngày hôm đó, không bao giờ trừ khỏi phần bạn đã ăn.',
      stepGoal: 'Mục tiêu bước',
      disconnect: 'Ngắt kết nối',
      disconnectBody: 'Dừng đồng bộ. Mọi thứ đã đọc vẫn nằm trong lịch sử của bạn.',
      disconnectConfirm: 'Dừng đồng bộ?',
      disconnectConfirmBody:
        'RiceCal sẽ ngừng đọc ứng dụng sức khoẻ của bạn. Hoạt động đã ghi vẫn được giữ.',
      clearDemo: 'Xoá dữ liệu mẫu',
      clearDemoBody: 'Xoá mọi ngày và buổi tập được tạo sẵn khỏi tài khoản này.',
      granted: 'Bật',
      notGranted: 'Chưa cấp quyền',
      partial: 'Một phần dữ liệu không được chia sẻ',
    },

    provider: {
      apple_health: 'Apple Health',
      health_connect: 'Health Connect',
      demo: 'Dữ liệu mẫu',
    },

    zone: {
      easy: 'Nhẹ',
      steady: 'Đều',
      hard: 'Nặng',
      peak: 'Đỉnh',
    },

    kind: {
      run: 'Chạy bộ',
      walk: 'Đi bộ',
      hike: 'Leo núi',
      cycle: 'Đạp xe',
      swim: 'Bơi',
      badminton: 'Cầu lông',
      tennis: 'Quần vợt',
      football: 'Bóng đá',
      basketball: 'Bóng rổ',
      volleyball: 'Bóng chuyền',
      gym: 'Phòng gym',
      strength: 'Tập tạ',
      hiit: 'HIIT',
      yoga: 'Yoga',
      dance: 'Nhảy',
      martialArts: 'Võ thuật',
      rowing: 'Chèo thuyền',
      stairs: 'Leo cầu thang',
      other: 'Buổi tập',
    },

    unit: {
      kcal: '{{value}} kcal',
    },
  },

  auth: {
    choose: {
      email: 'Tiếp tục bằng email',
    },

    password: {
      signUpTitle: 'Chọn mật khẩu',
      signUpSubtitle: 'Cho {{email}}. Bạn sẽ dùng nó để đăng nhập lại.',
      signInTitle: 'Nhập mật khẩu của bạn',
      signInSubtitle: 'Đang đăng nhập với {{email}}.',

      field: 'MẬT KHẨU',
      confirmField: 'XÁC NHẬN MẬT KHẨU',
      placeholder: 'Ít nhất 8 ký tự',
      show: 'Hiện mật khẩu',
      hide: 'Ẩn mật khẩu',

      createAccount: 'Tạo tài khoản',
      signIn: 'Đăng nhập',
      forgot: 'Quên mật khẩu?',

      codeInstead: 'Gửi mã cho tôi thay vì vậy',

      haveAccount: 'Đã có tài khoản? Đăng nhập',
      needAccount: 'Mới ở đây? Tạo tài khoản',

      maybeExisting: 'Nếu địa chỉ này đã có tài khoản, hãy đăng nhập bên dưới hoặc yêu cầu một mã.',
    },

    verify: {
      title: 'Kiểm tra email của bạn',
      sentTo: 'Chúng tôi đã gửi mã 6 chữ số tới {{email}}. Mã cũng nằm ở tiêu đề thư.',
      sendingTo: 'Đang gửi mã 6 chữ số tới {{email}}...',

      field: 'MÃ',
      placeholder: '000000',
      submit: 'Tiếp tục',

      resend: 'Gửi lại',
      resendIn: 'Gửi lại sau {{seconds}}s',
      resent: 'Đã gửi. Kiểm tra email lần nữa.',
    },

    reset: {
      askTitle: 'Đặt lại mật khẩu',
      askSubtitle: 'Cho chúng tôi biết địa chỉ trên tài khoản và chúng tôi sẽ gửi một mã.',
      send: 'Gửi mã đặt lại cho tôi',

      newTitle: 'Chọn mật khẩu mới',
      newSubtitle: 'Sắp xong rồi. Chọn thứ bạn sẽ nhớ.',
      field: 'MẬT KHẨU MỚI',
      confirmField: 'XÁC NHẬN MẬT KHẨU MỚI',
      save: 'Lưu và đăng nhập',
      done: 'Đã đổi mật khẩu. Bạn đã đăng nhập.',
    },

    captcha: {
      title: 'Một kiểm tra nhanh',
      body: 'Cloudflare muốn xác nhận bạn là người thật. Chỉ mất một giây.',
    },

    ended: {
      title: 'Đã đăng xuất',
      body: 'Phiên này đã kết thúc. Đăng nhập lại để tiếp tục.',
    },

    errors: {
      passwordShort: 'Dùng ít nhất 8 ký tự.',
      passwordRequired: 'Nhập mật khẩu của bạn.',
      passwordMismatch: 'Hai mật khẩu không khớp nhau.',
      codeLength: 'Mã gồm 6 chữ số.',

      invalid_credentials: 'Email và mật khẩu không khớp. Thử lại, hoặc yêu cầu một mã.',
      email_not_confirmed: 'Xác nhận địa chỉ email của bạn trước. Chúng tôi đã gửi mã mới.',
      account_exists: 'Thử đăng nhập với địa chỉ này, hoặc để chúng tôi gửi một mã.',
      code_invalid: 'Mã đó sai hoặc đã hết hạn. Yêu cầu một mã mới.',
      weak_password: 'Mật khẩu đó quá dễ đoán. Thử một mật khẩu dài hơn.',
      same_password: 'Đó là mật khẩu bạn đang dùng. Chọn một mật khẩu khác.',
      rate_limited: 'Chờ một lát trước khi yêu cầu email khác.',
      rate_limited_in: 'Chờ {{seconds}} giây trước khi yêu cầu email khác.',
      captcha: 'Chúng tôi không xác nhận được bạn là người thật. Kiểm tra kết nối rồi thử lại.',
      offline: 'Không có kết nối. Thử lại khi bạn có mạng.',
      unknown: 'Có gì đó không ổn. Thử lại.',
    },
  },

  onboarding: {
    setup: {
      title: 'Trước khi bắt đầu',
      subtitle: 'Cả hai đều thay đổi ngôn ngữ và đơn vị của vài màn hình tiếp theo.',
      unitsTitle: 'ĐƠN VỊ',
      metric: 'Hệ mét',
      imperial: 'Hệ Anh',
      metricNote: 'Xăng ti mét và ki lô gam.',
      imperialNote: 'Foot, inch và pound.',
    },

    welcome: {
      title: 'Ứng dụng đếm calo làm cho người châu Á',
      subtitle: 'Nasi lemak, phở, laksa, cơm xá xíu.',
      perks: {
        track: { title: 'Theo dõi từng calo', subtitle: 'Chụp một tấm hoặc tìm trong vài giây' },
        habit: {
          title: 'Xây thói quen lành mạnh hơn',
          subtitle: 'Mục tiêu nhẹ nhàng, chuỗi ngày, không phán xét',
        },
        local: { title: '50.000 món châu Á', subtitle: 'Và 3 triệu gói, đọc bằng mã vạch' },
      },
      start: 'Bắt đầu',
      signIn: 'Tôi đã có tài khoản',
    },

    about: {
      title: 'Vài thông tin cơ bản',
      height: 'CHIỀU CAO',
      heightPlaceholder: '170',
      weight: 'CÂN NẶNG',
      weightPlaceholder: '65',
      feet: 'ft',
      inches: 'in',
      feetPlaceholder: '5',
      inchesPlaceholder: '9',
      inchesLabel: 'INCH',
      weightPlaceholderLb: '145',
      sex: 'GIỚI TÍNH',
      female: 'Nữ',
      male: 'Nam',
      age: 'TUỔI',
      agePlaceholder: '29',
      years: 'tuổi',
      targetWeight: 'CÂN NẶNG MỤC TIÊU',
      targetWeightUnset: '—',
      targetWeightHint: 'Kéo để đặt cân nặng bạn đang hướng tới.',
      targetWeightLocked: 'Nhập cân nặng của bạn trước.',
    },

    activity: {
      title: 'Một ngày của bạn vận động thế nào?',
      sedentary: { title: 'Chủ yếu ngồi', subtitle: 'Văn phòng, lái xe, học' },
      light: { title: 'Vận động nhẹ', subtitle: 'Đi bộ chút ít, việc nhà nhẹ' },
      onFeet: { title: 'Đứng cả ngày', subtitle: 'Bán hàng, điều dưỡng, công trường' },
      veryActive: { title: 'Rất năng động', subtitle: 'Tập gần như mỗi ngày' },
    },

    source: {
      title: 'Bạn biết tới chúng tôi từ đâu?',
      subtitle: 'Điều này giúp chúng tôi biết nên xuất hiện ở đâu tiếp theo.',
      xiaohongshu: 'XiaoHongShu',
      instagram: 'Instagram',
      tiktok: 'TikTok',
      youtube: 'YouTube',
      reddit: 'Reddit',
      facebook: 'Facebook',
      threads: 'Threads',
      appStore: 'App Store',
      googlePlay: 'Google Play',
      friend: 'Bạn bè hoặc gia đình',
      other: 'Nơi khác',
    },

    calculating: {
      title: 'Đang dựng kế hoạch cho bạn',
      subtitle: 'Tính từ câu trả lời của bạn, không phải số trung bình.',
      steps: {
        budget: 'Mục tiêu calo hằng ngày',
        macros: 'Tỷ lệ tinh bột, đạm và chất béo',
        catalogue: 'Khớp với món ăn của bạn',
      },
    },

    target: {
      title: 'Hạn mức hằng ngày của bạn',
      perDay: 'KCAL MỖI NGÀY',
      goalWeight: 'CÂN NẶNG ĐÍCH',
      goalBy: 'DỰ KIẾN ĐẠT',
      maintain: 'GIỮ NGUYÊN',
      maintainValue: 'Ổn định',
      looksRight: 'Nhìn ổn rồi',
      adjust: 'Sửa câu trả lời của tôi',
    },

    health: {
      title: 'Để đồng hồ đếm hộ bạn',
      subtitle: 'Lượng bạn đốt được cộng vào hạn mức hôm nay.',
      demo: 'Dùng hoạt động tạo sẵn',
      emptyToast: 'Health không trả về gì cả. Bạn có thể kết nối lại từ mục Hoạt động.',
      failedToast:
        'Chúng tôi không kết nối được kho sức khoẻ. Bạn có thể thử lại từ mục Hoạt động.',
      reassurance: 'Chỉ đọc. Chúng tôi không bao giờ ghi lại bất cứ điều gì.',
    },

    notifications: {
      title: 'Một lời nhắc đúng lúc',
      subtitle: 'Ba lời nhắc bữa ăn, theo giờ của riêng bạn.',
      meals: 'Nhắc bữa ăn',
      scans: 'Đĩa của bạn đã được tính',
      nothingElse: 'Và không có gì khác',
      promise: 'Tắt bất cứ mục nào trong Tôi, Lời nhắc.',
      blocked: 'Lời nhắc đang tắt cho RiceCal. Bạn có thể bật trong Tôi, Lời nhắc.',
    },

    tutorial: {
      appBar: 'RiceCal hoạt động thế nào',
      skip: 'Bỏ qua',
      next: 'Tiếp',
      done: 'Bắt đầu ghi',
      offerTitle: 'Mới ở đây?',
      offerBody: 'Một vòng 30 giây về cách ghi món ăn.',
      offerAction: 'Cho tôi xem',

      log: {
        title: 'Bốn cách ghi',
        subtitle: 'Chạm nút màu xanh ở Hôm nay, rồi chọn một cách.',
        snap: 'Chụp',
        snapBody: 'Một tấm ảnh của đĩa ăn',
        describe: 'Mô tả',
        describeBody: 'Gõ ra bạn đã ăn gì',
        search: 'Tìm',
        searchBody: 'Tìm theo tên',
        recipes: 'Công thức',
        recipesBody: 'Món bạn tự nấu',
        barcode: 'Có gói hàng? Máy ảnh cũng quét mã vạch.',
      },

      read: {
        title: 'Nó rơi vào ngày của bạn',
        subtitle: 'Chúng tôi gọi tên món, ước lượng khẩu phần và tính hộ bạn.',
        exampleName: 'Nasi lemak ayam',
        exampleDetail: '1 đĩa, 320 g',
        exampleKcal: '644',
        tip: 'Chụp thẳng từ trên xuống, lấy trọn cả đĩa vào khung.',
      },

      fix: {
        title: 'Sai à? Cứ nói ra',
        subtitle: 'Chạm vào mục đó, rồi chạm biểu tượng lấp lánh. Nói bình thường là đủ.',
        chipHalf: 'Nửa khẩu phần',
        chipNoRice: 'Không cơm',
        chipExtra: 'Thêm một đồ uống',
        typed: 'Tôi chỉ ăn nửa phần cơm',
        beforeLabel: 'TRƯỚC',
        before: '644',
        afterLabel: 'SAU',
        after: '498',
      },

      day: {
        title: 'Xem ngày của bạn đầy dần',
        subtitle: 'Vòng tròn là phần còn lại. Các thanh là tinh bột, đạm và chất béo.',
        ringCaption: 'KCAL CÒN LẠI',
        carbs: 'Tinh bột',
        protein: 'Đạm',
        fat: 'Chất béo',
        note: 'Vận động từ đồng hồ được cộng thêm vào, không bao giờ trừ đi.',
      },
    },

    saving: {
      title: 'Đang lưu câu trả lời của bạn…',
      offlineTitle: 'Đang chờ kết nối',
      offlineBody:
        'Câu trả lời của bạn an toàn trên máy này. Chúng tôi sẽ lưu ngay khi bạn có mạng.',
      failedTitle: 'Chúng tôi không lưu được câu trả lời của bạn',
      failedBody: 'Không mất gì cả. Kiểm tra kết nối rồi thử lại.',
    },

    account: {
      title: 'Lưu tiến trình của bạn',
      subtitle: 'Câu trả lời của bạn đã sẵn sàng. Một tài khoản giữ chúng an toàn nếu bạn đổi máy.',
      signInTitle: 'Chào mừng trở lại',
      signInSubtitle: 'Đăng nhập và nhật ký của bạn tiếp tục từ chỗ đang dở.',
      apple: 'Tiếp tục với Apple',
      google: 'Tiếp tục với Google',
      or: 'HOẶC',
      email: 'EMAIL',
      emailPlaceholder: 'you@email.com',
      errors: {
        email: 'Cái đó trông không giống một địa chỉ email.',
      },
    },
  },

  logging: {
    today: {
      title: 'Hôm nay',
      backToTodayA11y: 'Quay lại hôm nay',
      kcalLeft: 'KCAL CÒN LẠI',
      kcalOver: 'KCAL VƯỢT',
      kcalOfGoal: '/{{goal}} KCAL',
      showGoals: 'Hiện hạn mức của ngày',
      showLeft: 'Hiện phần còn lại',
      overNote: 'Hôm nay hơi quá một chút, mai tính lại từ đầu.',
      overNoteOn: 'Hôm đó hơi quá một chút.',
      burnedNote: '+{{kcal}} nhờ vận động hôm nay',
      burnedNoteOn: '+{{kcal}} nhờ vận động hôm đó',
      logHeading: 'ĐÃ ĂN · {{kcal}} KCAL',
      analysing: 'Đang đọc đĩa của bạn',
      analysingHint: 'Sẽ tính ngay khi biết đây là món gì',
      describing: 'Đang đọc điều bạn viết',
      describingRead: 'Đang đọc điều bạn viết…',
      scanningRead: 'Đang đọc đĩa của bạn…',
      scanningMatch: 'Đang tìm trong danh mục…',
      scanningPortion: 'Đang ước lượng khẩu phần…',
      scanningCount: 'Đang tính calo…',
      refiningApply: 'Đang áp dụng chỉnh sửa của bạn…',
      refiningCount: 'Đang tính lại calo…',
      scanDoneTitle: 'Đĩa của bạn đã được tính',
      describeDoneTitle: 'Bữa của bạn đã được tính',
      scanDoneBody: '{{food}} · {{kcal}} kcal',
      scanDoneBodyPlain: 'Chạm để xem có gì trong đó.',
      deleteEntry: 'Xoá',
      noFoodTitle: 'Không có món ăn nào trong ảnh này',
      noFoodTypedTitle: 'Không có món ăn nào trong điều bạn viết',
      noFoodHint: 'Không có gì được thêm vào ngày của bạn.',
      noFoodDismiss: 'Bỏ qua',
      analysisFailedTitle: 'Không đọc được cái này',
      analysisFailedHint: 'Chạm để tự chọn món',

      noBudgetTitle: 'Chưa có hạn mức hằng ngày',
      noBudgetBody: 'Đặt mục tiêu và vòng tròn sẽ có thứ để lấp đầy.',
      noBudgetAction: 'Đặt mục tiêu của tôi',
    },

    week: {
      a11y: {
        plain: '{{day}}',
        ahead: '{{day}}, chưa tới',
        under: '{{day}}, dưới mục tiêu',
        over: '{{day}}, trên mục tiêu',
        missed: '{{day}}, không có ghi chép',
      },
    },

    calendar: {
      showMonth: 'Xem cả tháng',
      showDay: 'Xem theo ngày',
      previousMonth: 'Tháng trước',
      nextMonth: 'Tháng sau',
      legend: {
        under: 'Dưới mục tiêu',
        over: 'Trên mục tiêu',
        missed: 'Không ghi',
      },
      dayHeading: '{{day}}',
      dayKcal: '{{kcal}} kcal',
      dayEmpty: 'Hôm đó không ghi gì.',
    },

    selector: {
      title: 'Ghi một món',
      remaining: 'còn {{count}} kcal',
      snap: 'Chụp',
      describe: 'Mô tả',
      search: 'Tìm',
    },

    capture: {
      tabs: 'Bạn đang hướng vào cái gì',
      meal: 'Bữa ăn',
      barcode: 'Mã vạch',
      scansLeft_zero: 'Hôm nay hết lượt chụp rồi. Mai sẽ có lại.',
      scansLeft_one: 'còn {{count}} lượt chụp hôm nay',
      scansLeft_other: 'còn {{count}} lượt chụp hôm nay',
    },

    barcode: {
      permissionTitle: 'Cho phép RiceCal dùng máy ảnh',
      permissionBody: 'Máy ảnh đọc mã vạch trên gói hàng. Không ghi lại và không tải lên gì cả.',
      aim: 'Hướng máy ảnh vào mã vạch trên gói hàng.',
      noCamera: 'Thiết bị này không có máy ảnh, nên ở đây không quét được gì.',
      failedTitle: 'Không có phản hồi',
      failed:
        'Lúc này chúng tôi không kết nối được tới danh mục. Gói hàng có thể vẫn ổn; kết nối thì không.',
      tryAgain: 'Quét lại',
      photographLabel: 'Chụp nhãn dinh dưỡng',
      labelPrompt:
        'Chúng tôi chưa có gói này. Hãy chụp nhãn dinh dưỡng và chúng tôi sẽ đọc giúp bạn.',
    },

    describe: {
      placeholder: 'Nasi lemak với gà rán và một ly trà sữa',
      send: 'Ghi bữa này',
    },

    camera: {
      title: 'Chụp đĩa của bạn',
      analysing: 'Đang xem trên đĩa có gì',
      permissionTitle: 'Cần quyền truy cập máy ảnh',
      permissionBody: 'RiceCal dùng máy ảnh để đọc đĩa của bạn. Không có gì rời khỏi máy bạn.',
      permissionSettings: 'Mở Cài đặt',
      shutter: 'Chụp ảnh',
      library: 'Chọn từ thư viện ảnh',
      flip: 'Đổi máy ảnh',
      captured: 'Tấm ảnh bạn vừa chụp',
      photoOf: 'Ảnh của {{food}}',
    },

    added: {
      toast: 'Đã thêm, {{kcal}} kcal',
      removedToast: 'Đã bỏ khỏi hôm nay',
    },

    search: {
      title: 'Tìm',
      placeholder: 'Tìm bất kỳ món nào',
      clear: 'Xoá tìm kiếm',
      tabs: 'Tìm trong nhóm món nào',
      tabCatalogue: 'Tất cả món ăn',
      tabMine: 'Món của tôi',
      mineEmptyTitle: 'Chưa ghi món nào',
      mineEmptyBody: 'Các bữa bạn ghi sẽ hiện ở đây, sẵn sàng để thêm lại.',
      mineNoMatchBody: 'Không có món nào bạn từng ăn khớp với từ đó.',
      mineOfflineBody: 'Nhật ký của bạn nằm trên máy chủ. Nó sẽ tải ngay khi bạn có mạng trở lại.',
      place: {
        mamak: 'Quán mamak',
        kopitiam: 'Quán cà phê',
        hawker: 'Hàng rong',
        packaged: 'Đóng gói',
        home: 'Nấu ở nhà',
      },
      emptyTitle: 'Không có món nào tên như vậy',
      emptyBody: 'Thử một từ ngắn hơn, hoặc bớt từ đi.',
      offlineTitle: 'Không có kết nối',
      offlineBody: 'Danh sách món nằm trên máy chủ. Việc này sẽ chạy ngay khi bạn có mạng lại.',
      errorTitle: 'Không tìm được',
      errorBody: 'Có gì đó không ổn khi tra cứu. Thử lại sau một lát.',
    },

    detail: {
      servings: 'Khẩu phần',
      typeServings: 'Gõ số lượng chính xác',
      total: 'TỔNG KCAL',
      moreNutrients: 'Thêm dưỡng chất',
      fibre: 'Chất xơ',
      sugar: 'Đường',
      sodium: 'Muối (natri)',
      milligrams: '{{value}}mg',
      fixTitle: 'Sửa bằng cách gõ',
      fixPlaceholder: 'không sambal, và chỉ nửa đĩa',
      fixAction: 'Sửa lại',
      fixNotApplied: 'Không áp dụng được. Thử diễn đạt lại',
      fixNoCalories: 'Điều đó không làm thay đổi calo, nên không có gì đổi',
      fixNotUnderstood: 'Không đọc được câu đó. Thử nói theo cách khác',
      fixNoMatch: 'Không xác định được món đó. Bữa ăn của bạn giữ nguyên',
      fixNoChange: 'Không có thứ gì trên đĩa khớp với điều đó',
      fixFailed: 'Không gửi được. Hãy thử lại',
      plateTitle: 'NGUYÊN LIỆU',
      plateHeading: 'Nguyên liệu',
      plateTotal: 'Tổng',
      plateNone: 'Món này đang tính là một thứ. Sửa để tách thành nguyên liệu.',
      addPart: 'Thêm một nguyên liệu',
      addPartTitle: 'Thêm một nguyên liệu',
      partAdded: 'Đã thêm {{food}} vào đĩa',
      addPartFailed: 'Không thêm được. Hãy thử lại',
      addPartTyped: 'Mục này dùng con số calo bạn tự nhập, nên không tách ra được',
      plateEmptied: 'Không còn gì trên đĩa. Mục này quay lại tính như một khẩu phần.',
      times: '× {{amount}}',
      grams: '({{grams}} g)',
      partKcal: '{{kcal}} kcal',
      gramsShort: '{{grams}} g',
      gramsField: 'Khối lượng tính bằng gam',
      lessOf: 'Bớt {{name}}',
      moreOf: 'Thêm {{name}}',
      removeOf: 'Bỏ {{name}}',
      replacePart: 'Thay',
      replaceOf: 'Thay {{name}}',
      partReplaced: '{{food}} đã thay vào đĩa',
      editKcal: 'Calo',
      figuresTitle: 'Số liệu của riêng bạn',
      macrosTitle: 'Dưỡng chất chính',
      editFigures: 'Sửa calo và dưỡng chất chính',
      editPlate: 'Sửa nguyên liệu',
      editDetails: 'Sửa tên, ngày và giờ',
      yourFigures: 'Số liệu của riêng bạn, không phải của ứng dụng.',
      nameField: 'Tên',
      numbersReset: 'Dùng số liệu của ứng dụng',
      servingWord: 'khẩu phần',
      quickFix: {
        halfPortion: 'Nửa khẩu phần',
        noSambal: 'Không sambal',
        addEgg: 'Thêm một quả trứng',
        extraRice: 'Thêm cơm',
      },
      editByHand: 'Tự sửa chi tiết',
      whenValue: '{{day}} lúc {{time}}',
      whenRow: 'Ngày',
      dayTitle: 'Ngày',
      timeTitle: 'Giờ',
      hour: 'Giờ',
      minute: 'Phút',
      am: 'sáng',
      pm: 'chiều',
      movedTo: 'Đã chuyển sang {{day}}',
      save: 'Lưu',
      saveFailed: 'Không lưu được những thay đổi đó',
      discardTitle: 'Thoát mà không lưu?',
      discardBody: 'Những gì bạn sửa ở đây sẽ bị bỏ và mục này giữ nguyên như cũ.',
      discardConfirm: 'Bỏ',
      deleteEntry: 'Xoá mục này',
      deleteTitle: 'Xoá mục này?',
      deleteBody: 'Nó ra khỏi hôm nay ngay và số đếm tăng trở lại.',
      addToDiary: 'Thêm vào nhật ký',
      decreaseServing: 'Bớt một',
      increaseServing: 'Thêm một',
      choosePicture: 'Chọn một hình cho mục này',
      addPicture: 'Chạm để thêm hình',
      photoFailed: 'Không lưu được tấm ảnh đó',
      replacePhoto: 'Thay ảnh chụp bằng hình vẽ',
      replacePhotoTitle: 'Thay ảnh của bạn?',
      replacePhotoBody:
        'Mục này giữ ảnh chụp hoặc hình vẽ, không giữ cả hai. Tấm ảnh đĩa thật của bạn sẽ mất vĩnh viễn.',
      replacePhotoConfirm: 'Chọn một hình',
      shareEntry: 'Chia sẻ bữa này',
    },

    share: {
      loggedBy: 'Ghi bởi',
      brand: 'RiceCal',
      text: '{{food}}, {{kcal}} kcal. Ghi bằng RiceCal',
      failed: 'Không tạo được tấm hình đó',
    },

    icon: {
      title: 'Chọn một hình',
      searchTab: 'Tìm',
      cameraTab: 'Máy ảnh',
      searchLabel: 'Tìm hình',
      searchPlaceholder: 'nasi lemak, trà sữa, cá',
      noMatch: 'Không có gì khớp với “{{query}}”.',
    },

    water: {
      title: 'Nước',
      count: '{{filled}} / {{goal}} ml',
      addTitle: 'Thêm nước',
      left: 'còn {{amount}} ml',
      add: 'Thêm {{amount}} ml',
      customLabel: 'Lượng khác',
      customPlaceholder: '600',
      customAdd: 'Thêm lượng này',
      customRemove: 'Trừ lượng này',
      added: '{{amount}} ml nước',
      removed: 'đã trừ {{amount}} ml',
      undo: 'Hoàn tác',
      level: 'Đã uống {{filled}} trên {{goal}} ml hôm nay',
    },
  },

  progress: {
    title: 'Xu hướng',

    ofDays: '{{done}} trên {{total}}',

    metric: {
      calories: 'Calo',
      water: 'Nước',
      weight: 'Cân nặng',
      caloriesUnit: 'trung bình',
      waterUnit: 'ml',
      none: '—',
      a11y: '{{metric}}, {{value}}',
    },

    range: {
      label: 'Khoảng',
      '7d': '7N',
      '30d': '30N',
      '1y': '1N',
      span7d: '7 ngày qua',
      span30d: '30 ngày qua',
      span1y: '12 tháng qua',
      week: 'T {{index}}',
      weekLong: 'Tuần {{index}}',
    },

    calories: {
      goalNote: 'Mục tiêu {{goal}} kcal mỗi ngày',
      goalNoteWeekly: 'Trung bình tuần, mục tiêu {{goal}} mỗi ngày',
      goalNoteMonthly: 'Trung bình tháng, mục tiêu {{goal}} mỗi ngày',
      noGoal: 'Chưa đặt hạn mức hằng ngày',
      under: 'thấp hơn {{value}}',
      over: 'cao hơn {{value}}',
      chart: 'Calo mỗi ngày, chia theo tinh bột, đạm và chất béo',

      grams: '{{value}} g',
      shareOfIntake: '{{value}}% lượng nạp vào',

      goalTitle: 'SO VỚI MỤC TIÊU CỦA BẠN',
      daysUnder: 'Số ngày dưới {{goal}}',
      daysLogged: 'Số ngày ghi đầy đủ',

      notableTitle: 'NHỮNG THÁNG ĐÁNG CHÚ Ý',
      monthAverage: 'trung bình {{value}}',

      emptyTitle: 'Không có bữa ăn nào trong khoảng này',
      emptyBody: 'Ghi một món và các cột sẽ hiện ra từ ngày bạn ghi.',
    },

    water: {
      dayNote: 'Mỗi cột là một ngày so với mục tiêu của bạn',
      weeklyNote: 'Mỗi cột là một tuần, lấy trung bình so với mục tiêu của bạn',
      monthlyNote: 'Mỗi cột là một tháng, lấy trung bình so với mục tiêu của bạn',
      goalPill: 'mục tiêu {{amount}}',
      chart: 'Nước mỗi ngày so với mục tiêu {{amount}}',

      reached: 'Đạt mục tiêu',
      short: 'Chưa đạt mục tiêu',

      goalDays: 'NGÀY ĐẠT',
      bestDay: 'NGÀY CAO NHẤT',
      bestMonth: 'THÁNG CAO NHẤT',
      yearAverage: 'TB NĂM',
      total: 'TỔNG',

      todayTitle: 'HÔM NAY',

      habitTitle: 'THÓI QUEN',
      daysAtLeast: 'Số ngày đạt {{amount}} trở lên',
      daysLogged: 'Số ngày có ghi',
      monthsAveraging: 'Số tháng trung bình {{amount}}+',
      monthsLogged: 'Số tháng có ghi',

      emptyTitle: 'Không có ghi chép uống nước trong khoảng này',
      emptyBody: 'Ghi một lần uống ở Hôm nay và phần này sẽ được lấp đầy.',
    },

    weight: {
      peakOn: '{{value}} {{unit}} vào {{date}}',
      peakIn: '{{value}} {{unit}} trong {{month}}',
      change: '{{value}} {{unit}}',
      chart: 'Cân nặng của bạn qua {{span}}',

      thisWeek: 'TUẦN NÀY',
      thisMonth: 'THÁNG NÀY',
      thisYear: 'NĂM NAY',
      average7: 'TB 7 NGÀY',
      average30: 'TB 30 NGÀY',
      lightest: 'NHẸ NHẤT',
      weighIns: 'SỐ LẦN CÂN',
      monthsLogged: 'SỐ THÁNG CÓ GHI',

      toGoal: 'còn {{value}} {{unit}} tới mục tiêu {{target}} {{unit}} của bạn',
      noTarget: 'Chưa đặt cân nặng mục tiêu',
      atGoal: 'Đã đạt cân nặng mục tiêu',
      weeksAway: 'khoảng {{count}} tuần',

      recentTitle: 'LẦN CÂN GẦN ĐÂY',
      add: 'Thêm',
      weekByWeek: 'THEO TỪNG TUẦN',
      byQuarter: 'THEO QUÝ',
      quarter: '{{from}} tới {{to}}',

      reading: '{{value}} {{unit}}',
      readingToday: 'Hôm nay',
      firstReading: 'Lần đầu',

      sheetTitle: 'Thêm cân nặng',
      sheetEditTitle: 'Lần cân ngày {{date}}',
      thisMorning: 'Sáng nay',
      down: 'giảm {{value}} {{unit}} so với {{day}}',
      up: 'tăng {{value}} {{unit}} so với {{day}}',
      same: 'Bằng với {{day}}',
      save: 'Lưu lần cân',
      saved: 'Đã lưu lần cân',
      remove: 'Xoá số đo này',
      removeTitle: 'Xoá số đo này?',
      removeBody:
        'Biểu đồ mất ngày này. Nếu đây là lần mới nhất, hạn mức của bạn quay về lần trước đó.',

      emptyTitle: 'Không có lần cân nào trong khoảng này',
      emptyBody: 'Một số đo vẽ được một điểm. Hai số đo mới vẽ được một đường.',
    },
  },

  profile: {
    home: {
      title: 'Tôi',
      memberSince: 'Thành viên từ {{month}}',
      streak: 'CHUỖI',
      goal: 'MỤC TIÊU',
      pro: 'RiceCal Pro',
      proTrial: 'Dùng thử kết thúc {{when}}',
      proTrialTomorrow: 'ngày mai',
      proTrialOn: 'vào {{date}}',
      noName: 'Tài khoản của bạn',
      signOutTitle: 'Đăng xuất?',
      signOutBody: 'Nhật ký của bạn vẫn an toàn. Đăng nhập lại trên bất kỳ máy nào để tiếp tục.',
      proTrialIn_one: 'trong {{count}} ngày',
      proTrialIn_other: 'trong {{count}} ngày',
      proActive: 'Gói {{plan}}, đang hoạt động',
      proActivePlain: 'Pro, đang hoạt động',
      proNone: 'Gói miễn phí',
      metric: 'Hệ mét',
      imperial: 'Hệ Anh',
      settings: 'CÀI ĐẶT',
      personalisation: 'Cá nhân hoá',
      goals: 'Mục tiêu và chỉ tiêu',
      goalsValue: '{{kcal}} kcal',
      reminders: 'Lời nhắc',
      remindersValue: '{{count}} đang bật',
      healthOff: 'Chưa kết nối',
      units: 'Ngôn ngữ và đơn vị',
      tutorial: 'RiceCal hoạt động thế nào',
      help: 'Trung tâm trợ giúp',
      rate: 'Đánh giá RiceCal',
      account: 'Tài khoản',
      signOut: 'Đăng xuất',
    },

    account: {
      title: 'Tài khoản',
      signedInAs: 'ĐANG ĐĂNG NHẬP BẰNG',
      legalTitle: 'ĐIỀU KHOẢN VÀ CHÍNH SÁCH',
      privacy: 'Chính sách quyền riêng tư',
      terms: 'Điều khoản sử dụng',
      deleteTitle: 'XÓA TÀI KHOẢN CỦA BẠN',
      deleteBody: 'Mọi thứ bên dưới sẽ bị xóa ngay khi bạn xác nhận.',
      goesDiary: 'Mọi bữa ăn, lần cân, nước và ghi chú',
      goesPhotos: 'Mọi ảnh bạn đã chụp',
      goesRecipes: 'Công thức của bạn, kể cả công thức đã đăng',
      goesProfile: 'Hồ sơ, cài đặt và thông tin đăng nhập của bạn',
      cancelFirst: 'Hãy hủy đăng ký trong cửa hàng trước, nếu không bạn vẫn bị tính phí.',
      action: 'Xóa tài khoản của tôi',
      confirmTitle: 'Xóa tài khoản của bạn?',
      confirmBody:
        'Không thể hoàn tác. Sau đó, nhật ký của bạn không thể khôi phục, dù là bạn hay chúng tôi.',
      done: 'Tài khoản của bạn đã bị xóa.',
      failed: 'Chúng tôi không xóa được tài khoản của bạn. Vui lòng thử lại.',
    },

    rate: {
      title: 'Bạn thấy RiceCal thế nào?',
      body: 'Câu trả lời của bạn quyết định điều chúng tôi làm tiếp theo.',
      yes: 'Tôi thích',
      no: 'Không hẳn',
      later: 'Để sau',
      feedbackTitle: 'Cần sửa điều gì?',
      feedbackBody:
        'Hãy nói với chúng tôi trên Discord. Phần lớn những gì có trong ứng dụng đều bắt đầu từ đó.',
      feedbackOpen: 'Mở Discord',
      feedbackSkip: 'Thôi',
    },

    help: {
      title: 'Ghé trò chuyện với chúng tôi',
      body: 'Máy chủ Discord của chúng tôi là nơi chúng tôi trả lời câu hỏi và quyết định sẽ làm gì tiếp theo.',
      logo: 'Discord',
      bug: 'Báo một lỗi',
      idea: 'Đề xuất một tính năng',
      ask: 'Hỏi chúng tôi bất cứ điều gì về RiceCal',
      action: 'Mở Discord',
      failed: 'Chúng tôi không mở được Discord',
    },

    shareEarn: {
      row: 'Chia sẻ và nhận Pro',
      title: 'Chia sẻ và nhận Pro',
      heroTitle: 'Đăng bài về RiceCal, nhận Pro',
      heroBody:
        'Cho mọi người xem một đĩa bạn đã ghi. Bài đăng càng nhiều lượt thích, Pro chúng tôi tặng càng dài.',

      platforms: 'ĐĂNG Ở',

      rewards: 'GIÁ TRỊ RA SAO',
      postReward: '1 tháng Pro',
      postBadge: '30+ thích',
      postBody: 'Bất kỳ bài công khai nào về ứng dụng, trên bất kỳ nền tảng nào ở đây.',
      likedReward: '1 năm Pro',
      likedBadge: '100+ thích',
      likedBody: 'Bài của bạn đã tới đúng người.',
      viralReward: 'Pro trọn đời',
      viralBadge: '500+ thích',
      viralBody: 'Bạn đã viral. Nó là của bạn, không gia hạn, không có gì để huỷ.',

      how: 'CÁCH THỨC',
      step1:
        'Đăng bài về RiceCal ở bất cứ đâu công khai. Ảnh chụp nhật ký của bạn, hoặc một đĩa bạn đã quét, là hiệu quả nhất.',
      step2: 'Cho nó vài ngày để gom lượt thích.',
      step3: 'Mang liên kết tới Discord của chúng tôi và chúng tôi gửi bạn một mã Pro.',

      claim: 'ĐÃ ĐĂNG RỒI?',
      claimBody: 'Thả liên kết vào Discord của chúng tôi, chúng tôi sẽ kiểm tra và gửi mã cho bạn.',
      claimAction: 'Mở Discord',

      finePrint:
        'Mỗi người một phần thưởng. Chúng tôi kiểm tra bài đăng có công khai không và đếm lượt thích lúc bạn nhận, nên hãy cho nó thời gian trước đã.',
      openFailed: 'Chúng tôi không mở được ứng dụng đó',
    },

    goals: {
      title: 'Mục tiêu và chỉ tiêu',
      dailyCalories: 'CALO HẰNG NGÀY',
      recommended: 'Khuyến nghị {{value}}',
      macroTargets: 'CHỈ TIÊU DƯỠNG CHẤT',
      macrosAddUpTo: 'Dưỡng chất cộng lại là {{value}} kcal',
      useRecommended: 'Dùng mức đề xuất',
      goal: 'MỤC TIÊU',
      currentWeight: 'Cân nặng hiện tại',
      targetWeight: 'Cân nặng mục tiêu',
      weeklyPace: 'Tốc độ mỗi tuần',
      paceLosing: 'Giảm {{value}} {{unit}}',
      paceGaining: 'Tăng {{value}} {{unit}}',
      paceHolding: 'Giữ ổn định',
      other: 'KHÁC',
      waterGoal: 'Mục tiêu nước',
      saved: 'Đã lưu chỉ tiêu',
    },

    personalisation: {
      title: 'Cá nhân hoá',
      mealsTitle: 'GIỜ ĂN',
      mealsNote: 'Đây là giờ các lời nhắc của bạn reo lên.',
      editMeal: 'Đổi giờ của {{meal}}',
      hour: 'Giờ',
      minute: 'Phút',
      preview: 'Nhắc lúc {{time}}',
    },

    reminders: {
      title: 'Lời nhắc',
      meals: 'BỮA ĂN',
      mealAt: '{{meal}} · {{time}}',
      habits: 'THÓI QUEN',
      water: 'Uống nước mỗi 2 giờ',
      weighIn: 'Cân vào thứ Hai',
      weeklyReport: 'Báo cáo tuần',
      monthlyReport: 'Báo cáo tháng',
      denied: 'Lời nhắc cần quyền thông báo.',
      blockedTitle: 'Thông báo đang tắt',
      blockedBody: 'Bật trong Cài đặt và các công tắc này sẽ hoạt động.',
      openSettings: 'Mở Cài đặt',
      push: {
        mealTitle: 'Tới giờ {{meal}} rồi',
        mealBody: 'Ghi lại khi còn nhớ. Mất mười giây thôi.',
        waterTitle: 'Kiểm tra nước',
        waterBody: 'Hôm nay uống được bao nhiêu nước rồi?',
        weighInTitle: 'Cân buổi sáng',
        weighInBody: 'Cân ngay khi ngủ dậy cho số đo ổn định nhất.',
        weeklyTitle: 'Một tuần của bạn qua món ăn',
        weeklyBody: 'Bảy ngày ghi chép, gói trong một màn hình.',
        monthlyTitle: 'Một tháng của bạn qua món ăn',
        monthlyBody: 'Bốn tuần, và kết quả của chúng.',
      },
    },

    preferences: {
      title: 'Ngôn ngữ và đơn vị',
      language: 'NGÔN NGỮ',
      languageLabel: 'Ngôn ngữ ứng dụng',
      units: 'ĐƠN VỊ',
      weight: 'Cân nặng',
      kg: 'kg',
      lb: 'lb',
      energy: 'Năng lượng',
      kcal: 'kcal',
      kj: 'kJ',
      appearance: 'GIAO DIỆN',
      light: 'Sáng',
      dark: 'Tối',
      auto: 'Tự động',
    },

    subscription: {
      title: 'Gói đăng ký',
      pro: 'RiceCal Pro',
      trialLeft_one: 'Dùng thử miễn phí, còn {{count}} ngày',
      trialLeft_other: 'Dùng thử miễn phí, còn {{count}} ngày',
      renews: 'Gia hạn ở mức {{price}}.',
      neverRenews: 'Trả một lần. Không có gì gia hạn.',
      freeBody:
        '{{scans}} lượt quét mỗi ngày, {{recipes}} công thức, và xu hướng của tuần vừa rồi.',
      whatYouGet: 'BẠN ĐƯỢC GÌ VỚI PRO',
      included: 'BAO GỒM',
      cancel: 'Huỷ đăng ký',
      cancelTitle: 'Huỷ gói đăng ký của bạn?',
      cancelBody: 'Bạn vẫn giữ Pro tới hết kỳ. Nhật ký của bạn vẫn đọc được dù thế nào.',
      cancelConfirm: 'Huỷ gói',
      switchMonthly: 'Đổi sang hằng tháng',
      switchYearly: 'Đổi sang hằng năm',
      manage: 'Quản lý trong cửa hàng',
      switched: 'Đã cập nhật gói',
    },
  },

  paywall: {
    couldNotCheck: 'Chúng tôi không kiểm tra được gói đăng ký của bạn. Thử lại sau một lát.',

    plans: {
      yearly: 'Hằng năm',
      perMonth: '{{price}} mỗi tháng',
      yearlyBadge: 'TIẾT KIỆM {{percent}}%',
      yearlyBilling: 'Tính phí mỗi năm',
      monthly: 'Hằng tháng',
      monthlyBilling: 'Tính phí mỗi tháng',
      lifetime: 'Trọn đời',
      lifetimeDetail: 'Trả một lần, của bạn mãi mãi',
    },

    hard: {
      appBar: 'RiceCal Pro',
      title: 'Không giới hạn với RiceCal Pro',
      assurance: 'Không ràng buộc, huỷ bất cứ lúc nào',
      assuranceLifetime: 'Trả một lần, hoàn tiền qua cửa hàng',
      smallPrintYearly: 'Miễn phí 7 ngày, sau đó {{price}} mỗi năm.',
      smallPrintMonthly: 'Miễn phí 7 ngày, sau đó {{price}} mỗi tháng.',
      smallPrintLifetime: 'Trả một lần {{price}}. Không phải đăng ký, không gia hạn.',
      smallPrintPending: 'Miễn phí 7 ngày.',
      start: 'Bắt đầu dùng thử miễn phí',
      startLifetime: 'Mua quyền trọn đời',
      restore: 'Khôi phục giao dịch',
      terms: 'Điều khoản',
      privacy: 'Quyền riêng tư',
      nothingToRestore: 'Không có gì để khôi phục trên tài khoản này',
      notConfigured: 'Bản dựng này chưa thiết lập việc mua hàng.',
      restored: 'Giao dịch của bạn đã trở lại',
    },

    table: {
      title: 'MIỄN PHÍ SO VỚI PRO',
      free: 'Miễn phí',
      pro: 'Pro',
      rows: {
        snap: {
          label: 'Chụp một đĩa',
          free: '{{scans}}/ngày',
          pro: 'Không giới hạn',
        },
        describe: {
          label: 'Nói ra bạn đã ăn gì',
          free: '',
          pro: '',
        },
        barcode: {
          label: 'Quét một gói hàng',
          free: '',
          pro: '',
        },
        search: {
          label: 'Tìm trong cơ sở dữ liệu món ăn',
          free: '',
          pro: '',
        },
        fix: {
          label: 'Sửa một bữa bằng cách mô tả',
          free: '',
          pro: '',
        },
        suggest: {
          label: 'Hỏi nên ăn gì tiếp',
          free: '',
          pro: '',
        },
        recipes: {
          label: 'Lưu món bạn nấu',
          free: '{{recipes}} công thức',
          pro: 'Không giới hạn',
        },
        recipeFill: {
          label: 'Điền công thức từ một tấm ảnh',
          free: '',
          pro: '',
        },
        budget: {
          label: 'Hạn mức calo hợp với bạn',
          free: '',
          pro: '',
        },
        health: {
          label: 'Apple Health và Health Connect',
          free: '',
          pro: '',
        },
        reminders: {
          label: 'Nhắc bữa ăn',
          free: '',
          pro: '',
        },
        trends: {
          label: 'Xu hướng',
          free: '7 ngày',
          pro: 'Tới một năm',
        },
        reviews: {
          label: 'Tổng kết tuần và tháng',
          free: 'Tuần gần nhất',
          pro: 'Tất cả',
        },
        photos: {
          label: 'Ảnh bữa ăn của bạn',
          free: '{{days}} ngày',
          pro: 'Không giới hạn',
        },
      },
    },

    intro: {
      title: 'Xong hết rồi. Bắt đầu ghi nhé?',
      body: 'Mọi thứ đều chạy mà không cần nó. Pro chỉ gỡ bỏ giới hạn.',
      later: 'Có thể để sau',
    },

    reminder: {
      title_one: 'còn {{count}} ngày trong đợt dùng thử',
      title_other: 'còn {{count}} ngày trong đợt dùng thử',
      body: 'Bạn đã ghi {{days}} ngày liên tiếp và giảm {{kg}} kg. Cứ giữ đà này.',
      daysLogged: 'NGÀY ĐÃ GHI',
      meals: 'BỮA ĂN',
      kgDown: 'KG GIẢM',
      starts: 'Gói của bạn bắt đầu {{date}} với giá {{price}} mỗi năm.',
      keep: 'Giữ gói của tôi',
      manage: 'Quản lý gói đăng ký',
    },

    ended: {
      heading: 'Hôm nay',
      previewMode: 'Chế độ xem thử',
      title: 'Đợt dùng thử của bạn đã kết thúc',
      body: '{{days}} ngày lịch sử của bạn vẫn an toàn và vẫn đọc được.',
      dataWaiting: 'DỮ LIỆU CỦA BẠN ĐANG CHỜ',
      days: 'NGÀY',
      meals: 'BỮA ĂN',
      kgDown: 'KG GIẢM',
      lockedEntry: 'Đã khoá',
      resume: 'Tiếp tục với Pro',
      terms: '{{price}} mỗi năm, tự động gia hạn cho đến khi bạn hủy.',
      termsPending: 'Tự động gia hạn hằng năm cho đến khi bạn hủy.',
      browse: 'Tiếp tục xem miễn phí',
    },

    limit: {
      freeReached: 'Đó là {{count}} lượt quét của bạn hôm nay. Pro quét bao nhiêu tuỳ bạn.',
      proReached: 'Bạn đã chạm giới hạn quét của hôm nay. Vui lòng liên hệ quản trị viên.',
      notEntitledDetail: 'Gói đăng ký của bạn không còn hoạt động.',
      confirming: 'Giao dịch của bạn đang được xử lý. Chờ một lát rồi thử lại.',
      feature: {
        camera: 'Quét thêm một đĩa nữa hôm nay cần RiceCal Pro.',
        describe: 'Nói ra bạn đã ăn gì cần RiceCal Pro.',
        refine: 'Sửa một bữa bằng cách mô tả cần RiceCal Pro.',
        read_recipe: 'Điền công thức từ một tấm ảnh cần RiceCal Pro.',
        new_recipe: 'Giữ hơn {{recipes}} công thức cần RiceCal Pro.',
        suggest: 'Hỏi nên ăn gì tiếp cần RiceCal Pro.',
        trend_range: 'Nhìn lại xa hơn một tuần cần RiceCal Pro.',
        review: 'Đọc một bản tổng kết cũ hơn cần RiceCal Pro.',
        nudge: 'RiceCal Pro gỡ bỏ giới hạn.',
      },
    },

    checking: 'Chờ một chút, chúng tôi đang kiểm tra gói của bạn.',

    welcome: {
      title: 'Bạn vào rồi. Ăn thôi.',
      body: '7 ngày miễn phí của bạn bắt đầu từ bây giờ. Mọi thứ đã mở khoá.',
      bodyActive: 'Mọi thứ đã mở khoá.',
      bodyLifetime: 'RiceCal Pro là của bạn mãi mãi. Mọi thứ đã mở khoá.',
      perks: {
        log: 'Chụp, quét hoặc nói',
        database: 'Mọi món và mọi gói',
        suggest: 'Hỏi nên ăn gì',
      },
      manageNote: 'Quản lý hoặc huỷ bất cứ lúc nào ở Hồ sơ, Gói đăng ký.',
      manageNoteLifetime: 'Trả một lần. Không có gì để gia hạn hay huỷ.',
      start: 'Tới nhật ký của tôi',
    },
  },

  recipes: {
    shelf: {
      mine: 'Của tôi',
      official: 'Chính thức',
      community: 'Cộng đồng',
    },

    heading: {
      mine: 'Công thức của tôi',
      official: 'Bếp RiceCal',
      community: 'Từ cộng đồng',
    },

    search: {
      official: 'Tìm công thức chính thức',
      community: 'Tìm công thức công khai',
      mine: 'Tìm công thức của tôi',
      clear: 'Xoá tìm kiếm',
      none: 'Không có gì tên như vậy',
      noneBody: 'Thử một từ ngắn hơn, hoặc một phần tên món.',
    },

    empty: {
      mineTitle: 'Chưa có công thức nào',
      mineBody:
        'Một nồi ăn chung không có sẵn khẩu phần. Nhập những gì đã cho vào và nồi đó đủ cho mấy người, một lần thôi, và từ đó ghi lại chỉ mất một chạm.',
      officialTitle: 'Bếp đang trống',
      officialBody: 'Công thức từ chúng tôi sẽ xuất hiện ở đây.',
      communityTitle: 'Chưa ai chia sẻ',
      communityBody: 'Công thức mọi người để công khai sẽ xuất hiện ở đây.',
    },

    servings_one: '{{count}} khẩu phần',
    servings_other: '{{count}} khẩu phần',
    ingredients_one: '{{count}} nguyên liệu',
    ingredients_other: '{{count}} nguyên liệu',
    savedTimes_one: 'được lưu {{count}} lần',
    savedTimes_other: 'được lưu {{count}} lần',
    byAuthor: '{{name}} · {{saves}}',
    fromAuthor: 'Từ {{name}}',
    someCook: 'Một người',

    new: {
      title: 'Công thức mới',
      scanLabel: 'Ảnh',
      describeLabel: 'Mô tả',
      scanTitle: 'Điền từ một tấm ảnh',
      or: 'HOẶC TỰ ĐIỀN',
      describeTitle: 'Mô tả nó',
      describePlaceholder:
        'Cà ri gà. 600g đùi gà, một hộp nước cốt dừa, 3 củ khoai tây. Đủ cho 4 người.',
      describeHint: 'Định lượng và đủ cho mấy người là hai thứ đáng gõ nhất.',
      describeAction: 'Điền vào biểu mẫu',
      describeFailed: 'Chúng tôi không đọc được cái đó. Tự điền bên dưới nhé.',
      scanFailed: 'Chúng tôi không đọc được cái đó. Tự điền bên dưới nhé.',

      readingPhoto: 'Đang đọc ảnh của bạn…',
      readingText: 'Đang đọc điều bạn viết…',
      readingIngredients: 'Đang xem đã cho những gì vào…',
      readingPortions: 'Đang ước lượng khẩu phần…',
      readingSteps: 'Đang viết các bước…',
      readingHint: 'Chờ một lát. Bạn sửa được mọi thứ khi nó xong.',
    },

    edit: {
      title: 'Sửa công thức',
      name: 'TÊN',
      namePlaceholder: 'Bạn gọi nó là gì?',
      picture: 'HÌNH',
      changePicture: 'Đổi hình',
      replacePhotoTitle: 'Dùng hình vẽ thay thế?',
      replacePhotoBody: 'Ảnh chụp của công thức này sẽ bị xoá.',
      replacePhotoConfirm: 'Dùng hình vẽ',
      servings: 'BAO NHIÊU KHẨU PHẦN',
      ingredients: 'NGUYÊN LIỆU',
      ingredientsCount: 'NGUYÊN LIỆU · {{count}}',
      ingredientsEmpty: 'Chưa có gì. Tìm từng thứ và chúng tôi cộng cả nồi hộ bạn.',
      addIngredient: 'Thêm một nguyên liệu',
      steps: 'BẠN NẤU THẾ NÀO',
      stepsPlaceholder: 'Mỗi dòng một bước. Xuống dòng và chúng tôi đánh số hộ bạn.',
      stepsHint: 'Mỗi dòng mới trở thành bước được đánh số tiếp theo.',
      stepsSheetTitle: 'Bạn nấu thế nào',
      stepsEditAction: 'Sửa các bước',
      stepsEdit_one: 'Sửa các bước, {{count}} bước',
      stepsEdit_other: 'Sửa các bước, {{count}} bước',
      stepsWrite: 'Viết cách bạn nấu',
      save: 'Lưu công thức',
      saved: 'Đã lưu công thức',
      nameRequired: 'Đặt tên cho nó trước đã',
      saveFailed: 'Không lưu được. Thử lại.',
      limitReached: 'Tài khoản miễn phí giữ {{count}} công thức. Pro không giới hạn.',
      totalLabel: 'Mỗi khẩu phần, {{count}}',
      totalWhole: 'Cả nồi {{kcal}} kcal',
      discardTitle: 'Thoát mà không lưu?',
      discardBody: 'Những thay đổi bạn làm ở đây sẽ mất.',
      discardConfirm: 'Bỏ',
    },

    ingredient: {
      title: 'Thêm nguyên liệu',
      search: 'Tìm một nguyên liệu',
      ownTitle: 'Thêm nguyên liệu của riêng bạn',
      ownBody: 'Không có trong danh sách? Đặt tên và nhập calo cho nó.',
      customBody: 'Cho những thứ chỉ bếp nhà bạn có. Đọc trên bao bì hoặc cân một lần.',
      name: 'TÊN',
      namePlaceholder: 'Đây là gì?',
      calories: 'CALO',
      macros: 'DƯỠNG CHẤT, NẾU BẠN BIẾT',
      amount: 'ĐÃ CHO VÀO BAO NHIÊU',
      add: 'Cho vào nồi',
      remove: 'Bỏ ra',
      change: 'Đổi lượng {{name}}, hiện là {{measure}}',
      unit: {
        g: 'g',
        ml: 'ml',
        piece_one: 'cái',
        piece_other: 'cái',
      },
    },

    detail: {
      servingLabel_one: 'khẩu phần',
      servingLabel_other: 'khẩu phần',
      portion: {
        half: 'Một nửa',
        one: '1 khẩu phần',
        two: '2 khẩu phần',
        pot: 'Cả nồi',
      },
      ofServings: '{{count}} TRÊN {{total}} KHẨU PHẦN',
      steps: 'TÔI NẤU THẾ NÀO',
      stepsFrom: '{{name}} NẤU THẾ NÀO',
      noSteps: 'Không có bước nào được viết ra.',
      ingredients: 'NGUYÊN LIỆU',
      addToDay: 'Thêm vào hôm nay',
      added: 'Đã thêm vào ngày của bạn',
      saveCopy: 'Lưu vào công thức của tôi',
      savedCopy: 'Đã lưu vào công thức của bạn',
      saveCopyFailed: 'Không lưu được cái đó. Thử lại.',
      goneTitle: 'Không tìm thấy công thức',
      goneBody:
        'Có thể nó đã bị xoá, hoặc được đặt riêng tư trở lại. Xin một liên kết mới từ người đã chia sẻ.',
      official: 'Từ bếp RiceCal',
      delete: 'Xoá công thức',
      deleteTitle: 'Xoá công thức này?',
      deleteBody: 'Những bữa bạn đã ghi từ nó vẫn nằm trong nhật ký.',
      deleted: 'Đã xoá công thức',
    },

    report: {
      title: 'Báo cáo công thức này',
      body: 'Công thức này sẽ không hiện với bạn nữa, ngay lập tức. Người nấu không được báo.',
      inappropriate: 'Phản cảm hoặc không phải đồ ăn',
      spam: 'Spam hoặc quảng cáo',
      dangerous: 'Không an toàn để nấu hoặc ăn',
      stolen: 'Là công sức của người khác',
      block: 'Ẩn mọi thứ của {{name}}',
      done: 'Đã báo cáo. Bạn sẽ không thấy nó nữa.',
      blocked: 'Đã ẩn. Bạn sẽ không thấy công thức của họ nữa.',
      failed: 'Không thực hiện được. Vui lòng thử lại.',
    },

    share: {
      action: 'Chia sẻ',
      title: 'Chia sẻ công thức này',
      body: 'Bất kỳ ai có liên kết đều xem được nguyên liệu, các bước và calo, và lưu một bản của riêng họ. Của bạn vẫn là của bạn.',
      publicTitle: 'Đặt công khai',
      publicBody: 'Nó vào tab cộng đồng để bất kỳ ai cũng tìm và lưu được.',
      publishFailed: 'Không đổi được. Thử lại.',
    },

    review: {
      checking: 'Đang kiểm tra công thức của bạn…',
      approved: 'Công thức của bạn đã vào cộng đồng',
      rejected: 'Không được đăng: {{reason}}',
      rejectedPlain: 'Chúng tôi không đăng được cái này.',
      pending: 'Chúng tôi vẫn đang xem cái này. Nó sẽ hiện ra khi được duyệt.',
      badgePending: 'Đang duyệt',
      badgeRejected: 'Không được đăng',
      badgePublic: 'Công khai',
    },

    log: {
      action: 'Công thức',
      empty: {
        mine: 'Chưa có công thức nào. Thêm một cái và ghi lại chỉ mất một chạm.',
        official: 'Trong bếp chưa có gì.',
        community: 'Chưa ai chia sẻ. Công thức mọi người để công khai sẽ hiện ra ở đây.',
      },
    },
  },

  reviews: {
    title: 'Tổng kết',

    entry: {
      title: 'Tổng kết',
      subtitle: 'Nhìn lại một tuần hoặc một tháng',
    },

    kind: {
      week: 'Hằng tuần',
      month: 'Hằng tháng',
      label: 'Độ dài tổng kết',
    },

    list: {
      weekMeta: 'Tuần {{index}}',
      weekSummary: '{{kcal}} kcal mỗi ngày, ghi {{done}} trên {{total}}',
      monthMeta: '{{weeks}} tuần, ghi {{done}} trên {{total}} ngày',
      monthSummary: '{{kcal}} kcal mỗi ngày',
      monthSummaryWeight: '{{kcal}} kcal mỗi ngày, {{weight}}',
      summaryEmpty: 'Không có ghi chép',
      a11y: '{{title}}, {{meta}}, {{summary}}',
      a11yLocked: '{{title}}, {{meta}}, {{summary}}, Pro',

      emptyWeekTitle: 'Chưa có tuần nào để nhìn lại',
      emptyWeekBody:
        'Một tuần xuất hiện ở đây khi nó kết thúc và bạn đã ghi ít nhất bốn ngày của tuần đó.',
      emptyMonthTitle: 'Chưa có tháng nào để nhìn lại',
      emptyMonthBody:
        'Một tháng xuất hiện ở đây khi nó kết thúc và bạn đã ghi ít nhất mười hai ngày của tháng đó.',
    },

    share: {
      card: 'Chia sẻ {{card}}',
      preview: 'Thẻ đúng như lúc nó được gửi đi',
    },

    story: {
      close: 'Đóng',
      share: 'Chia sẻ',
      missingTitle: 'Bản tổng kết đó không có ở đây',
      missingBody: 'Có thể đó là một tuần quá ít dữ liệu để nhìn lại.',
    },

    card: {
      brand: 'RiceCal',
      kcalADay: 'kcal mỗi ngày',
      under: '{{value}} dưới mục tiêu',
      over: '{{value}} trên mục tiêu',
      onBudget: 'Vừa đúng hạn mức',
      logged: 'ĐÃ GHI',
      loggedValue: '{{done}} trên {{total}}',
      streak: 'CHUỖI',
      streakValue_one: '{{count}} ngày',
      streakValue_other: '{{count}} ngày',
      weightChange: 'CÂN NẶNG',
      noWeight: '—',
      shareText: '{{period}}: {{kcal}} kcal mỗi ngày, ghi {{done}} trên {{total}} ngày. RiceCal',
    },

    food: {
      title: 'NHỮNG ĐĨA LỚN NHẤT',
      macros: 'DƯỠNG CHẤT MỖI NGÀY',
      grams: '{{value}} g',
      share: '{{value}}% năng lượng',
    },

    calories: {
      average: 'TRUNG BÌNH MỖI NGÀY',
      kcal: 'kcal',
      under: 'thấp hơn {{value}}',
      over: 'cao hơn {{value}}',
      goalNote: 'Mục tiêu {{goal}}. Dưới mức đó trong {{done}} trên {{total}} ngày.',
      noGoal: 'Khi đó chưa có hạn mức hằng ngày nào.',
      everyDay: 'MỖI NGÀY',
      everyWeek: 'MỖI TUẦN',
      chart: 'Calo mỗi ngày, chia theo tinh bột, đạm và chất béo',
      lightest: '{{day}}, NHẸ NHẤT',
      heaviest: '{{day}}, NẶNG NHẤT',
      pastWeeks: 'NĂM TUẦN GẦN NHẤT',
      pastMonths: 'NĂM THÁNG GẦN NHẤT',
      noData: '—',
    },

    body: {
      weight: 'CÂN NẶNG',
      weighIns_one: 'Một lần cân',
      weighIns_other: '{{count}} lần cân',
      weightChart: 'Cân nặng trong kỳ',
      steps: 'BƯỚC MỖI NGÀY',
      stepGoal: '{{done}} trên {{total}} ngày vượt {{goal}} bước',
      stepsChart: 'Bước mỗi ngày',
      others: 'KHÁC',
      water: 'Nước',
      waterValue: '{{amount}} mỗi ngày',
      waterNote_one: 'Đầy vào một ngày',
      waterNote_other: 'Đầy vào {{count}} ngày',
      move: 'Số phút vận động',
      moveNote_one: 'Một buổi tập',
      moveNote_other: '{{count}} buổi tập',
      moveNoteNone: 'Không có buổi tập nào được ghi',
      burn: 'Đốt mỗi ngày',
      burnValue: '{{value}} kcal',
      distanceValue: 'đi được {{value}} km',
    },
  },

  suggest: {
    card: {
      title: 'Chưa biết ăn gì?',
    },

    ask: {
      title: 'Bạn đang muốn gì?',
      meal: 'BỮA',
      focus: 'DƯỠNG CHẤT',
      cuisine: 'ẨM THỰC',
      limit: 'GIỚI HẠN CALO',
      editCuisines: 'Sửa danh sách ẩm thực',
      addCuisine: 'Thêm một nền ẩm thực',
      addCuisinePlaceholder: 'Thái, Nyonya, Nhật',
      removeCuisine: 'Bỏ {{cuisine}}',
      kcal: 'kcal',
      less: 'Bớt calo',
      more: 'Thêm calo',
      leftToday: 'còn {{kcal}}',
      healthy: 'Nhẹ hơn',
      anything: 'Gì cũng được',
      healthyA11y: 'Nghiêng về những món nhẹ hơn',
      action: 'Gợi ý gì đó đi',
    },

    picks: {
      title: 'Gợi ý cho {{meal}}',
      thinking: 'Đang tìm gì đó cho {{meal}}',
      thinkingA11y: 'Đang nghĩ xem nên gợi ý gì',
      summary: '{{focus}}, {{cuisine}}, dưới {{kcal}} kcal',
      protein: '{{grams}}g đạm',
      retry: 'Thử lại',
      emptyTitle: 'Không nghĩ ra gì cả',
      emptyBody: 'Hỏi lại, hoặc nới lỏng một trong các lựa chọn.',
    },

    detail: {
      unit: 'KCAL, {{portion}}',
      leftAfter: 'còn {{kcal}} kcal sau đó',
      overAfter: 'vượt {{kcal}} kcal sau đó',
      why: 'VÌ SAO MÓN NÀY HỢP',
      protein: 'Đạm',
      carbs: 'Tinh bột',
      fat: 'Chất béo',
      sodium: 'Natri',
    },

    meal: {
      breakfast: 'Bữa sáng',
      lunch: 'Bữa trưa',
      dinner: 'Bữa tối',
      snack: 'Ăn vặt',
    },
    mealFor: {
      breakfast: 'bữa sáng',
      lunch: 'bữa trưa',
      dinner: 'bữa tối',
      snack: 'bữa ăn vặt',
    },
    focus: {
      protein: 'Đạm',
      balanced: 'Cân bằng',
      carbs: 'Tinh bột',
    },
    focusShort: {
      protein: 'Nhiều đạm',
      balanced: 'Cân bằng',
      carbs: 'Nhiều tinh bột',
    },

    sodium: {
      low: 'thấp',
      medium: 'trung bình',
      high: 'cao',
    },

    ready_one: '{{count}} gợi ý đã sẵn sàng',
    ready_other: '{{count}} gợi ý đã sẵn sàng',
    readyAction: 'Xem ngay',

    failed: 'Không lấy được gợi ý nào. Thử lại sau một lát.',
  },
} satisfies Bundle
