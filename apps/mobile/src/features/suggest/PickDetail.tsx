import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { MealPick, Reason } from '@/data'
import { useActivityDay, useDayLog, useSelectedDate, useSettings, useTargets } from '@/data'
import { sumMacros } from '@/lib/nutrition'
import { Badge, Card, Icon, MacroBar, Text } from '@/ui'
import { REASON_ICONS } from './ask'

export type PickDetailProps = {
  pick: MealPick
  /** The day it was suggested against. Falls back to whichever day is selected. */
  date?: string
}

/**
 * One reason, with the picture that says what it is about.
 *
 * The kind is a closed set of five, checked on the server — see `ReasonKind` —
 * so this map is total and there is no fallback to draw. A sixth kind cannot
 * arrive; if one ever did it would be dropped there rather than rendered blank
 * here.
 */
function Why({ reason }: { reason: Reason }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-[30px] w-[30px] items-center justify-center rounded-sm bg-pandan-soft">
        <Icon {...REASON_ICONS[reason.kind]} size={18} />
      </View>
      <Text variant="meta" className="flex-1 text-body">
        {reason.text}
      </Text>
    </View>
  )
}

/**
 * One suggestion, read, inside the picks sheet rather than on a page of its own.
 * A pushed screen meant the panel closed on the way in and rose again on the way
 * out, so reading two picks was four transitions, and the way back had to be
 * reconstructed from a counter on a provider. The body swaps and the panel does
 * not move.
 *
 * There is no way to log from here, which is the feature. A pick is the model's
 * guess about a dish nobody has cooked, priced from a sentence rather than a
 * catalogue row, and an entry written from one would sit in the diary wearing the
 * same face as a measured meal. The estimate tier was unwound for exactly this.
 *
 * So what it owes the reader is enough to decide: the figures, what they are a
 * figure for, what the day would look like afterwards, and why this was offered.
 */
export function PickDetail({ pick, date }: PickDetailProps) {
  const { t } = useTranslation('suggest')

  /**
   * The day this was suggested against, so the badge can say what eating it
   * would leave.
   *
   * Read here rather than carried from the row, because the day moves: a meal
   * logged while the picks were on screen changes what is left, and a figure
   * frozen at the moment of asking would be quietly wrong by the time anybody
   * acted on it. The same three queries and the same arithmetic Today does —
   * `goal + active - eaten` — because a second answer to "what is left" on a
   * second surface is how two surfaces come to disagree about one day.
   */
  const { selectedDate } = useSelectedDate()
  // The day it was asked about, or the one on screen: a pick is only ever drawn
  // with the request that produced it, so the fallback is a belt.
  const on = date ?? selectedDate
  const day = useDayLog(on)
  const { data: targets } = useTargets()
  const { data: activity } = useActivityDay(on)
  const { data: settings } = useSettings()

  const burned = settings?.activity_extends_budget === false ? 0 : (activity?.activeKcal ?? 0)
  const left = targets ? (targets.kcal ?? 0) + burned - sumMacros(day.entries).kcal : null
  const after = left === null ? null : left - pick.kcal

  return (
    <>
      {/* The drawing, big, on its own ground. A suggestion has no photograph and
          never will, so this is the only picture of it there is — and a list of
          seven that each led with a 52pt tile deserves one view where the dish
          is the thing being looked at. */}
      <View className="h-[118px] items-center justify-center rounded-card bg-track">
        <Icon {...(pick.icon ?? { set: 'food', name: 'empty-plate' })} size={88} />
      </View>

      <Card>
        <View className="flex-row items-end justify-between gap-3">
          {/* The figure's column SHRINKS and the badge does not. A portion is
              free text off the model and "one bowl with rice" is longer than
              the tile it sits under; laid out at its natural width it pushed
              the badge off the right edge of the card, where it read as
              "2,250 kcal left afte". The figure is the same size either way,
              so what gives is the line under it. */}
          <View className="min-w-0 flex-1">
            {/* `displayMd`, which is what the logged-entry screen prints its own
                calorie total in — and its line box is the point rather than its
                size. Written as `text-[34px] leading-[38px]`, the leading was
                tighter than Baloo 2's own line box and the tops of the digits
                were clipped. A display face needs the room its variant gives it. */}
            <Text variant="displayMd">{pick.kcal.toLocaleString()}</Text>
            <Text variant="overlineSm" numberOfLines={2}>
              {t('detail.unit', { portion: pick.portion.toUpperCase() })}
            </Text>
          </View>

          {/* What the day would have left afterwards, which is the one number
              here the reader cannot work out themselves. Absent on an account
              with no budget: there is nothing to be left OF. */}
          {after !== null ? (
            <Badge className="shrink-0" tone={after >= 0 ? 'pandan' : 'kaya'}>
              <Text variant="caption" className={after >= 0 ? 'text-pandan-ink' : 'text-kaya-ink'}>
                {after >= 0
                  ? t('detail.leftAfter', { kcal: after.toLocaleString() })
                  : t('detail.overAfter', { kcal: Math.abs(after).toLocaleString() })}
              </Text>
            </Badge>
          ) : null}
        </View>

        {/* The macros as bars rather than as a row of figures, because the point
            of the panel here is the SHAPE of the dish — heavy in what — and
            three numbers side by side do not have a shape. Each is drawn
            against a plausible ceiling for one meal rather than against the
            day's target: the bar is about this dish, and a 42 g protein bowl
            filling a tenth of the day says nothing about the bowl. */}
        <View className="gap-3 pt-3">
          <MacroBar
            label={t('detail.protein')}
            amount={`${pick.proteinG}g`}
            value={pick.proteinG / MEAL_MACRO_CEILING.protein}
            tone="hibiscus"
          />
          <MacroBar
            label={t('detail.carbs')}
            amount={`${pick.carbsG}g`}
            value={pick.carbsG / MEAL_MACRO_CEILING.carbs}
            tone="kaya"
          />
          <MacroBar
            label={t('detail.fat')}
            amount={`${pick.fatG}g`}
            value={pick.fatG / MEAL_MACRO_CEILING.fat}
            tone="teh"
          />
          {/* In three words rather than in milligrams. A sodium figure for a
              dish nobody has cooked is a number with no provenance, and it
              would borrow the authority of the three bars above it. */}
          <View className="flex-row items-center justify-between">
            <Text variant="label">{t('detail.sodium')}</Text>
            {/* Interpolated into the key, which typed i18n cannot narrow on its
                own — the union is the server's `Sodium` and the three keys are
                written out beside it. */}
            <Text variant="meta">{t(SODIUM_KEY[pick.sodium])}</Text>
          </View>
        </View>
      </Card>

      <Card title={t('detail.why')}>
        <View className="gap-3">
          {pick.why.map((reason: Reason) => (
            <Why key={reason.text} reason={reason} />
          ))}
        </View>
      </Card>
    </>
  )
}

/**
 * What a bar here is drawn against.
 *
 * A plausible ceiling for ONE MEAL rather than the day's own target, because
 * these bars are about the dish and not about the budget: read against a daily
 * 150 g protein goal, a bowl carrying 42 g of it draws a quarter full and looks
 * like a light meal, which is the opposite of what it is. Round numbers, and
 * deliberately not derived from anything — a figure computed off the user's
 * profile would imply a precision these estimates do not have.
 */
const MEAL_MACRO_CEILING = { protein: 50, carbs: 90, fat: 40 } as const

/** The three saltiness keys, written out so the lookup is typed. */
const SODIUM_KEY = {
  low: 'sodium.low',
  medium: 'sodium.medium',
  high: 'sodium.high',
} as const
