/**
 * Bump SCHEMA_VERSION whenever the shape of anything persisted to disk changes.
 * It is the react-query persister's cache `buster` — a bump silently discards
 * every cached query rather than rehydrating a stale shape into new code.
 */
export const SCHEMA_VERSION = '1'

export const APP_NAME = 'RiceCal'
