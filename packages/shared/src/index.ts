/**
 * Bump SCHEMA_VERSION whenever the shape of anything persisted to disk changes.
 * It is the react-query persister's cache `buster` — a bump silently discards
 * every cached query rather than rehydrating a stale shape into new code.
 *
 * 2: images moved to Cloudflare R2, and a key changed shape with them —
 * `<user>/<file>` became `meals/<user>/<uuid>.jpg`. A persisted day still
 * holding the old shape would render tiles for objects that no longer exist.
 */
export const SCHEMA_VERSION = '2'

export const APP_NAME = 'RiceCal'
