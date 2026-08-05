/**
 * Addresses that can actually receive a login link.
 *
 * The email IS the credential here (see `data/auth.ts`), so a mistyped address
 * is not a validation nicety — it is a sign-up that hard-bounces and an account
 * nobody can ever get back into. Supabase counts those bounces against the
 * project and throttles its shared sender when there are too many, which means
 * one user's typo degrades sign-in for everybody.
 *
 * Three defences, in the order they run, and the order matters:
 *
 * 1. **Normalise.** What arrives from a keyboard, a paste or an autofill is
 *    often not the address: `Aisyah <aisyah@gmail.com>`, `mailto:` prefixes, a
 *    trailing space from a double-tap space bar, a zero-width character carried
 *    out of a web page. Every one of those bounces while looking correct on
 *    screen, which is the worst failure of the three because nobody can see it.
 * 2. **Reject** what cannot be delivered at all — malformed, or one of the
 *    reserved domains that exist precisely so they never resolve.
 * 3. **Suggest** for what is deliverable in principle but almost certainly
 *    wrong: `gmail.con`, `yaho.com`, `hotmial.com`. This one only ever asks.
 *    A correction applied silently would lock somebody out of a real address
 *    that happens to sit one letter from a common one, so the screen offers it
 *    and the user taps.
 *
 * The regex here is deliberately stricter than the one it replaced
 * (`[^@\s]+@[^@\s]+\.[^@\s]+`), which accepted `a@b.c`, `user@10.0.0.1` and a
 * domain ending in a hyphen. None of those reach a mailbox.
 */

/** Zero-width and bidi marks: invisible on screen, fatal in an address. */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g

/**
 * Everything a mail client might wrap an address in.
 *
 * `Name <addr>` is what the iOS contact picker and a forwarded header both
 * hand over, and it is the common case rather than an exotic one.
 */
const WRAPPED = /^[^<>]*<([^<>]+)>$/

export function normaliseEmail(raw: string): string {
  let value = raw.replace(INVISIBLE, '').trim()

  const wrapped = WRAPPED.exec(value)
  if (wrapped?.[1]) value = wrapped[1].trim()

  if (value.toLowerCase().startsWith('mailto:')) value = value.slice('mailto:'.length).trim()

  // Lowercased whole. The domain is case-insensitive by spec and the local part
  // technically is not, but no mail provider in this list treats it as
  // significant, and Supabase lowercases before it looks a user up — so an
  // address left capitalised is a second account for the same mailbox.
  return value.toLowerCase()
}

/** The local part: 1–64 characters, no dot at either end and never two in a row. */
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/

/**
 * The domain: at least two labels, each starting and ending alphanumeric, and a
 * TLD of two or more letters.
 *
 * Alphabetic rather than alphanumeric in the last label on purpose: it is what
 * rejects `user@192.168.1.1`, which is legal in the grammar and undeliverable
 * from a phone.
 */
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/**
 * Domains reserved by RFC 2606 and RFC 6761 so that they never resolve, plus
 * the placeholder people type when they want to get past a form.
 *
 * These are the addresses behind "check if you are sending test emails while
 * developing" — a local stack mails into Inbucket and never leaves the machine,
 * but a dev build pointed at the hosted project sends for real.
 */
const UNDELIVERABLE_TLDS = ['test', 'example', 'invalid', 'localhost', 'local']
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com']

/** Which i18n error the address earns, or nothing if it is fine. */
export type EmailProblem = 'format' | 'undeliverable'

export function emailProblem(raw: string): EmailProblem | undefined {
  const email = normaliseEmail(raw)

  // 254 is the longest address an SMTP envelope can carry, 64 the longest
  // local part. Beyond either, a server rejects it rather than delivering it.
  if (email.length > 254) return 'format'

  const at = email.lastIndexOf('@')
  if (at < 1 || at === email.length - 1) return 'format'

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)

  if (local.length > 64 || !LOCAL.test(local)) return 'format'
  if (!DOMAIN.test(domain)) return 'format'

  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  if (UNDELIVERABLE_TLDS.includes(tld) || UNDELIVERABLE_DOMAINS.includes(domain)) {
    return 'undeliverable'
  }

  return undefined
}

/**
 * The domains worth spell-checking against.
 *
 * Two kinds of entry, and the second kind is the subtle one. Most are here
 * because they are what people mean to type. But `ymail.com` and
 * `hotmail.co.uk` are here because they are real domains sitting one edit from
 * a more common one — listed, they match themselves exactly and are never
 * "corrected" into somebody else's mailbox.
 *
 * Malaysian users skew heavily to the first four.
 */
const KNOWN_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.com.my',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'live.com.my',
  'msn.com',
  'googlemail.com',
  'ymail.com',
  'rocketmail.com',
  'yahoo.co.uk',
  'hotmail.co.uk',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'zoho.com',
  'gmx.com',
  'qq.com',
  '163.com',
]

/**
 * Damerau-Levenshtein: edits including a transposition of two neighbours.
 *
 * Plain Levenshtein scores `gmial.com` as two edits away from `gmail.com` and
 * so misses the single commonest typo there is — swapping two letters. Counting
 * that as one is the whole reason for the extra branch.
 */
function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + cost)
      }
      rows[i][j] = best
    }
  }

  return rows[a.length][b.length]
}

/**
 * The address the user probably meant, or nothing.
 *
 * Only the domain is checked. A local part is a name and a nickname and a year
 * of birth — there is no dictionary to compare it against, and guessing at one
 * would be the app telling somebody their own name is misspelt.
 *
 * The threshold widens with length because one edit in a nine-character domain
 * is a typo and one edit in a five-character one is often a different company.
 * Anything already in the list is returned as no suggestion at all, however
 * close it sits to a neighbour.
 */
export function suggestEmail(raw: string): string | undefined {
  const email = normaliseEmail(raw)
  if (emailProblem(email)) return undefined

  const at = email.lastIndexOf('@')
  const domain = email.slice(at + 1)
  if (KNOWN_DOMAINS.includes(domain)) return undefined

  const limit = domain.length >= 9 ? 2 : 1
  let best: { domain: string; distance: number } | undefined

  for (const candidate of KNOWN_DOMAINS) {
    // A domain far off in length is a different domain, not a typo of this one,
    // and skipping those keeps `gmail.com` from being offered for `um.edu.my`.
    if (Math.abs(candidate.length - domain.length) > limit) continue

    const distance = editDistance(domain, candidate)
    if (distance > 0 && distance <= limit && (!best || distance < best.distance)) {
      best = { domain: candidate, distance }
    }
  }

  return best ? `${email.slice(0, at)}@${best.domain}` : undefined
}
