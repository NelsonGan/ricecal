/** Native providers register this seam after startup; RevenueCat also starts before them. */
export type RevenueAnalytics = {
  link(userId: string): Promise<{
    appInstanceId: string
    confirm(): Promise<void>
  } | null>
}

let bridge: RevenueAnalytics | null = null

export function registerRevenueAnalytics(next: RevenueAnalytics | null): void {
  bridge = next
}

export async function revenueAnalyticsLink(userId: string) {
  const target = bridge
  const link = await target?.link(userId)
  if (!link) return null
  return {
    appInstanceId: link.appInstanceId,
    confirm: async () => {
      if (bridge === target) await link.confirm()
    },
  }
}
