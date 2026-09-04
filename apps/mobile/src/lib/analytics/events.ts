// Type-only imports, so nothing about the layering around `lib` changes. They
// are also the only types this file borrows rather than declaring: each is a
// union somebody else owns, where a copy here would drift from what the
// dashboard groups by.
import type { WidgetKind } from '@modules/ricecal-widgets'
import type { ActivityLevel, Meal, ReportReason } from '@/data/types'
// The trigger list and the skip reasons are the rating gate, so a trigger added
// there and forgotten here should be a compile error.
import type { RatingSkipReason, RatingTrigger } from '@/lib/rating/state'

/**
 * The kitchens this file is willing to name, and one word for all the rest.
 *
 * A closed union rather than `Cuisine`, which is a free string now: see
 * `Suggestions Shown`. `trackedCuisine` in `features/suggest` maps one to the
 * other, and it is the only thing that may.
 */
export type TrackedCuisine = 'malay' | 'chinese' | 'indian' | 'custom'

/**
 * The tracking plan, as a type.
 *
 * Every event the app sends is declared here with the properties it carries,
 * and `track` accepts nothing else. An event name is a string agreed between a
 * call site and a chart nobody in this repo can see, so a typo does not fail: it
 * produces a second event with almost the right name, and the dashboard built on
 * the first silently stops counting half the traffic.
 *
 * What is not here, and why:
 *
 * - Purchases. RevenueCat funnels its own events into Mixpanel and is the only
 *   party that knows whether a transaction settled. What we send is the intent
 *   either side of the store sheet, which RevenueCat cannot see.
 * - Screen views. The largest event stream in the app, answering almost
 *   nothing: the interesting screens have an event of their own.
 * - Errors. Sentry has them. A failure that is also a product fact travels as
 *   an `outcome` property on the event it belongs to.
 * - Numbers off the diary. No calorie totals, weights, dish names or search
 *   text: health data, not needed for any question below, and already in
 *   Postgres next to the arithmetic that produced it.
 * - Sessions and installs. `trackAutomaticEvents` is on.
 */

/** How an entry reached the diary. The one property most reports break down by. */
export type LogMethod =
  | 'camera'
  | 'describe'
  | 'search'
  | 'barcode'
  | 'recipe'
  | 'quick_add'
  /**
   * Re-logged out of this account's own diary, from the search panel's second
   * tab. Its own value rather than folded into `search`: finding a food in a
   * shared catalogue and saying "the same again" are different acts, and which
   * of the two people use is the question the tab was built to answer.
   */
  | 'history'

/**
 * Which button was refused, when the paywall came up because of one. Naming
 * them is how to find out which capability sells the app, which the paywall
 * screen cannot know about itself.
 */
export type ProFeature =
  /**
   * The daily scan allowance ran out. Not "the camera is behind the paywall":
   * a free account photographs three plates a day, and this is what a fourth
   * reports. The most interesting trigger in the funnel, being the only refusal
   * that reaches somebody already using the app as intended.
   */
  | 'camera'
  | 'describe'
  | 'refine'
  | 'read_recipe'
  | 'new_recipe'
  /** "What should I eat?" — the model asked what to eat next, from Today. */
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
 * `detached` means the request broke while the edge function went on writing
 * the entry, so the scan is probably still running and this process stopped
 * hearing about it. Counting those as failures is how a scan that succeeded was
 * reported as an error. See `data/snap.ts`.
 */
export type ScanOutcome =
  | 'logged'
  | 'no_food'
  | 'failed'
  | 'detached'
  | 'limit_reached'
  | 'not_entitled'

/**
 * `email` is a mailed code or link; `password` is a typed one. Counted apart
 * because the choice between them is what the sign-in screen exists to settle.
 */
export type SignInMethod = 'apple' | 'google' | 'email' | 'password'

/**
 * What the calorie plan is for, which is the whole of what the two weights say.
 * Sent instead of the weights themselves.
 */
export type PlanDirection = 'lose' | 'gain' | 'maintain'

/**
 * Where a widget tap was aiming. The panels are spelt as the log sheet's own
 * route param spells them, so a breakdown lines up with `Log Sheet Opened`'s
 * `panel`. `open` is a widget with one tap target and nothing more specific to
 * say.
 *
 * `recipes` is kept although the sheet has no such panel any more: the widget
 * is native and is on home screens built against a version that had one. The
 * app resolves that name to search on My foods, and this is what those taps are
 * still counted as.
 */
export type WidgetTarget = 'open' | 'camera' | 'search' | 'barcode' | 'recipes' | 'water' | 'weight'

