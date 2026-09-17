/**
 * Email addresses the app can safely hand to an internet mailer.
 *
 * This is deliberately practical rather than a complete RFC 5322 parser. Auth
 * mail has to reach a public DNS name, so quoted local parts, address literals
 * and single-label domains buy compatibility with almost nobody while making
 * typo domains much easier to admit.
 */
const LOCAL_PART = /^[A-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/i
const DOMAIN_LABEL = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/i
const TOP_LEVEL_DOMAIN = /^(?:[A-Z]{2,63}|XN--[A-Z0-9-]{2,59})$/i

/**
 * Syntactically valid misspellings seen in delivery logs, plus the adjacent
 * key and transposition variants of the same large mailbox providers. Syntax
 * alone cannot distinguish `gmial.com` from a real domain, but the mail server
 * will still spend hours retrying it.
 */
const COMMON_PROVIDER_TYPOS = new Set([
  'gamil.com',
  'gmail.cm',
  'gmail.cmo',
  'gmail.co',
  'gmail.comel',
  'gmail.comn',
  'gmail.con',
  'gmial.com',
  'gmil.com',
  'hotmai.com',
  'hotmail.co',
  'hotmail.con',
  'hotmal.com',
  'hotnail.com',
  'icloud.co',
  'icloud.con',
  'iclod.com',
  'iclud.com',
  'outlok.com',
  'outlook.co',
  'outlook.con',
  'yaho.com',
  'yahoo.co',
  'yahoo.con',
])

export function normalizeEmailAddress(value: string): string {
  return value.trim()
}

export function isValidEmailAddress(value: string): boolean {
  const email = normalizeEmailAddress(value)
  if (!email || email.length > 254) return false

  const at = email.lastIndexOf('@')
  if (at <= 0 || at !== email.indexOf('@')) return false

  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || domain.length > 253) return false
  if (
    !LOCAL_PART.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    return false
  }

  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL.test(label))) return false
  if (!TOP_LEVEL_DOMAIN.test(labels.at(-1) ?? '')) return false

  return !COMMON_PROVIDER_TYPOS.has(domain.toLowerCase())
}
