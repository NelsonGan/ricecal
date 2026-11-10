import { format } from 'date-fns/format'

import i18n, { currentLanguage, SUPPORTED_LANGUAGES, setLanguage } from '@/i18n'

/**
 * A language is loaded when it is asked for, and answers in the same call.
 *
 * Every bundle used to be imported at the top of `@/i18n`, so a launch built
 * thirteen languages of strings to draw one. They are still all in the app;
 * what these pin is that only the wanted ones are run, and that nothing has
 * to be awaited before `t` is right, which is the property the eager imports
 * existed to give.
 */

afterEach(() => setLanguage('en'))

it('opens with English and nothing it was not asked for', () => {
  expect(currentLanguage()).toBe('en')
  expect(i18n.hasResourceBundle('en', 'common')).toBe(true)
  expect(i18n.hasResourceBundle('th', 'common')).toBe(false)
  expect(i18n.hasResourceBundle('ja', 'common')).toBe(false)
})

it('speaks a language in the same call that switches to it', () => {
  expect(i18n.t('common:nav.today')).toBe('Today')

  setLanguage('th')

  // No await between the switch and the read: a screen renders on this tick.
  expect(i18n.t('common:nav.today')).toBe('วันนี้')
  expect(currentLanguage()).toBe('th')
})

it('prints dates in the language it switched to', () => {
  const october = new Date(2026, 9, 14)
  expect(format(october, 'MMMM')).toBe('October')

  setLanguage('ja')
  expect(format(october, 'MMMM')).toBe('10月')

  // Filipino has no date-fns locale, so its dates stay in English.
  setLanguage('fil')
  expect(format(october, 'MMMM')).toBe('October')
})

it('has every namespace of every language to hand over', async () => {
  await i18n.loadLanguages(SUPPORTED_LANGUAGES)
  const namespaces = i18n.options.ns as string[]

  expect(namespaces.length).toBeGreaterThan(10)
  for (const language of SUPPORTED_LANGUAGES) {
    for (const namespace of namespaces) {
      expect(`${language}:${namespace} ${i18n.hasResourceBundle(language, namespace)}`).toBe(
        `${language}:${namespace} true`,
      )
    }
  }
})
