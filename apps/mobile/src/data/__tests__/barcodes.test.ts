const mockInvoke = jest.fn()
// Called through, because `jest.mock` is hoisted above the `const` it names.
jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}))

import { offerPacketName } from '../barcodes'

/**
 * Telling the server a scanned entry was renamed.
 *
 * Only the id goes up. The function reads the new name off the saved row and
 * the figures off the panel it kept, so the request carries nothing a caller
 * could use to choose what strangers are shown for a barcode.
 */
describe('offerPacketName', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('sends the entry id to the barcode function and nothing else', () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, contributed: true }, error: null })
    offerPacketName('e0000000-0000-4000-8000-000000000029')
    expect(mockInvoke).toHaveBeenCalledWith('barcode', {
      body: { named: 'e0000000-0000-4000-8000-000000000029' },
    })
  })

  // The rename is already saved by the time this runs, so neither kind of
  // failure may surface: `invoke` answers an HTTP error as `{ error }` and
  // rejects only when the request never left.
  it.each([
    [
      'answers with an error',
      () => mockInvoke.mockResolvedValue({ data: null, error: new Error('500') }),
    ],
    ['rejects', () => mockInvoke.mockRejectedValue(new Error('offline'))],
  ])('stays quiet when the call %s', async (_label, fail) => {
    fail()
    const unhandled = jest.fn()
    process.on('unhandledRejection', unhandled)
    try {
      expect(() => offerPacketName('e0000000-0000-4000-8000-000000000029')).not.toThrow()
      await new Promise((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
