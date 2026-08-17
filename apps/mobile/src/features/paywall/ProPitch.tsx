import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { FactRow } from '@/features/onboarding'
import { PlanPicker } from '@/features/shared'
import { Button, Card, Icon, type IconProps, Text } from '@/ui'

/**
 * The app's icon, not the mascot.
 *
 * The mascot is a character; this screen is asking somebody to buy a PRODUCT,
 * and the square at the top of it should be the one they are about to keep on
 * their home screen. It is the same swap the welcome screen made, for the same
 * reason, and the two are the first and last screens of the flow.
 */
const LOGO = require('../../../assets/icon.png')

/**
 * Everything Pro includes, in the order somebody would meet it.
 *
 * ALL OF IT, not a selection. There is no free tier to compare against, so a
 * two-column "free vs Pro" table would have an empty column and an argument to
 * make; a list of what you get has neither. The three-perk summary this
 * replaced sold photo scanning and left the diary, the reviews, the health
 * sync and the recipes unmentioned, which is most of the app.
 *
 * The order is the order of use: the four ways a meal gets in, then what the
 * app does with it, then what it does over time.
 *
 * Copy keys rather than strings so this stays translatable, and one array so
 * adding a feature is one entry rather than a hunt through JSX.
 */
const FEATURES = [
  { key: 'snap', icon: { set: 'system', name: 'camera' } },
  { key: 'describe', icon: { set: 'system', name: 'sparkle' } },
  { key: 'barcode', icon: { set: 'system', name: 'barcode' } },
  { key: 'search', icon: { set: 'ui', name: 'search' } },
  { key: 'recipes', icon: { set: 'food', name: 'cooking-pot' } },
  { key: 'budget', icon: { set: 'body', name: 'target' } },
  { key: 'health', icon: { set: 'body', name: 'footprints' } },
  { key: 'trends', icon: { set: 'body', name: 'chart-up' } },
  { key: 'reviews', icon: { set: 'ui', name: 'diary' } },
  { key: 'reminders', icon: { set: 'system', name: 'bell' } },
  // `as const` so each `key` stays a literal. Widened to `string` the copy
  // lookups below stop typechecking, which is the whole value of the typed
  // bundle: a feature added here without copy would otherwise ship as a blank
  // row rather than failing the build.
] as const satisfies ReadonlyArray<{ key: string; icon: IconProps }>

export type ProPitchProps = {
  plan: Plan
  onPlanChange: (plan: Plan) => void
  /**
   * Restoring a purchase, as a LINK at the end of the page rather than a button
   * in the footer.
   *
   * Only the onboarding paywall passes it, and the placement is the point.
   * Pinned under "Maybe later" it was a third full-width control in a stack of
   * three, which made "Restore purchase" look like one of the ways forward from
   * this screen — it is not, it is the escape hatch for somebody who has
   * already paid on another phone. Under the small print it is where every
   * other app puts it, and the two people a month who need it know to scroll.
   *
   * The standing paywall keeps its footer button: it is reached from a refused
   * tap rather than from a flow, and somebody arriving there having already
   * paid is a likelier visitor.
   */
  onRestore?: () => void
}

/**
 * The sales half of both paywall screens.
 *
 * Shared because they were diverging: two files with the same mark at the top,
 * the same perks and the same plan picker, and a change to one silently made
 * the other the old version. What differs between them is how you LEAVE — the
 * onboarding one offers "Maybe later", the standing one has a back chevron —
 * so that is what stays in the screens.
 */
export function ProPitch({ plan, onPlanChange, onRestore }: ProPitchProps) {
  const { t } = useTranslation('paywall')
  const { data: prices } = usePlanPrices()

  const priceString = prices?.[plan]?.priceString
  const smallPrint = !priceString
    ? t('hard.smallPrintPending')
    : plan === 'lifetime'
      ? t('hard.smallPrintLifetime', { price: priceString })
      : plan === 'yearly'
        ? t('hard.smallPrintYearly', { price: priceString })
        : t('hard.smallPrintMonthly', { price: priceString })

  return (
    <>
      <View className="items-center gap-2.5">
        <Image
          source={LOGO}
          style={{ width: 76, height: 76, borderRadius: 18 }}
          contentFit="cover"
        />
        <Text variant="title" className="text-center">
          {t('hard.title')}
        </Text>
      </View>

      {/* Every feature, not a highlight reel. See `FEATURES`. */}
      <Card title={t('hard.everything')}>
        <View className="gap-4">
          {FEATURES.map((feature) => (
            <FactRow
              key={feature.key}
              icon={feature.icon}
              title={t(`hard.features.${feature.key}.title`)}
              body={t(`hard.features.${feature.key}.body`)}
            />
          ))}
        </View>
      </Card>

      <PlanPicker showLifetime value={plan} onChange={onPlanChange} />

      <View className="items-center gap-1.5">
        <View className="flex-row items-center gap-2">
          <Icon set="system" name="shield" size={16} />
          <Text variant="caption" className="text-pandan-ink">
            {/* Branches with the small print below it, or the two contradict
                each other. See `assuranceLifetime`. */}
            {t(plan === 'lifetime' ? 'hard.assuranceLifetime' : 'hard.assurance')}
          </Text>
        </View>
        {/* The sentence needs the price, so it waits for it rather than
            printing half of itself. */}
        <Text variant="caption" className="text-center text-faint">
          {smallPrint}
        </Text>

        {onRestore ? (
          // `self-center` because `Button` sets `self-start` on its own
          // container, and align-self beats the column's align-items.
          <Button variant="ghost" size="sm" className="self-center" onPress={onRestore}>
            {t('hard.restore')}
          </Button>
        ) : null}
      </View>
    </>
  )
}
