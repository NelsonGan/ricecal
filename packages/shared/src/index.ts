/**
 * Bump SCHEMA_VERSION whenever the shape of anything persisted to disk changes.
 * It is the react-query persister's cache `buster`: a bump discards every
 * cached query rather than rehydrating a stale shape into new code.
 *
 * 5: water became a volume. `daily_logs.water_glasses` is `water_ml`, and every
 * shape that carried it followed. A rehydrated cache survives neither half of
 * that: the renamed fields arrive `undefined` and print as `NaN`, and the ones
 * that kept their names arrive in the wrong unit, so six cups draw as a tank
 * six millilitres full.
 */
export const SCHEMA_VERSION = '5'

/**
 * The free tier's three ceilings, as the app prints them.
 *
 * Copies. Postgres holds the original of each (`free_daily_scans()`,
 * `free_recipe_limit()`, `free_photo_retention_days()`), because a limit the
 * client is trusted to apply only applies to people running the client. These
 * are what the comparison table and the toasts say, and they have to change
 * with the database: a paywall promising three scans while the database allows
 * five is a support thread.
 *
 * Screens prefer the figure the server sends back with a refusal. These are for
 * copy rendered before anybody has been refused anything.
 *
 * The Pro ceiling is deliberately absent. It exists, at fifty scans a day, but
 * the table says "unlimited": it is an abuse ceiling rather than a quota, and
 * printing it would invite reading it as a restriction on the thing being sold.
 */
export const FREE_DAILY_SCANS = 3
export const FREE_RECIPES = 3
export const FREE_PHOTO_RETENTION_DAYS = 30
