// A type-only import, erased at build time, so nothing about the layering
// between `lib` and `data` changes. See `activity_level` in `PersonProps` for
// why this property in particular has to be a union rather than a string.
import type { Cuisine } from '@/data/suggestions'
import type { ActivityLevel, Meal } from '@/data/types'

/**
 * THE TRACKING PLAN, AS A TYPE.
 *
 * Every event the app sends is declared here with the exact properties it
 * carries, and `track` accepts nothing else. This is the same argument
 * `data/keys.ts` makes about query keys: an analytics event is a string agreed
 * between a call site and a chart nobody in this repo can see, so a typo does
 * not fail — it produces a second event with almost the right name, and the
 * dashboard built on the first one silently stops counting half the traffic.
 *
 * A property added here is a property every existing call site has to supply.
 * That is deliberate: the alternative is an event whose shape depends on where
 * it was fired from, which is the analytics equivalent of a nullable column
 * nobody can explain.
 *
 * WHAT IS NOT HERE, and why:
 *
 * - **Purchases.** RevenueCat funnels its own events into Mixpanel, and it is
 *   the only party that actually knows whether a transaction settled. What we
 *   send is the INTENT either side of the store sheet — `Purchase Started` and
 *   `Purchase Abandoned` — which RevenueCat cannot see, because the store never
 *   tells it about a purchase that did not happen.
 * - **Screen views.** An automatic screen-view per route would be the largest
 *   event stream in the app and would answer almost nothing: the interesting
 *   screens already have an event of their own (`Paywall Shown`,
 *   `Log Sheet Opened`, `Review Opened`), and the rest are navigation, not
 *   behaviour.
 * - **Errors.** Sentry has them. A failure that is also a PRODUCT fact — a scan
 *   that found no food, a barcode nothing knows, a request refused for want of
 *   budget — travels as an `outcome` property on the event it belongs to.
 * - **Numbers off the diary.** No calorie totals, no weights, no dish names, no
 *   search text. They are health data, they are not needed to answer any
 *   question below, and Postgres already holds every one of them next to the
 *   arithmetic that produced it. `food_scan_items` and `food_scan_misses` are
 *   where scan quality is measured; this is where BEHAVIOUR is measured.
 * - **Sessions and installs.** `trackAutomaticEvents` is on, so `$ae_session`,
 *   `$ae_first_open` and `$ae_updated` arrive without an event of ours.
 */

/** How an entry reached the diary. The one property most reports break down by. */
export type LogMethod = 'camera' | 'describe' | 'search' | 'barcode' | 'recipe' | 'quick_add'

/**
 * Which button was refused, when the paywall came up because of one.
 *
 * The point of naming these is to find out which capability actually sells the
 * app, which is not something the paywall screen can know about itself.
 */
export type ProFeature =
  /**
   * The daily scan allowance ran out. NOT "the camera is behind the paywall" —
   * it is not, and that is the freemium change: a free account photographs
   * three plates a day. This is what a fourth one reports, and it is the single
   * most interesting trigger in the funnel, because it is the only refusal that
   * happens to somebody already using the app the way it is meant to be used.
   */
  | 'camera'
  | 'describe'
  | 'refine'
  | 'read_recipe'
  | 'new_recipe'
  /** "What should I eat?" — the model asked for five things, on Today. */
  | 'suggest'
  /** A range on Trends that a free account cannot see: 30 days, or a year. */
  | 'trend_range'
  /** An older weekly or monthly review. The latest one is free. */
  | 'review'
  /** The standing offer on launch, which no button refused. See `useProNudge`. */
  | 'nudge'

/** Which of the four paywalls. `hard` is `/paywall`, reached from a refusal. */
export type PaywallScreen = 'hard' | 'intro' | 'reminder' | 'ended'

export type Plan = 'monthly' | 'yearly' | 'lifetime'

/**
 * How a photographed or typed meal turned out.
 *
 * `detached` is the one that needs explaining: the request broke but the edge
 * function writes the entry itself, so the scan is very probably still running
 * and this process simply stopped hearing about it. Counting those as failures
 * is how a scan that succeeded was reported as an error. See `data/snap.ts`.
 */
export type ScanOutcome =
  | 'logged'
  | 'no_food'
  | 'failed'
  | 'detached'
  | 'limit_reached'
  | 'not_entitled'

