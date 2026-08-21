import type { Resources } from './en'

/**
 * The English bundle with every leaf widened to `string`.
 *
 * This is what makes a translation checkable. `Resources` is `typeof en` on an
 * `as const` object, so its leaves are literal types — 'Continue', not `string`
 * — and a bundle declared to satisfy it directly would only accept the English
 * words back. Widening the leaves keeps the SHAPE and drops the wording, which
 * is exactly the contract a locale has to meet.
 *
 * `satisfies Bundle` on each locale is then the whole quality gate: a key
 * nobody translated is a missing property, a key renamed in `en/` breaks every
 * locale that still carries the old name, and a typo in a nested block is an
 * excess property rather than a string that silently falls back to English at
 * runtime. `pnpm check` is where a locale goes wrong, not the simulator.
 */
export type Bundle = Translated<Resources>

type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>
}
