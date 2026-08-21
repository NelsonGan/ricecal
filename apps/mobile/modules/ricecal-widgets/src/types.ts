/**
 * What a home screen widget is allowed to know, and the shape it arrives in.
 *
 * A widget process is not the app. It gets a few milliseconds, no session, no
 * network worth relying on and no react-query cache, so everything it draws has
 * to be sitting in shared storage before it wakes up. This type is that store.
 *
 * TWO RULES SHAPED IT, and both are the same rule from different ends:
 *
 * 1. **The widget does no arithmetic.** Every bar arrives as a `fraction`
 *    already clamped to 0..1 and every figure as the string to print. A ring
 *    that divided for itself would be a second implementation of the sum on
 *    Today, in another language, and the two would disagree the first time
 *    movement extended the budget.
 * 2. **The widget does no formatting.** `toLocaleString`, the pounds/kilograms
 *    preference and the real minus sign in a weight change are all decided in
 *    the app, where they already are. Native code that formatted its own
 *    numbers would be an English-only copy of `features/progress/units.ts`.
 *
 * The one number the widget reads rather than prints is `water.ml`, because the
 * two preset buttons add to it in place — see `WidgetAction`.
 */

/** A bar, as the widget draws it: how full, and what to write beside it. */
export type WidgetBar = {
  /** 0..1, clamped in the app. Over budget is a full bar, never a longer one. */
  fraction: number
  /** The figure, already formatted. */
  label: string
}

/** One line of the large widget's meal list. */
export type WidgetEntry = {
  name: string
  /** "640", without the unit: the widget draws "kcal" in its own small type. */
  kcal: string
}

export type WidgetSnapshot = {
  /**
   * Bumped when a field changes shape.
   *
   * The store outlives the build that wrote it — a widget keeps rendering the
   * last snapshot while the app updates underneath it — so native code checks
   * this and draws the placeholder rather than a half-read layout.
   */
  version: 1
  /** When the app last wrote this, as milliseconds since the epoch. */
  updatedAt: number
  /**
   * The day the figures describe, `yyyy-MM-dd`, in the phone's own zone.
   *
   * Not decoration: the widget compares it against the current date and shows
   * its "open RiceCal" placeholder once they differ, so a phone left alone
   * overnight does not present yesterday's total as today's.
   */
  date: string
  /**
   * The palette to draw in, following the app's own choice rather than the
   * system's. `system` means "whatever the phone is doing", which is what a
   * widget does by default anyway.
   */
  theme: 'light' | 'dark' | 'system'
  /**
   * False until onboarding computes a budget. Every widget that draws against
   * one says so instead of drawing a ring around nothing — the same decision
   * Today makes with `targets === null`.
   */
  hasBudget: boolean

  kcal: {
    /** "613", or "148" when over: the sign is in `over`, not in the figure. */
    left: string
    /** "1,847" — what has been eaten. */
    eaten: string
    /** "2,100" — the budget, movement included. */
    budget: string
    /** Eaten against the budget, 0..1. */
    fraction: number
    /** Past the budget. The ring turns and the copy changes; the bar stays full. */
    over: boolean
  }

  macros: {
    carbs: WidgetBar
    protein: WidgetBar
    fat: WidgetBar
  }

  water: {
    /** Millilitres on the day. READ, not printed: the presets add to it. */
    ml: number
    /** The goal in millilitres, for the same reason. */
    goalMl: number
    /** "1,250" */
    label: string
    /** "of 2,000 ml" */
    goalLabel: string
    fraction: number
  }

  /**
   * Null on an account that has never been weighed, which is not an error: the
   * widget offers to record one instead of drawing an empty chart.
   */
  weight: {
    /** "68.4", in whichever unit the account prefers. */
    value: string
    /** "kg" or "lb". */
    unit: string
    /** "−1.8 kg", with a real minus sign. Empty when nothing has moved. */
    change: string
    /**
     * Whether that change is a gain, which is what decides the pill's colour.
     *
     * A COLOUR THE APP OWNS, like every other verdict here. Trends paints a
     * gain in kaya and a loss in pandan, so a widget that painted both green
     * would be the same figure disagreeing with itself one tap away. The
     * widget cannot work it out for itself either: `change` is a formatted
     * string by the time it arrives.
     *
     * Meaningless when `change` is empty, since nothing is drawn then.
     */
    up: boolean
    /**
     * Eight weekly averages, oldest first, each 0..1 against the range they
     * span. The last is the current week and is drawn in pandan.
     *
     * Fewer than eight when the history is shorter. Never more.
     */
    weeks: number[]
  } | null

  /** The day's meals, newest last, capped at what the large widget can show. */
  entries: WidgetEntry[]
}

/**
 * Something the user did on the widget that the app still owes the server.
 *
 * A widget cannot reach Supabase: it has no session, and a `+250` that waited
 * for a round trip would be a button that does nothing for a second and then
 * maybe fails. So the tap writes here and bumps `water.ml` in the snapshot, and
 * the app drains this queue the next time it is in front of somebody.
 *
 * `at` is the tap, not the drain, and `date` is the day the tap belonged to.
 * A drink logged at 11pm and synced at 8am the next morning goes on the night
 * it was drunk.
 */
export type WidgetAction = {
  /** One kind so far. The field is what keeps a second one cheap. */
  type: 'water'
  /** Millilitres added. Always positive: the widget offers no undo. */
  ml: number
  /** `yyyy-MM-dd`, in the phone's zone at the moment of the tap. */
  date: string
  /** Milliseconds since the epoch, for ordering a queue that drained late. */
  at: number
}

/**
 * The widgets this app publishes, in the app's own words.
 *
 * The native side has its own identifiers — a WidgetKit `kind`, an Android
 * provider class — and `installedWidgets()` translates to these before anything
 * else sees them. That is deliberate: these strings end up in Mixpanel, and a
 * breakdown should not be reading `RiceCalQuickLogWidgetProvider`.
 */
export type WidgetKind = 'kcal' | 'water' | 'weight' | 'day' | 'quick_log' | 'today'

export const WIDGET_KINDS: readonly WidgetKind[] = [
  'kcal',
  'water',
  'weight',
  'day',
  'quick_log',
  'today',
]
