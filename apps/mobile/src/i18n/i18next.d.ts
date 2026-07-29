import type { Resources } from './en'

/**
 * Makes `t` key-checked against the English bundle: `t('welcome.titl')` is a
 * type error, not a string that renders as its own key. This is the whole
 * reason the bundle is TypeScript rather than JSON.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: Resources
    returnNull: false
  }
}
