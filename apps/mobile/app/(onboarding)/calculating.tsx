import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { stepNumber, TOTAL_STEPS } from '@/features/onboarding'
import { cn, Icon, Screen, Spinner, StepProgress, Text } from '@/ui'

/**
 * 05 CALCULATING
 *
 * A beat between the last question and the number.
 *
 * Nothing is computed here — `computeTargets` on the next screen is arithmetic
 * over five fields and returns in well under a millisecond. This screen exists
 * because the answer arriving instantly reads as a default rather than as a
 * result: the user gives their height, their weight, their target and how they
 * spend their day, and a budget that appears in the same frame as the tap looks
 * like it was in the app before they got there.
 *
 * So the three lines are honest about what the number is made of — the budget,
 * the split, the catalogue it will be spent against — and the wait is the length
 * of reading them. It is deliberately short: a fake progress bar that outlasts
 * its own explanation is the other failure mode, and it is the more annoying one.
 *
 * `replace`, not `push`. The back chevron from the target screen belongs on the
 * last QUESTION; a screen that immediately advances again is a trap you cannot
 * walk out of backwards.
 */

/** How long each line holds before the next one starts. */
const TICK_MS = 700

/** The pause after the last tick, so the final check is seen and not merely drawn. */
const SETTLE_MS = 450

const LINES = ['budget', 'macros', 'catalogue'] as const

export default function CalculatingStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()

  /** How many lines are done. Counts past the last one, which is the cue to leave. */
  const [done, setDone] = useState(0)

  useEffect(() => {
    // One timer at a time rather than an interval, so the last gap can be
    // longer than the others and the cleanup has exactly one handle to clear.
    const timer = setTimeout(
      () => {
        if (done < LINES.length) {
          setDone((count) => count + 1)
          return
        }
        router.replace('/(onboarding)/target')
      },
      done < LINES.length ? TICK_MS : SETTLE_MS,
    )

    return () => clearTimeout(timer)
  }, [done, router])

  return (
    <Screen scroll={false}>
      <StepProgress
        total={TOTAL_STEPS}
        current={stepNumber('calculating')}
        tone="pandan"
        accessibilityLabel={t('common:a11y.step', {
          current: stepNumber('calculating'),
          total: TOTAL_STEPS,
        })}
      />

      <View className="flex-1 justify-center gap-8">
        <View className="items-center gap-4">
          <Spinner />
          <Text variant="title" className="text-center">
            {t('onboarding:calculating.title')}
          </Text>
          <Text className="text-center text-[16px] leading-[24px]">
            {t('onboarding:calculating.subtitle')}
          </Text>
        </View>

        <View className="gap-3.5">
          {LINES.map((line, index) => (
            <Line
              key={line}
              label={t(`onboarding:calculating.steps.${line}`)}
              done={index < done}
            />
          ))}
        </View>
      </View>
    </Screen>
  )
}

/**
 * One line of the tally.
 *
 * The tick's box is the same size whether it holds a check or not, so the label
 * beside it does not shuffle sideways as each line lands — three lines settling
 * one after another is the whole of the animation, and it only reads as settling
 * if nothing else moves.
 */
function Line({ label, done }: { label: string; done: boolean }) {
  return (
    <View className="flex-row items-center gap-3.5" accessible accessibilityState={{ busy: !done }}>
      <View
        className={cn(
          'h-8 w-8 items-center justify-center rounded-full border-2',
          done ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
        )}
      >
        {done ? <Icon set="ui" name="check" size={18} /> : null}
      </View>
      <Text variant="bodyStrong" className={done ? undefined : 'text-muted'}>
        {label}
      </Text>
    </View>
  )
}