/**
 * `email` is a mailed code or link; `password` is a typed one. They are counted
 * apart because the choice between them is the question the sign-in screen
 * exists to answer, and one number covering both cannot answer it.
 */
export type SignInMethod = 'apple' | 'google' | 'email' | 'password'

/**
 * What the calorie plan is FOR, which is the whole of what the two weights say.
 * Sent instead of the weights themselves: it is the only part of them any
 * segment would be built on.
 */
export type PlanDirection = 'lose' | 'gain' | 'maintain'

/** An event that carries nothing. Written out so the call site still says `{}`. */
type NoProps = Record<string, never>

/**
 * Every event, and its properties.
 *
 * Names are Title Case and past tense — Mixpanel's own convention, and the one
 * its UI sorts and groups by. Properties are snake_case for the same reason.
 */
export type Events = {
  // ── Onboarding and the account ───────────────────────────────────────────
  /** "Get started" on the welcome screen. The top of the whole funnel. */
  'Onboarding Started': NoProps
  /**
   * One question answered. ONE EVENT WITH A `step` PROPERTY rather than nine
   * events, so the funnel is built by breaking one thing down rather than by
   * remembering to add the tenth event when a tenth screen appears.
   */
  'Onboarding Step Completed': { step: string; step_number: number }
  /**
   * The profile write landed. Everything before this is a stranger.
   *
   * `referral_source` is on the event as well as on the person, because the
   * question "which channel produces accounts that finish" is a breakdown of
   * this event and cannot be answered by a property that only exists on the
   * profile. It is one of a fixed list of platforms, not free text.
   */
  'Onboarding Completed': { plan_direction: PlanDirection; referral_source: string }
  /** The email was accepted and the code sent. The other half is `Signed In`. */
  'Login Link Requested': NoProps
  /**
   * A reset was asked for. No address on it, and no answer either: this fires
   * whether or not the account exists, because Supabase does not say and
   * neither does the screen.
   *
   * Worth counting on its own rather than as a failed sign-in. It is the
   * measure of how much the password is costing people, which is the number
   * that decides whether offering one was right.
   */
  'Password Reset Requested': NoProps
  'Signed In': { method: SignInMethod; is_new_account: boolean }
  /**
   * Includes the user closing Apple's own sheet, which is not an error and is
   * exactly the number worth knowing. Real exceptions go to Sentry as well.
   */
  'Sign In Failed': { method: SignInMethod; reason: 'cancelled' | 'unavailable' | 'error' }
  'Signed Out': NoProps

  // ── Logging ──────────────────────────────────────────────────────────────
  /**
   * The log button, or a route that opened the sheet directly.
   *
   * `date_offset` is days back from today: 0 is the ordinary case and anything
   * else is somebody filling in a day they missed, which is the question this
   * property exists to answer.
   */
  'Log Sheet Opened': { panel: string; date_offset: number }
  /**
   * A meal went on the day.
   *
   * Fired when the app HAS PUT A MEAL ON THE DAY. For search, a recipe, a
   * packet and a quick add that is the insert succeeding; for the camera and
   * the describe panel it is the optimistic row appearing, because the entry is
   * written server-side and the diary already shows it.
   *
   * So this over-counts the two scan paths by exactly the scans that came back
   * with nothing edible or failed outright. The correction is one subtraction —
   * `Meal Scan Completed` where `outcome` is `no_food` or `failed` — and it is
   * spelt out here because the alternative, tracking the scan paths only once
   * the cascade answers, would silently DROP every meal whose request broke
   * while the edge function went on writing it.
   */
  'Meal Logged': { method: LogMethod; date_offset: number }
  /**
   * What the cascade did with a photographed or typed meal.
   *
   * `tier` is the cascade's own tier for the first entry (1 dish, 2 components,
   * 4 estimate, 5 archetype) and is the single most useful number here: it says
   * how often the catalogue actually answers rather than being guessed past.
   */
  'Meal Scan Completed': {
    method: 'camera' | 'describe'
    outcome: ScanOutcome
    duration_ms: number
    tier: number | null
    components: number
  }
  /**
   * A barcode was read and looked up. `not_found` is the interesting value —
   * see `d1/food-catalogue/BARCODE-COVERAGE.md` for why Malaysian packets are
   * the thin part of the catalogue and what this number is evidence for.
   */
  'Barcode Scanned': { outcome: 'found' | 'not_found' | 'error' }
  /** Save on the food detail screen. `changed` names what actually moved. */
  'Entry Updated': { changed: string[] }
  'Entry Deleted': { source: string }
  /**
   * The sparkle: a correction described in words.
   *
   * `from_chip` separates the suggested corrections from the typed ones, which
   * is the difference between the chips being useful and being decoration.
   */
  'Entry Refined': {
    outcome: 'applied' | 'not_applied' | 'failed' | 'limit_reached' | 'not_entitled'
    from_chip: boolean
    duration_ms: number
  }

  // ── The catalogue ────────────────────────────────────────────────────────
  /**
   * A search the user stopped typing at. NOT one per keystroke and not one per
   * prefix: only the query a burst of typing settled on, because "nas" finding
   * nothing says nothing about the catalogue.
   *
   * The text itself is deliberately absent. What people type and cannot find is
   * worth capturing, and the place to capture it is the Worker, which is
   * already authenticated and rate limited and is where the rest of the
   * catalogue-widening backlog lives.
   */
  'Food Searched': { results: number; query_length: number }
  /**
   * A result was opened. `position` is 1-based rank, and its distribution is
   * the live version of what `pnpm foods:gate` measures against thirty fixed
   * queries.
   */
  'Food Picked': { position: number; results: number }

  // ── Money, up to the store sheet and no further ──────────────────────────
  /**
   * `trigger` is the refused button for `/paywall`, and the screen's own reason
   * for the other three. There is no `Paywall Dismissed`: a paywall that was
   * shown and not followed by a purchase IS the dismissal.
   */
  'Paywall Shown': { screen: PaywallScreen; trigger: ProFeature | PaywallScreen }
  /**
   * The model answered "what should I eat?".
   *
   * The two CHOICES and how many came back, and nothing else — no dish names,
   * no calorie figures, no budget. Which is the diary rule holding rather than
   * an omission: what is worth knowing here is which sitting and which kitchen
   * people actually ask about, so the cuisine list can stop being a guess.
   * `count` is 0 when the model would not answer, which is the only way to see
   * that failure from outside.
   */
  'Suggestions Shown': { meal: Meal; cuisine: Cuisine; count: number }

  'Plan Selected': { screen: PaywallScreen; plan: Plan }
  /** The store sheet was asked for. RevenueCat reports what happened after. */
  'Purchase Started': { screen: PaywallScreen; plan: Plan }
  /**
   * The store sheet closed with nothing bought. RevenueCat cannot see this —
   * it only hears about transactions that happened — so it is the one half of
   * the purchase funnel that has to come from here.
   */
  'Purchase Abandoned': {
    screen: PaywallScreen
    plan: Plan
    reason: 'cancelled' | 'unavailable' | 'error'
  }
  'Restore Requested': { outcome: 'restored' | 'nothing' | 'unavailable' }
  /**
   * Share & Earn: a platform shortcut was tapped, and the Discord claim was
   * opened.
   *
   * The two ends of a funnel nothing else can see. The middle of it — whether
   * anybody actually posted — happens in somebody else's app and is not ours to
   * know, so these two numbers and the count of codes we hand out in Discord
   * are the whole measurement. Which PLATFORM is the interesting half: it says
   * where this app's users actually are, which is a question no other event in
   * the plan answers.
   */
  'Share Platform Opened': { platform: string }
  'Share Claim Opened': NoProps

  // ── The habit features ───────────────────────────────────────────────────
  /**
   * `granted: false` is a refused permission sheet, which is a different
   * problem from a store that granted access and returned no days.
   */
  'Health Connected': { provider: string; granted: boolean; days: number }
  'Health Disconnected': { provider: string }
  'Reminder Toggled': { meal: string; enabled: boolean }
  /** The only re-engagement surface in the app, so the taps are worth counting. */
  'Notification Opened': { kind: 'weekly' | 'monthly' }
  /** Typed by the user. A reading synced from a health store is not an action. */
  'Weight Logged': NoProps
  'Recipe Saved': { is_new: boolean; ingredients: number; servings: number }
  /** The form filled in from a photograph or a sentence, before any save. */
  'Recipe Drafted': {
    source: 'photo' | 'text'
    outcome: 'drafted' | 'empty' | 'failed' | 'limit_reached' | 'not_entitled'
  }
  /**
   * `pending` is not a third verdict, it is the review having failed to run —
   * and it leaves the recipe public and invisible, which is the failure mode
   * worth watching.
   */
  'Recipe Published': { outcome: 'approved' | 'rejected' | 'pending' }
  'Recipe Copied': NoProps
  'Review Opened': { kind: 'week' | 'month' }
  /**
   * The share sheet came back having actually shared something.
   *
   * WHICH card is deliberately not on it. A story lays out three or four cards
   * per step and each is its own `Shareable`, so naming them would mean a stable
   * slug plumbed through two components and every step — and the question that
   * pays for itself first is simply whether the loop is used at all.
   */
  'Review Card Shared': { kind: 'week' | 'month' }
  /**
   * One logged meal left the app as a picture.
   *
   * `picture` is the SHAPE of the card rather than anything off the diary: a
   * meal shared as a photograph and one shared as an illustration are two
   * different products, and if nobody ever sends the second the card is really
   * a photo feature. Nothing about the dish, the calories or the day is here.
   *
   * Same caveat as `Review Card Shared`: this is a real send on iOS and every
   * tap on Android, which has no way to report what became of a share intent.
   */
  'Meal Shared': { picture: 'photo' | 'drawing' }
}

