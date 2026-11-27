import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type Plan, usePlanPrices } from '@/data'
import { datePattern } from '@/lib/dates'
import { Card, cn, Icon, type IconProps, Text } from '@/ui'
import { trialTimeline } from './trial'

/** The dot each step hangs on: one of the app's illustrations in a soft disc. */
const DOT = 40

type Step = {
  key: string
  icon: IconProps
  disc: string
  title: string
  body: string
}

/**
 * What happens after "Start free trial", as dates rather than as a promise in
 * small print: everything unlocks today, a reminder arrives before the trial
 * ends, and the first charge lands on a named day. The reminder is a real
 * notification, booked by `useTrialReminderSync` once the trial has started.
 *
 * Shown only for a plan the store says this account gets a trial on, and only
 * once the store has answered: a timeline without its price or its dates would
 * be the vague promise it is here to replace.
 */
export function TrialTimeline({ plan }: { plan: Plan }) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()
  const selected = plan === 'lifetime' ? undefined : prices?.[plan]
  const duration = selected?.freeTrialEligible ? selected.trialDuration : undefined
  const price = selected?.priceString
  // Fixed for the life of the screen, so the dates do not move under a reader
  // who leaves it open over midnight halfway through reading them.
  const timeline = useMemo(() => (duration ? trialTimeline(duration) : null), [duration])
  if (!timeline || !price) return null

  // The date alone, as the Today title writes a day ("Tue 1 Dec"). A trial-day
  // count in front of it ("Day 4, 1 Dec") read as two answers to one question.
  const day = (date: Date) => format(date, datePattern('weekdayDayMonth'))

  const steps: Step[] = [
    {
      key: 'today',
      icon: { set: 'system', name: 'crown' },
      disc: 'border-pandan-soft-line bg-pandan-soft',
      title: t('timeline.today'),
      body: t('timeline.todayBody'),
    },
  ]
  if (timeline.remindAt) {
    steps.push({
      key: 'remind',
      icon: { set: 'system', name: 'bell' },
      disc: 'border-kaya-soft-line bg-kaya-soft',
      title: day(timeline.remindAt),
      body: t('timeline.remindBody', { count: timeline.leadDays }),
    })
  }
  steps.push({
    key: 'charge',
    icon: { set: 'system', name: 'card' },
    disc: 'border-line bg-canvas',
    title: day(timeline.endsAt),
    body: t('timeline.chargeBody', { price }),
  })

  return (
    <View className="mt-md gap-3">
      <Text variant="subtitle">{t('timeline.title')}</Text>
      <Card contentClassName="p-card">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <View key={step.key} className="flex-row gap-3.5" accessible>
              <View className="items-center" style={{ width: DOT }}>
                <View
                  className={cn('items-center justify-center rounded-full border-2', step.disc)}
                  style={{ width: DOT, height: DOT }}
                >
                  <Icon {...step.icon} size={24} />
                </View>
                {/* The rail to the next step. Green out of today, which has
                    already happened the moment the trial starts; grey after. */}
                {last ? null : (
                  <View
                    className={cn(
                      'w-[3px] flex-1 rounded-full',
                      index === 0 ? 'bg-pandan' : 'bg-line-strong',
                    )}
                  />
                )}
              </View>
              <View className={cn('flex-1 pt-0.5', last ? '' : 'pb-6')}>
                <Text variant="label">{step.title}</Text>
                <Text variant="meta">{step.body}</Text>
              </View>
            </View>
          )
        })}
      </Card>
    </View>
  )
}
