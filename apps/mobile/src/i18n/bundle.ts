import type { Resources } from './en'

/**
 * The English bundle with every leaf widened to `string`, which is what makes a
 * translation checkable. `Resources` is `typeof en` on an `as const` object, so
 * its leaves are literal types and a bundle declared to satisfy it directly would
 * only accept the English words back. Widening keeps the shape and drops the
 * wording, which is the contract a locale has to meet.
 *
 * `satisfies Bundle` on each locale is then the whole quality gate: an
 * untranslated key is a missing property, a key renamed in `en/` breaks every
 * locale still carrying the old name, and a typo in a nested block is an excess
 * property rather than a silent fallback to English at runtime.
 */
export type Bundle = Translated<Resources>

type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>
}
