import { deliverRevenueAttributes } from '../revenuecat-attributes'

it('uploads the real identifiers with the public SDK key and encoded account path', async () => {
  const request = jest.fn().mockResolvedValue({ status: 200 })
  expect(
    await deliverRevenueAttributes(
      'public-key',
      'account/id',
      {
        $firebaseAppInstanceId: 'firebase-installation',
        $mixpanelDistinctId: 'account/id',
      },
      request,
    ),
  ).toBe(true)
  const [url, options] = request.mock.calls[0]
  expect(url).toBe('https://api.revenuecat.com/v1/subscribers/account%2Fid/attributes')
  expect(options.headers.Authorization).toBe('Bearer public-key')
  expect(JSON.parse(options.body).attributes.$firebaseAppInstanceId.value).toBe(
    'firebase-installation',
  )
})

it.each([400, 401, 429, 500])('does not acknowledge an HTTP %s', async (status) => {
  expect(
    await deliverRevenueAttributes('key', 'user', {}, jest.fn().mockResolvedValue({ status })),
  ).toBe(false)
})

it('bounds even a transport that ignores abort', async () => {
  jest.useFakeTimers()
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    () => new Promise<Response>(() => {}),
  )
  const delivery = deliverRevenueAttributes('key', 'user', {}, request, 50)
  await jest.advanceTimersByTimeAsync(50)
  expect(await delivery).toBe(false)
  expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true)
  jest.useRealTimers()
})
