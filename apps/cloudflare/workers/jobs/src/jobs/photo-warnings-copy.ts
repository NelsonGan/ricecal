/**
 * The photo warning's push, in each account's own language. A plain notice,
 * with no Pro pitch: a promotional push needs its own opt-in on the App Store,
 * and the list it opens carries the offer instead. The app's strings
 * live on the phone and this is written before the phone is awake, so the few
 * words it needs are carried here, as the groups function carries its own.
 */
type Copy = {
  title: string
  body: (count: number, when: string) => string
  by: (weekday: string) => string
  today: string
  tomorrow: string
}

const COPY: Record<string, Copy> = {
  en: {
    title: 'Meal photos expiring',
    body: (n, w) =>
      n === 1 ? `1 meal photo will be removed ${w}.` : `${n} meal photos will be removed ${w}.`,
    by: (d) => `by ${d}`,
    today: 'today',
    tomorrow: 'tomorrow',
  },
  ms: {
    title: 'Foto makanan akan dipadam',
    body: (n, w) => `${n} foto makanan akan dipadam ${w}.`,
    by: (d) => `menjelang ${d}`,
    today: 'hari ini',
    tomorrow: 'esok',
  },
  'zh-Hans': {
    title: '餐食照片即将删除',
    body: (n, w) => `${n} 张餐食照片将于${w}删除。`,
    by: (d) => `${d}前`,
    today: '今天',
    tomorrow: '明天',
  },
  'zh-Hant': {
    title: '餐點照片即將刪除',
    body: (n, w) => `${n} 張餐點照片將於${w}刪除。`,
    by: (d) => `${d}前`,
    today: '今天',
    tomorrow: '明天',
  },
  id: {
    title: 'Foto makanan akan dihapus',
    body: (n, w) => `${n} foto makanan akan dihapus ${w}.`,
    by: (d) => `paling lambat ${d}`,
    today: 'hari ini',
    tomorrow: 'besok',
  },
  th: {
    title: 'รูปอาหารกำลังจะถูกลบ',
    body: (n, w) => `รูปอาหาร ${n} รูปจะถูกลบ${w}`,
    by: (d) => `ภายใน${d}`,
    today: 'วันนี้',
    tomorrow: 'พรุ่งนี้',
  },
  vi: {
    title: 'Ảnh bữa ăn sắp bị xóa',
    body: (n, w) => `${n} ảnh bữa ăn sẽ bị xóa ${w}.`,
    by: (d) => `trước ${d}`,
    today: 'hôm nay',
    tomorrow: 'ngày mai',
  },
  fil: {
    title: 'Mabubura na ang mga larawan ng pagkain',
    body: (n, w) => `${n} larawan ng pagkain ang mabubura ${w}.`,
    by: (d) => `bago mag-${d}`,
    today: 'ngayong araw',
    tomorrow: 'bukas',
  },
  ja: {
    title: '食事の写真がまもなく削除されます',
    body: (n, w) => `${n} 枚の食事の写真が${w}削除されます。`,
    by: (d) => `${d}までに`,
    today: '今日',
    tomorrow: '明日',
  },
  ko: {
    title: '식사 사진이 곧 삭제돼요',
    body: (n, w) => `식사 사진 ${n}장이 ${w} 삭제돼요.`,
    by: (d) => `${d}까지`,
    today: '오늘',
    tomorrow: '내일',
  },
  hi: {
    title: 'भोजन की फ़ोटो हटने वाली हैं',
    body: (n, w) => `${n} भोजन फ़ोटो ${w} हटा दी जाएँगी।`,
    by: (d) => `${d} तक`,
    today: 'आज',
    tomorrow: 'कल',
  },
  ta: {
    title: 'உணவுப் படங்கள் விரைவில் நீக்கப்படும்',
    body: (n, w) => `${n} உணவுப் படங்கள் ${w} நீக்கப்படும்.`,
    by: (d) => `${d}க்குள்`,
    today: 'இன்று',
    tomorrow: 'நாளை',
  },
  bn: {
    title: 'খাবারের ছবি মুছে যাবে',
    body: (n, w) => `${n}টি খাবারের ছবি ${w} মুছে ফেলা হবে।`,
    by: (d) => `${d}-এর মধ্যে`,
    today: 'আজ',
    tomorrow: 'আগামীকাল',
  },
}

/** The calendar day of an instant in a zone, as YYYY-MM-DD. */
function dayIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant)
}

/**
 * "by Friday", "tomorrow" or "today", in the account's own zone and language.
 * A zone or language Intl cannot read falls back to Kuala Lumpur and English
 * rather than dropping the push.
 */
function when(copy: Copy, language: string, timeZone: string, removesBy: Date, now: Date): string {
  let zone = timeZone
  try {
    dayIn(now, zone)
  } catch {
    zone = 'Asia/Kuala_Lumpur'
  }
  const target = dayIn(removesBy, zone)
  if (target <= dayIn(now, zone)) return copy.today
  if (target === dayIn(new Date(now.getTime() + 86_400_000), zone)) return copy.tomorrow
  let weekday: string
  try {
    weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: zone }).format(
      removesBy,
    )
  } catch {
    weekday = new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: zone }).format(removesBy)
  }
  return copy.by(weekday)
}

export type WarningTarget = {
  token: string
  language: string
  timezone: string
  photo_count: number
  removes_by: string
}

export function warningPush(target: WarningTarget, now: Date) {
  // Own keys only: the language is free text an app writes, and '__proto__'
  // or 'toString' would otherwise find the object's prototype.
  const lang = Object.hasOwn(COPY, target.language) ? target.language : 'en'
  const copy = COPY[lang]
  return {
    to: target.token,
    title: copy.title,
    body: copy.body(
      target.photo_count,
      when(copy, lang, target.timezone, new Date(target.removes_by), now),
    ),
    sound: 'default',
    data: { kind: 'photos' },
  }
}

export const WARNING_LANGUAGES = Object.keys(COPY)
