import { examplePlace } from '../examplePlace'

jest.mock('expo-localization', () => ({ getLocales: () => [{ regionCode: 'MY' }] }))

it('draws a Malaysian place in Malaysia and a Singaporean one in Singapore', () => {
  expect(examplePlace('MY').name).toBe('Jalan Alor Food Street')
  expect(examplePlace('SG').name).toBe('Maxwell Food Centre')
})

it('falls back to the Singapore place everywhere else, and with no region', () => {
  expect(examplePlace('JP').name).toBe('Maxwell Food Centre')
  expect(examplePlace(null).name).toBe('Maxwell Food Centre')
})

it("reads the phone's region by default", () => {
  expect(examplePlace().name).toBe('Jalan Alor Food Street')
})