/** An event that carries nothing. Written out so the call site still says `{}`. */
type NoProps = Record<string, never>

/**
 * Every event, and its properties. Names are Title Case and past tense and
 * properties are snake_case, which is what Mixpanel's UI sorts and groups by.
 */
export type Events = {
  // ── Onboarding and the account ───────────────────────────────────────────
  /** "Get started" on the welcome screen. The top of the whole funnel. */
  'Onboarding Started': NoProps
  /**
   * One question answered. One event with a `step` property rather than nine
   * events, so a tenth screen does not need a tenth event.
   */
  'Onboarding Step Completed': { step: string; step_number: number }
  /**
   * The profile write landed. Everything before this is a stranger.
   *
   * `referral_source` is on the event as well as the person, because "which
   * channel produces accounts that finish" is a breakdown of this event and a
   * profile property cannot answer it. One of a fixed list, not free text.
   */
  'Onboarding Completed': { plan_direction: PlanDirection; referral_source: string }
  /** The email was accepted and the code sent. The other half is `Signed In`. */
  'Login Link Requested': NoProps
  /**
   * A reset was asked for. No address on it and no answer either: this fires
   * whether or not the account exists, because Supabase does not say.
   *
   * Counted on its own rather than as a failed sign-in, because it measures
   * what the password is costing people.
   */
  'Password Reset Requested': NoProps
  'Signed In': { method: SignInMethod; is_new_account: boolean }
  /**
   * Includes the user closing Apple's own sheet, which is not an error and is
   * the number worth knowing. Real exceptions go to Sentry as well.
   */
  'Sign In Failed': { method: SignInMethod; reason: 'cancelled' | 'unavailable' | 'error' }
  'Signed Out': NoProps
  /**
   * The account is gone: rows, photographs and sign-in identity. Fired after
   * the server has said it did, and it is the last thing this person will be
   * counted doing. Worth having because a churned subscriber and a deleted
   * account are not the same event, and only one of them is a decision.
   *
   * No reason on it: a reason would have to be asked for, and a form standing
   * between somebody and the button they came for is what the guideline this
   * feature exists for forbids.
   */
  'Account Deleted': NoProps

  // ── Logging ──────────────────────────────────────────────────────────────
  /**
   * The log button, or a route that opened the sheet directly. `date_offset` is
   * days back from today, so anything but 0 is somebody filling in a day they
   * missed.
   */
  'Log Sheet Opened': { panel: string; date_offset: number }
  /**
   * A meal went on the day. For search, a recipe, a packet and a quick add that
   * is the insert succeeding; for the camera and describe it is the optimistic
   * row appearing, because the entry is written server-side.
   *
   * So this over-counts the two scan paths by the scans that came back with
   * nothing edible or failed outright. The correction is one subtraction, and
   * the alternative would silently drop every meal whose request broke while
   * the edge function went on writing it.
   */
  'Meal Logged': { method: LogMethod; date_offset: number }
  /**
   * What the cascade did with a photographed or typed meal.
   *
   * `tier` is the cascade's tier for the first entry (1 dish, 2 components, 4
   * estimate, 5 archetype) and says how often the catalogue actually answers
   * rather than being guessed past.
   */
  'Meal Scan Completed': {
    method: 'camera' | 'describe'
    outcome: ScanOutcome
    duration_ms: number
    tier: number | null
    components: number
  }
  /**
   * A barcode was read and looked up. `not_found` is the interesting value: see
   * the README on why Malaysian packets are the thin part of the catalogue.
   */
  'Barcode Scanned': { outcome: 'found' | 'not_found' | 'error' }
  /** Save on the food detail screen. `changed` names what actually moved. */
  'Entry Updated': { changed: string[] }
  'Entry Deleted': { source: string }
  /**
   * The sparkle: a correction described in words. `from_chip` separates the
   * suggested corrections from the typed ones, which is the difference between
   * the chips being useful and being decoration.
   */
  'Entry Refined': {
    outcome: 'applied' | 'not_applied' | 'failed' | 'limit_reached' | 'not_entitled'
    from_chip: boolean
    duration_ms: number
  }

  // The catalogue.
  //
  // A search the user stopped typing at, not one per keystroke: "nas" finding
  // nothing says nothing about the catalogue.
  //
  // The text itself is deliberately absent. What people type and cannot find is
  // worth capturing, and the place to capture it is the Worker, which is
  // already authenticated and rate limited.
  'Food Searched': { results: number; query_length: number }
  /**
   * A result was opened. `position` is 1-based rank, and its distribution is
   * the live version of what `pnpm foods:gate` measures against thirty fixed
   * queries.
   *
   * `source` says which of the panel's three lists it came from, because rank
   * means different things in each: in the catalogue it grades the Worker's
   * ranking, in the history it is how far back the meal was, and among the
   * user's own food it is how recently they wrote it. Absent is the catalogue,
   * which is the only list the ranking is a claim about.
   */
  'Food Picked': { position: number; results: number; source?: 'history' | 'recipe' }

  // ── Money, up to the store sheet and no further ──────────────────────────
  /**
   * `trigger` is the refused button for `/paywall`, and the screen's own reason
   * for the other three. There is no `Paywall Dismissed`: a paywall shown and
   * not followed by a purchase is the dismissal.
   */
  'Paywall Shown': { screen: PaywallScreen; trigger: ProFeature | PaywallScreen }
  /**
   * The model answered "what should I eat?". The two choices and how many came
   * back, and nothing else: which sitting and which kitchen people ask about is
   * what stops the cuisine list being a guess. `count` is 0 when the model would
   * not answer, which is the only way to see that failure from outside.
   *
   * A union rather than the string the request carries, because the list is
   * editable now and a cuisine is free text somebody typed. See
   * `trackedCuisine`.
   */
  'Suggestions Shown': { meal: Meal; cuisine: TrackedCuisine; count: number }

  'Plan Selected': { screen: PaywallScreen; plan: Plan }
  /** The store sheet was asked for. RevenueCat reports what happened after. */
  'Purchase Started': { screen: PaywallScreen; plan: Plan }
  /**
   * The store sheet closed with nothing bought. RevenueCat only hears about
   * transactions that happened, so this half of the funnel has to come from
   * here.
   */
  'Purchase Abandoned': {
    screen: PaywallScreen
    plan: Plan
    reason: 'cancelled' | 'unavailable' | 'error'
  }
  'Restore Requested': { outcome: 'restored' | 'nothing' | 'unavailable' }
  /**
   * Share and Earn: a platform shortcut was tapped, and the Discord claim was
   * opened. The two ends of a funnel whose middle happens in somebody else's
   * app. Which platform says where this app's users actually are, which no
   * other event answers.
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
   * `pending` is not a third verdict, it is the review having failed to run,
   * which leaves the recipe public and invisible.
   */
  'Recipe Published': { outcome: 'approved' | 'rejected' | 'pending' }
  'Recipe Copied': NoProps
  /**
   * Somebody reported a community recipe. The reason and nothing else: which
   * recipe is in Postgres next to the moderation that acts on it, and what this
   * answers is whether the four reasons offered are the right four.
   */
  'Recipe Reported': { reason: ReportReason }
  /**
   * A cook hidden for good, by one reader. No properties: the person blocked is
   * not a fact about the product, and the only question is whether this happens
   * at all. If it becomes common, the gate before publishing is not working.
   */
  'Author Blocked': NoProps
  'Review Opened': { kind: 'week' | 'month' }
  /**
   * The share sheet came back having actually shared something. Which card is
   * deliberately absent: a story lays out three or four `Shareable`s per step,
   * so naming them means a slug plumbed through every component, and the
   * question that pays for itself first is whether the loop is used at all.
   */
  'Review Card Shared': { kind: 'week' | 'month' }
  /**
   * One logged meal left the app as a picture. `picture` is the shape of the
   * card rather than anything off the diary: if nobody ever sends the
   * illustration, the card is really a photo feature.
   *
   * Same caveat as `Review Card Shared`: a real send on iOS, and every tap on
   * Android, which cannot report what became of a share intent.
   */
  'Meal Shared': { picture: 'photo' | 'drawing' }

  // ── The home screen ──────────────────────────────────────────────────────
  /**
   * A widget was put on a home screen.
   *
   * Neither platform announces this. WidgetKit and `AppWidgetManager` each say
   * what is installed right now and nothing about when it changed, so this is a
   * diff taken when the app comes forward, against the set last seen on this
   * handset. See `features/widgets/adoption.ts`.
   *
   * So it is late — a widget added on Tuesday and noticed on Thursday is
   * reported on Thursday — and it is per install rather than per account, since
   * signing out does not remove a widget from a home screen.
   *
   * Worth having anyway: which of the six anybody wants is what decides whether
   * the other five should have been built.
   */
  'Widget Added': { widget: WidgetKind }
  /** The same diff, in the other direction. A removal is the clearest verdict. */
  'Widget Removed': { widget: WidgetKind }
  /**
   * A widget was tapped and the app opened because of it: the one number that
   * says whether a widget is used rather than installed. `target` separates the
   * widgets that are a shortcut into logging from the ones that are a figure to
   * glance at.
   */
  'Widget Opened': { widget: WidgetKind; target: WidgetTarget }
  /**
   * A drink logged on the widget, without the app being opened.
   *
   * Fired when the app drains the queue rather than when the button was
   * pressed, because the button runs in a process with no Mixpanel in it. So it
   * arrives late, and a drink whose sync failed is never counted.
   *
   * `preset` is which of the two buttons, which is what would decide a third.
   */
  'Widget Water Added': { preset: number }

  // ── Asking to be rated ───────────────────────────────────────────────────
  /**
   * The app's own question, "enjoying RiceCal?", reached a screen. `trigger` is
   * the moment it rode in on: a meal milestone and a review somebody came back
   * to are two different kinds of goodwill, and if one converts and the other
   * does not, the other should stop firing.
   *
   * Not the store's dialog. Nothing counts that, because `requestReview`
   * reports neither whether it drew anything nor what the user did with it.
   */
  'Rating Prompt Shown': { trigger: RatingTrigger }
  /**
   * A trigger fired and the gate turned it down, with the first reason it
   * failed on. The only way to see a silent gate from outside: every threshold
   * in `lib/rating/state.ts` is a guess, and "3,900 of 4,000 skipped for
   * `too_few_meals`" means fifteen meals is too many.
   *
   * Bounded volume despite sitting on a write path: a meal only fires a trigger
   * on a checkpoint crossing, so at most one event per fifteen meals.
   */
  'Rating Prompt Skipped': { trigger: RatingTrigger; reason: RatingSkipReason }
  /**
   * What they said. `dismissed` is the scrim, the back gesture and "maybe
   * later", which are one answer as far as the sixty-day cooldown is concerned.
   */
  'Rating Prompt Answered': {
    trigger: RatingTrigger
    answer: 'liked' | 'disliked' | 'dismissed'
  }
  /**
   * Somebody who said "not really" took the offer of a conversation and opened
   * the Discord. There is no `Rating Feedback Declined`: a `disliked` answer
   * with none of these after it is the decline.
   */
  'Rating Feedback Opened': { trigger: RatingTrigger }
}

