import { getLocales } from 'expo-localization'

export type ExamplePlace = {
  name: string
  address: string
  dish: 'chicken-rice' | 'char-kuey-teow'
}

/**
 * The place in the picture, by the phone's region: one the reader might have
 * eaten at in Malaysia and in Singapore, and the Singapore one everywhere else.
 * A place's name is data, never translated, as Apple Maps gives it.
 */
const SINGAPORE: ExamplePlace = {
  name: 'Maxwell Food Centre',
  address: '1 Kadayanallur St',
  dish: 'chicken-rice',
}
const PLACES: Partial<Record<string, ExamplePlace>> = {
  MY: {
    name: 'Jalan Alor Food Street',
    address: 'Bukit Bintang',
    dish: 'char-kuey-teow',
  },
  SG: SINGAPORE,
}

/** The region the phone is set to, which is where most people eat. */
export function examplePlace(region = getLocales()[0]?.regionCode): ExamplePlace {
  return (region && PLACES[region]) || SINGAPORE
}
