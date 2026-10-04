jest.mock('../preference', () => ({
  storedLanguage: jest.fn(() => null),
  storeLanguage: jest.fn(),
}))
jest.mock('expo-localization', () => ({ getLocales: jest.fn(() => [{ languageCode: 'en' }]) }))

function launch(stored: string | null = null, device = { languageCode: 'en' }) {
  jest.resetModules()
  const preference = require('../preference')
  preference.storedLanguage.mockReturnValue(stored)
  require('expo-localization').getLocales.mockReturnValue([device])
  const app = require('../index') as typeof import('../index')
  const dates = require('date-fns') as typeof import('date-fns')
  return { ...app, i18n: app.default, dates, preference }
}

it('opens in English with only the English resources registered', () => {
  const { i18n, dates } = launch()
  expect(Object.keys(i18n.store.data)).toEqual(['en'])
  expect(i18n.t('common:nav.today')).toBe('Today')
  expect(dates.getDefaultOptions().locale?.code).toBe('en-GB')
})

it('loads the stored language before the first translation or date', () => {
  const { i18n, currentLanguage, dates } = launch('zh-Hans', { languageCode: 'th' })
  expect(Object.keys(i18n.store.data).sort()).toEqual(['en', 'zh-Hans'])
  expect(currentLanguage()).toBe('zh-Hans')
  expect(i18n.t('common:nav.today')).toBe('今天')
  expect(dates.format(new Date(2026, 9, 5), 'MMMM')).toBe('十月')
})

it('uses the device language when there is no stored choice', () => {
  const { i18n, currentLanguage, dates } = launch(null, { languageCode: 'ja' })
  expect(Object.keys(i18n.store.data).sort()).toEqual(['en', 'ja'])
  expect(currentLanguage()).toBe('ja')
  expect(dates.getDefaultOptions().locale?.code).toBe('ja')
})

it('switches every language synchronously with all namespaces and matching dates', () => {
  const { i18n, setLanguage, currentLanguage, SUPPORTED_LANGUAGES, dates, preference } = launch()
  const namespaces = Object.keys(i18n.store.data.en)
  for (const language of SUPPORTED_LANGUAGES) {
    setLanguage(language)
    expect(currentLanguage()).toBe(language)
    expect(Object.keys(i18n.store.data[language]).sort()).toEqual([...namespaces].sort())
    expect(i18n.t('common:nav.today')).toBe(i18n.getResource(language, 'common', 'nav.today'))
    expect(i18n.t('paywall:hard.trialDuration.day_other', { count: 2 })).not.toContain(
      'trialDuration',
    )
    const dateCode = { en: 'en-GB', fil: 'en-GB', 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' }
    expect(dates.getDefaultOptions().locale?.code).toBe(
      dateCode[language as keyof typeof dateCode] ?? language,
    )
    expect(preference.storeLanguage).toHaveBeenLastCalledWith(language)
  }
})

it('reuses loaded resources when returning to a language', () => {
  const { i18n, setLanguage } = launch()
  setLanguage('ms')
  const resource = i18n.getResourceBundle('ms', 'common')
  const add = jest.spyOn(i18n, 'addResourceBundle')
  setLanguage('en')
  setLanguage('ms')
  expect(add).not.toHaveBeenCalled()
  expect(i18n.getResourceBundle('ms', 'common')).toBe(resource)
})

it.each([
  [{ languageCode: 'zh', languageScriptCode: 'Hant' }, 'zh-Hant'],
  [{ languageCode: 'zh', languageScriptCode: 'Hans', regionCode: 'TW' }, 'zh-Hans'],
  [{ languageCode: 'zh', regionCode: 'HK' }, 'zh-Hant'],
  [{ languageCode: 'zh', regionCode: 'CN' }, 'zh-Hans'],
  [{ languageCode: 'tl' }, 'fil'],
  [{ languageCode: 'ar' }, 'en'],
])('resolves the device locale %j to %s', (device, expected) => {
  const { currentLanguage } = launch(null, device)
  expect(currentLanguage()).toBe(expected)
})