export type EventName = keyof Events

/**
 * The user properties this app sets, and nothing else. Each is a stated
 * preference, a fact about which parts of the app are switched on, or the
 * address the account is keyed on. Nothing off the diary.
 */
export type PersonProps = {
  /**
   * The address on the Supabase account, and the one identifier here that names
   * a real person. Mixpanel's reserved spelling on purpose: a plain `email` is
   * an ordinary property, while `$email` is the field the profile list shows
   * and the search box looks in.
   *
   * Set from `identifyUser` alone, off the session, so it moves with the
   * account. It is the same value RevenueCat is given, which is what lets
   * somebody writing in about a purchase be found on both dashboards.
   *
   * `undefined` rather than an empty string when a provider supplied no
   * address, which Mixpanel would otherwise offer in a breakdown.
   */
  $email?: string
  onboarded?: boolean
  onboarded_at?: string
  plan_direction?: PlanDirection
  /**
   * The client's spelling, and only that one. `finish.tsx` sets it from the
   * onboarding draft and `useAnalyticsIdentity` from the stored profile, and
   * the draft holds `veryActive` where the column holds `very_active`. As a
   * `string` the two disagreed, and a breakdown showed six values for four
   * answers.
   */
  activity_level?: ActivityLevel
  /**
   * Which of a fixed list of platforms brought this account in. Free text is
   * not offered: "somewhere else" is the escape, and it keeps this a breakdown
   * rather than a tag cloud.
   */
  referral_source?: string
  /** The store the account reads movement from, or null once disconnected. */
  health_provider?: string | null
  /** How many of the three meal reminders are switched on. */
  meal_reminders?: number
  /**
   * How many RiceCal widgets are on this phone's home screens.
   *
   * The one counter here, and not the kind argued against below: a widget is
   * added in the OS, where the app is not running, so this is not derivable
   * from events at all and without it no report can be cut by "has a widget".
   *
   * A fact about the handset rather than the account, like `health_provider`.
   * Written whenever the app comes forward and the set has changed.
   */
  widgets_installed?: number
}

/**
 * There are deliberately no people counters here, no `meals_logged` and no
 * `recipes_created`. Mixpanel builds a cohort from an event count directly, so
 * a counter would be a second, hand-maintained answer that has to decide for
 * itself whether a scan that failed halfway counts.
 */

/**
 * Properties stamped on every event. Only one: whether this account is paying
 * is the cut every other report wants, and a super property is the only way to
 * get it without adding a paid/free property to twenty event definitions.
 */
export type SuperProps = {
  entitled: boolean
}
