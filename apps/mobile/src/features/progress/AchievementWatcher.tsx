import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useAchievements, useSession } from '@/data'
import { useToast } from '@/ui'

/**
 * Announces a badge the moment it is earned, wherever the user happens to be.
 *
 * Renders nothing. It exists because the badges are derived rather than
 * awarded: nothing writes "you earned this", so there is no write path to hang
 * a notification off. Watching the evaluated set and reporting what is new is
 * the equivalent, and it works no matter which action pushed the count over —
 * a glass of water, a photo, or simply the day rolling over.
 *
 * Mounted once under the toast provider so it survives navigation; the toast
 * would otherwise be cancelled by the screen that triggered it popping.
 */
export function AchievementWatcher() {
  // Mounted above the router's guard so it survives navigation, which means it
  // also renders with no session — and everything below reads user-scoped
  // queries. Splitting the component is what keeps `useUserId` honest about
  // throwing rather than making it return null for everybody.
  const { userId } = useSession()
  return userId ? <Watcher /> : null
}

function Watcher() {
  const { t } = useTranslation('progress')
  const achievements = useAchievements()
  const toast = useToast()

  // Seeded on the first render with whatever is already earned, so opening the
  // app does not congratulate the user for a badge they got last week.
  const known = useRef<Set<string>>(undefined)

  useEffect(() => {
    const earned = achievements.filter((badge) => badge.earned)

    if (!known.current) {
      known.current = new Set(earned.map((badge) => badge.id))
      return
    }

    const fresh = earned.filter((badge) => !known.current?.has(badge.id))
    if (fresh.length === 0) return

    for (const badge of fresh) known.current.add(badge.id)

    // One toast even when two land together: two stacked congratulations for
    // the same glass of water reads as a bug.
    const [first] = fresh
    toast.show({
      title: t('achievements.unlocked', { badge: t(`achievements.badges.${first.labelKey}`) }),
      description:
        fresh.length > 1
          ? t('achievements.unlockedMore', { count: fresh.length - 1 })
          : t(`achievements.detail.${first.unit}`, { count: first.value }),
      tone: 'success',
      icon: first.icon,
    })
  }, [achievements, toast, t])

  return null
}
