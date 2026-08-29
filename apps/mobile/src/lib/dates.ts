import { currentLanguage, type Language } from '@/i18n'

/**
 * Date and time patterns, per language. date-fns localises every token it is
 * given and cannot localise the order they are written in, which is half of what
 * makes a date readable: `'EEE d MMM'` produced "周一 17 8月" in Chinese, long
 * enough that the Today title ellipsised.
 *
 * Patterns rather than copy, which is why they are here and not in `src/i18n`:
 * the letters are date-fns tokens, so anybody editing them is reordering tokens
 * rather than translating. A bundle of strings that must not be translated is a
 * trap for the next person in it.
 *
 * Only the languages that write dates in a different order appear below.
 */
export type DatePattern =
  /** "5:30 pm" */
  | 'time'
  /** "Mon 5:30 pm" — a session in a list already grouped by day. */
  | 'weekdayTime'
  /** "Thursday 14" — a day heading inside a month the reader can see. */
  | 'weekdayDay'
  /** "Mon 17 Aug" — the Today title on a day that is not today. */
  | 'weekdayDayMonth'
  /** "Monday 17 August" — spoken, for a calendar cell's screen-reader label. */
  | 'weekdayDayMonthLong'
  /** "17 Aug" */
  | 'dayMonth'
  /** "17 August" */
  | 'dayMonthLong'
  /** "17 Aug 2026" */
  | 'dayMonthYear'
  /** "August 2026" */
  | 'monthYear'

/** Day then month, twelve hour clock. English, and every language that agrees. */
const DEFAULT: Record<DatePattern, string> = {
  time: 'h:mm a',
  weekdayTime: 'EEE h:mm a',
  weekdayDay: 'EEEE d',
  weekdayDayMonth: 'EEE d MMM',
  weekdayDayMonthLong: 'EEEE d MMMM',
  dayMonth: 'd MMM',
  dayMonthLong: 'd MMMM',
  dayMonthYear: 'd MMM yyyy',
  monthYear: 'MMMM yyyy',
}

/**
 * Largest unit first, and the day/month markers written out.
 *
 * `M月d日` rather than `MMM d`: date-fns already renders `MMM` as "8月" in
 * these locales, so `MMM d日` would print the marker twice for Chinese and
 * Japanese. The explicit numeric form says what it means in all three.
 *
 * The meridiem leads the time rather than trailing it, which is where 上午 and
 * 오전 go.
 */
const CJK: Record<DatePattern, string> = {
  time: 'a h:mm',
  weekdayTime: 'EEE a h:mm',
  weekdayDay: 'd日 EEEE',
  weekdayDayMonth: 'M月d日 EEE',
  weekdayDayMonthLong: 'M月d日 EEEE',
  dayMonth: 'M月d日',
  dayMonthLong: 'M月d日',
  dayMonthYear: 'yyyy年M月d日',
  monthYear: 'yyyy年M月',
}

/** The same shape, in the markers Korean uses. */
const KO: Record<DatePattern, string> = {
  time: 'a h:mm',
  weekdayTime: 'EEE a h:mm',
  weekdayDay: 'd일 EEEE',
  weekdayDayMonth: 'M월 d일 EEE',
  weekdayDayMonthLong: 'M월 d일 EEEE',
  dayMonth: 'M월 d일',
  dayMonthLong: 'M월 d일',
  dayMonthYear: 'yyyy년 M월 d일',
  monthYear: 'yyyy년 M월',
}

const BY_LANGUAGE: Partial<Record<Language, Record<DatePattern, string>>> = {
  'zh-Hans': CJK,
  'zh-Hant': CJK,
  ja: CJK,
  ko: KO,
}

/**
 * The pattern to hand `format()`, for the language the app is set in.
 *
 * Read at call time rather than passed down, for the same reason `t` is: the
 * screens that format a date re-render on `languageChanged` already, and
 * threading a locale through every chart axis and row would be a prop nobody
 * reads.
 */
export function datePattern(pattern: DatePattern): string {
  return (BY_LANGUAGE[currentLanguage()] ?? DEFAULT)[pattern]
}
