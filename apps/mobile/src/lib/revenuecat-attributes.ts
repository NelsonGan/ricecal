/** SDK attribute setters cache locally; only a successful HTTP response confirms delivery. */
export async function deliverRevenueAttributes(
  apiKey: string,
  userId: string,
  values: Record<string, string>,
  request: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<boolean> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(false)
      }, timeoutMs)
    })
    const updatedAt = Date.now()
    const delivery = request(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/attributes`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attributes: Object.fromEntries(
            Object.entries(values).map(([key, value]) => [
              key,
              { value, updated_at_ms: updatedAt },
            ]),
          ),
        }),
        signal: controller.signal,
      },
    ).then(
      (response) => response.status === 200,
      () => false,
    )
    return await Promise.race([delivery, timeout])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
