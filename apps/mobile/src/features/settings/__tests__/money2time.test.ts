import { money2TimeStoreUrl } from '../money2time'

/** Each platform opens its own store; anything else gets the website, which picks one. */
it('sends each platform to the listing it can install from', () => {
  expect(money2TimeStoreUrl('ios')).toBe('https://apps.apple.com/app/id6760418898')
  expect(money2TimeStoreUrl('android')).toBe(
    'https://play.google.com/store/apps/details?id=com.nelsongan.money2time',
  )
  expect(money2TimeStoreUrl('web')).toBe('https://money2time.com/download')
})
