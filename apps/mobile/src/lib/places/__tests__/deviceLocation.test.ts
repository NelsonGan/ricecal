import { placeFromGeocodedAddress } from '../deviceLocation'
import { appleLanguage } from '../placeSearch'

/** Naming the spot the phone is at, from its own geocoder's answer. */

const HERE = { latitude: 3.13778, longitude: 101.62339 }

describe('placeFromGeocodedAddress', () => {
  it('keeps a point of interest and puts the street under it', () => {
    expect(
      placeFromGeocodedAddress(HERE, {
        name: 'Village Park Restaurant',
        streetNumber: '5',
        street: 'Jalan SS 21/37',
        district: 'Damansara Utama',
        city: 'Petaling Jaya',
        isoCountryCode: 'my',
      }),
    ).toEqual({
      id: null,
      name: 'Village Park Restaurant',
      address: '5 Jalan SS 21/37, Damansara Utama, Petaling Jaya',
      ...HERE,
      category: null,
      countryCode: 'MY',
    })
  })

  it('does not repeat a street iOS spelled with a comma as the name', () => {
    expect(
      placeFromGeocodedAddress(HERE, {
        name: '3, Jalan SS 21/37',
        streetNumber: '3',
        street: 'Jalan SS 21/37',
        city: 'Petaling Jaya',
      })?.address,
    ).toBe('Petaling Jaya')
  })

  it('uses the street when the name is only a house number, and gives up on nothing', () => {
    expect(
      placeFromGeocodedAddress(HERE, { name: '12', streetNumber: '12', street: 'Jalan Telawi' })
        ?.name,
    ).toBe('12 Jalan Telawi')
    expect(placeFromGeocodedAddress(HERE, {})).toBeNull()
  })
})

describe('appleLanguage', () => {
  it("passes the app's language codes through, Filipino as Apple names it", () => {
    expect(appleLanguage('zh-Hans')).toBe('zh-Hans')
    expect(appleLanguage('ms')).toBe('ms')
    expect(appleLanguage('fil')).toBe('tl')
    expect(appleLanguage('not a tag')).toBeNull()
    expect(appleLanguage(null)).toBeNull()
  })
})
