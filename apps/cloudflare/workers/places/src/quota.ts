// Daily allowances of place searches that reach Apple, counted in D1
// (search_usage, one row per subject and UTC day). Searching is free for
// everyone; the caps only protect Apple's 25,000 calls a day, which RiceCal
// shares with Money2Time (one developer team, one quota). The user is a
// verified Supabase account, but an account is cheap to make, so each address
// has its own cap too. Rows carry expires_at so the daily cron can prune them.

export interface QuotaEnv {
  DB: D1Database
  /** Searches per user per UTC day (default 200). */
  PLACES_DAILY_LIMIT?: string
  /** Searches per address per UTC day (default 1000; a shared network is many people). */
  PLACES_ADDRESS_DAILY_LIMIT?: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_USER_LIMIT = 200
const DEFAULT_ADDRESS_LIMIT = 1000

/** Who a search counts against: the user, and the address it came from. */
export interface QuotaSubjects {
  user: string
  address: string
}

export interface QuotaDecision {
  allowed: boolean
  /** Which cap stopped it, when one did. */
  reachedBy: 'user' | 'address' | null
}

function limitOf(value: string | undefined, fallback: number): number {
  const limit = Number(value)
  return Number.isInteger(limit) && limit > 0 ? limit : fallback
}

export function dailyLimits(env: QuotaEnv): { user: number; address: number } {
  return {
    user: limitOf(env.PLACES_DAILY_LIMIT, DEFAULT_USER_LIMIT),
    address: limitOf(env.PLACES_ADDRESS_DAILY_LIMIT, DEFAULT_ADDRESS_LIMIT),
  }
}

/** Epoch-ms at the start of `now`'s UTC day. */
export function dayStart(now: Date): number {
  return Math.floor(now.getTime() / DAY_MS) * DAY_MS
}

/**
 * The address as a subject: hashed, so no IP is stored (the row is gone after
 * a day anyway), and salted with the day so a hash says nothing tomorrow.
 */
export async function addressSubject(ip: string, now: Date): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${dayStart(now)}:${ip}`),
  )
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `ip:${hex.slice(0, 32)}`
}

/**
 * Takes one use today for both the user and the address, and says whether
 * either has now gone past its cap. Counted before Apple is asked, in one
 * atomic upsert each, so searches arriving together cannot all read the same
 * count and all get through. A refused search gives its uses back, or a user
 * past their own cap would go on using up the address's allowance for
 * everybody else on that network; so does a search Apple then fails
 * (`releaseQuota`).
 */
export async function reserveQuota(
  subjects: QuotaSubjects,
  env: QuotaEnv,
  now: Date,
): Promise<QuotaDecision> {
  const limits = dailyLimits(env)
  const start = dayStart(now)
  const upsert = (subject: string) =>
    env.DB.prepare(
      `INSERT INTO search_usage (subject, day_start, count, expires_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(subject, day_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    ).bind(subject, start, start + DAY_MS)
  const [user, address] = await env.DB.batch<{ count: number }>([
    upsert(subjects.user),
    upsert(subjects.address),
  ])
  const count = (result: D1Result<{ count: number }> | undefined) =>
    result?.results?.[0]?.count ?? Number.POSITIVE_INFINITY
  const reachedBy =
    count(user) > limits.user ? 'user' : count(address) > limits.address ? 'address' : null
  if (reachedBy) await releaseQuota(subjects, env, now)
  return { allowed: reachedBy === null, reachedBy }
}

/** Gives back a use `reserveQuota` took, for a search Apple did not answer. */
export async function releaseQuota(
  subjects: QuotaSubjects,
  env: QuotaEnv,
  now: Date,
): Promise<void> {
  const down = (subject: string) =>
    env.DB.prepare(
      'UPDATE search_usage SET count = MAX(count - 1, 0) WHERE subject = ?1 AND day_start = ?2',
    ).bind(subject, dayStart(now))
  await env.DB.batch([down(subjects.user), down(subjects.address)])
}

/** Drops the counters of days that are over (the daily cron). */
export async function pruneExpired(env: QuotaEnv, now: Date): Promise<void> {
  await env.DB.prepare('DELETE FROM search_usage WHERE expires_at <= ?1').bind(now.getTime()).run()
}
