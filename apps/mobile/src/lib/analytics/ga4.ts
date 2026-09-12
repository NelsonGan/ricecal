/**
 * GA4 accepts a much narrower shape than Mixpanel. Keep the translation here,
 * away from the native SDK, so every limit and privacy exclusion is testable.
 */

const EVENT_NAME_LIMIT = 40
const EVENT_PARAMETER_NAME_LIMIT = 40
const EVENT_PARAMETER_VALUE_LIMIT = 100
const USER_PROPERTY_NAME_LIMIT = 24
const USER_PROPERTY_VALUE_LIMIT = 36
const MAX_PROPERTIES = 25

function snakeCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Keep custom events apart from GA4's own names and reserved namespaces. */
export function ga4EventName(event: string): string {
  return `ricecal_${snakeCase(event) || 'event'}`.slice(0, EVENT_NAME_LIMIT)
}

function propertyName(name: string, limit: number): string {
  let normalized = snakeCase(name) || 'property'
  if (!/^[a-z]/.test(normalized) || /^(firebase|google|ga)_/.test(normalized)) {
    normalized = `ricecal_${normalized}`
  }
  return normalized.slice(0, limit)
}

function eventValue(value: unknown): string | number | null {
  if (typeof value === 'string') return value.slice(0, EVENT_PARAMETER_VALUE_LIMIT)
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number' && Number.isFinite(value)) return value
  // `Entry Updated` carries a short array of field names. GA4 custom event
  // parameters do not accept arrays, so preserve the breakdown as one value.
  if (
    Array.isArray(value) &&
    value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))
  ) {
    return value.join(',').slice(0, EVENT_PARAMETER_VALUE_LIMIT)
  }
  return null
}

export type Ga4EventParameters = Record<string, string | number>

/** Drop unsupported values and keep every custom event inside GA4's limits. */
export function ga4EventParameters(properties?: Record<string, unknown>): Ga4EventParameters {
  const result: Ga4EventParameters = {}
  if (!properties) return result

  for (const [rawName, rawValue] of Object.entries(properties)) {
    if (Object.keys(result).length >= MAX_PROPERTIES) break
    const value = eventValue(rawValue)
    if (value === null) continue
    result[propertyName(rawName, EVENT_PARAMETER_NAME_LIMIT)] = value
  }
  return result
}

export type Ga4UserProperties = Record<string, string | null>

/**
 * GA4 user properties are strings. Null deliberately clears a property so a
 * disconnected health provider does not remain on the profile. Email is the
 * one identifying trait Mixpanel receives and must never be copied to GA4.
 */
export function ga4UserProperties(properties: Record<string, unknown>): Ga4UserProperties {
  const result: Ga4UserProperties = {}

  for (const [rawName, rawValue] of Object.entries(properties)) {
    if (Object.keys(result).length >= MAX_PROPERTIES) break
    if (snakeCase(rawName) === 'email' || rawValue === undefined) continue
    if (!['string', 'number', 'boolean'].includes(typeof rawValue) && rawValue !== null) continue

    const name = propertyName(rawName, USER_PROPERTY_NAME_LIMIT)
    result[name] = rawValue === null ? null : String(rawValue).slice(0, USER_PROPERTY_VALUE_LIMIT)
  }
  return result
}