export type EventName = keyof Events

/**
 * The user properties this app sets, and nothing else.
 *
 * No name and no body figures. Every one of these is either a stated PREFERENCE,
 * a fact about which parts of the app are switched on, or — in the single case
 * of `$email` below — the address the account itself is keyed on. Nothing off
 * the diary is here, and that half of the rule has not moved.
 */
export type PersonProps = {
  /**
   * The address on the Supabase account, and the one identifier here that names
   * a real person.
   *
   * It is Mixpanel's RESERVED spelling on purpose: a plain `email` is an
   * ordinary property, while `$email` is the field the profile list shows, the
   * search box looks in, and the messaging tools send to. Written any other way
   * it would be a column nobody finds.
   *
   * Set from `identifyUser` alone, from the address on the session, so it moves
   * with the account rather than with whatever screen last had one to hand. It
   * is the same value RevenueCat is given, which is what lets somebody writing
   * in about a purchase be found on both dashboards — see `lib/revenuecat.ts`.
   *
   * `undefined` for an account whose provider supplied no address, rather than
   * an empty string: Mixpanel would file that as a profile whose email is blank
   * and offer it in a breakdown, which is a worse answer than not knowing.
   */
  $email?: string
  onboarded?: boolean
  onboarded_at?: string
  plan_direction?: PlanDirection
  /**
   * The CLIENT's spelling, and only that one.
   *
   * Two places set this — `finish.tsx` from the onboarding draft, and
   * `useAnalyticsIdentity` from the stored profile — and the draft holds
   * `veryActive` where the column holds `very_active`. As a `string` the two
   * quietly disagreed, and a breakdown on activity showed six values for four
   * answers, split by nothing more meaningful than which write happened last.
   * Typed, that mismatch is a compile error.
   */
  activity_level?: ActivityLevel
  /**
   * Which of a fixed list of platforms brought this account in. Free text is
   * deliberately not offered — "somewhere else" is the escape, and it keeps
   * this a breakdown rather than a tag cloud.
   */
  referral_source?: string
  /** The store the account reads movement from, or null once disconnected. */
  health_provider?: string | null
  /** How many of the three meal reminders are switched on. */
  meal_reminders?: number
}

/**
 * There are deliberately NO people counters here — no `meals_logged`, no
 * `recipes_created`. Mixpanel builds a cohort from an event count directly
 * ("did Meal Logged at least ten times"), so a counter would be a second,
 * hand-maintained answer to a question the event stream already answers — and
 * one that has to decide for itself whether a scan that failed halfway counts.
 *
 * The properties above are the ones that CANNOT be derived from events: facts
 * about the person, stated once.
 */

/**
 * Properties stamped on EVERY event.
 *
 * Only one, and it earns its place: whether this account is paying is the cut
 * every other report wants, and a super property is the only way to get it
 * without adding a paid/free property to twenty event definitions.
 */
export type SuperProps = {
  entitled: boolean
}
