/**
 * Bump SCHEMA_VERSION whenever the shape of anything persisted to disk changes.
 * It is the react-query persister's cache `buster` — a bump silently discards
 * every cached query rather than rehydrating a stale shape into new code.
 *
 * 5: water became a volume. `daily_logs.water_glasses` is `water_ml`, and the
 * shapes that carried it followed — a day's `waterGlasses` is `waterMl`, a
 * budget's is too, and every water figure on the trend and review summaries
 * means millilitres where it used to mean cups. Both halves of that are
 * unsurvivable in a rehydrated cache: the renamed field arrives `undefined` and
 * prints as `NaN`, and the ones that kept their names arrive with the right
 * type and the wrong unit, so a day of six cups draws as a tank six
 * millilitres full.
 */
export const SCHEMA_VERSION = '5'

/**
 * The free tier's three ceilings, as the app prints them.
 *
 * COPIES, AND THE DATABASE HOLDS THE ORIGINAL. Every one of these is enforced
 * in Postgres — `free_daily_scans()`, `free_recipe_limit()`,
 * `free_photo_retention_days()` — because a limit the client is trusted to
 * apply is a limit that applies only to people running the client. What lives
 * here is what the comparison table and the toasts SAY, and the two have to be
 * changed together: a paywall promising three scans while the database allows
 * five is a support thread, and the other way round is a refusal nobody can
 * explain.
 *
 * The server sends its own figure back with every refusal, and the screens
 * prefer that one where they have it. These are for the copy that has to be
 * rendered before anybody has been refused anything.
 *
 * THE PRO CEILING IS NOT HERE ON PURPOSE. It exists — fifty scans a day — and
 * the comparison table says "unlimited", because fifty photographed meals in
 * one day is not a diary and nobody eating normally will meet it. It is an
 * abuse ceiling wearing a quota's clothes, and printing it would invite the one
 * reading where it is a restriction on the thing being sold.
 */
export const FREE_DAILY_SCANS = 3
export const FREE_RECIPES = 3
export const FREE_PHOTO_RETENTION_DAYS = 30
