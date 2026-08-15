/**
 * The one piece of analytics that has to read the app's own data.
 *
 * Everything else tracks through `lib/analytics`, which imports nothing —
 * see the header there for why that boundary is worth having.
 */
export { useAnalyticsIdentity } from './useAnalyticsIdentity'
