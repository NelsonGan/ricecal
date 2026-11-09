/**
 * Shared types for the locale registry.
 *
 * Each locale lives in its own module. App languages use their own simulator
 * captures; other store languages explicitly fall back to the English capture.
 * The brand panel's rating and user count stay the same across languages.
 */

/** Headline, optional accented phrase, and one supporting line. */
export interface SceneCopy {
  /** Two lines, split with \n. The accent phrase must appear verbatim in it. */
  h: string;
  /** Substring of `h` drawn in the accent colour with an underline swash. */
  hl: string;
  /** One sentence under the headline. Kept short so it never wraps to three lines. */
  sub: string;
}

/** The brand panel — scene 02, which has no phone in it. */
export interface PanelCopy {
  title: string;
  sub: string;
  /** Translate the whole phrase so the user count follows local word order. */
  stats: { usersChoice: string };
  /** The three things Trends charts. One word each. */
  metrics: { calories: string; water: string; weight: string };
  snap: { t: string; b: string };
  describe: { t: string; b: string };
  scan: { t: string; b: string };
  search: { t: string; b: string };
  recipes: { t: string; b: string };
}

export interface PhoneStrings {
  today: SceneCopy;
  workout: SceneCopy;
  dish: SceneCopy;
  trends: SceneCopy;
  feed: SceneCopy;
  recipes: SceneCopy;
  panel: PanelCopy;
}

/**
 * Play feature graphic tagline. `titleB` renders as
 * `{pre}<span accent>{hl}</span>{post}`.
 */
export interface FeatureCopy {
  titleA: string;
  titleB: { pre: string; hl: string; post: string };
  sub: string;
}

/** Square landing card. */
export interface LandingCopy {
  title: string;
  highlight: string;
  subtitle: string;
}

/** Display metadata for the language list in the sidebar. */
export interface LocaleMeta {
  code: string;
  flag: string;
  label: string;
  /** Optional short badge, e.g. a region hint. */
  badge?: string;
}

export interface LocaleModule {
  meta: LocaleMeta;
  phone: PhoneStrings;
  feature: FeatureCopy;
  landing: LandingCopy;
}
