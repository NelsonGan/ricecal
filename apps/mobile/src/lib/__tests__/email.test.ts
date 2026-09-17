import { isValidEmailAddress, normalizeEmailAddress } from '../email'

describe('email addresses', () => {
  it.each([
    'aisyah@example.com',
    "o'hara+rice@example.co.uk",
    'USER@EXAMPLE.COM',
    'apple-user@privaterelay.appleid.com',
    'person@xn--bcher-kva.de',
  ])('accepts %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(true)
  })

  it.each([
    '',
    'aisyah@',
    'aisyah@example',
    'aisyah example@example.com',
    '.aisyah@example.com',
    'aisyah.@example.com',
    'aisyah..gan@example.com',
    'aisyah@example..com',
    'aisyah@-example.com',
    'aisyah@example-.com',
  ])('rejects malformed address %s', (email) => {
    expect(isValidEmailAddress(email)).toBe(false)
  })

  it.each(['person@gmial.com', 'person@gmail.comn', 'person@gmail.comel'])(
    'rejects provider typo %s seen in delivery failures',
    (email) => {
      expect(isValidEmailAddress(email)).toBe(false)
    },
  )

  it('trims keyboard whitespace without changing the address', () => {
    expect(normalizeEmailAddress('  aisyah@example.com ')).toBe('aisyah@example.com')
    expect(isValidEmailAddress('  aisyah@example.com ')).toBe(true)
  })
})
