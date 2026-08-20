/**
 * Everything the jobs Worker is given, in one place.
 *
 * Bindings and vars are declared in `wrangler.jsonc`; the secret is set once by
 * hand (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`) and is the only
 * credential this Worker holds. A job that needs something new — a second
 * bucket, a D1 database, a third party's key — adds it here and there, and
 * every other job goes on ignoring it.
 */
export interface Env {
  /** The meal photographs. See `jobs/retention.ts`. */
  PHOTOS: R2Bucket

  /** The Supabase project, for PostgREST. Public; a var, not a secret. */
  SUPABASE_URL: string

  /**
   * The one credential here, and a broad one: it bypasses RLS entirely.
   *
   * That is what a job is — work done on behalf of every account at once, with
   * no user to be. It is the same reasoning the edge functions use, and the
   * same key they already hold. What keeps it honest is `postgres.ts`: a job
   * can call a `service_role` RPC and cannot reach a table, so the rules stay
   * in `schemas/` where they can be read and tested.
   */
  SUPABASE_SERVICE_ROLE_KEY: string
}
