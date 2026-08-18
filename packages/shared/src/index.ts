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
 *
 * 4: the catalogue moved to Cloudflare D1 and an entry started carrying its own
 * numbers. This is the widest shape change the app has had: `food_log_details`
 * gained the whole snapshot (`item_name`, `base_*`, `serving_grams`), a portion
 * id stopped being a uuid and became `"<food id>:<slug>"`, `is_estimate` and
 * `is_archetype` became constants nothing means anything by, and a catalogue
 * food gained `serving_g`, `barcode` and `source_attribution`. A day persisted
 * before the move rehydrates into screens that read all of those — which is
 * subtle in the worst way, because the fields it does still have are right and
 * only the new ones are missing. A diary of the correct meals with no
 * illustrations, no weights and no portions is a plausible-looking screen.
 */
export const SCHEMA_VERSION = '4'

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
