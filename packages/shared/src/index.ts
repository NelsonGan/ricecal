/**
 * Bump SCHEMA_VERSION whenever the shape of anything persisted to disk changes.
 * It is the react-query persister's cache `buster` — a bump silently discards
 * every cached query rather than rehydrating a stale shape into new code.
 *
 * 2: images moved to Cloudflare R2, and a key changed shape with them —
 * `<user>/<file>` became `meals/<user>/<uuid>.jpg`. A persisted day still
 * holding the old shape would render tiles for objects that no longer exist.
 *
 * 3: `profiles.weight_goal` is gone — the calorie plan is read off the gap
 * between the current and target weights now. A cached profile still carrying
 * the column would rehydrate a field nothing writes, and the screens that used
 * to branch on it have already stopped looking.
 */
export const SCHEMA_VERSION = '3'

export const APP_NAME = 'RiceCal'
