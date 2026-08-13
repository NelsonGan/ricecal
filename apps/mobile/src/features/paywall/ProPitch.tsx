import { Image } from 'expo-image'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Plan } from '@/data'
import { usePlanPrices } from '@/data'
import { FactRow } from '@/features/onboarding'
import { PlanPicker } from '@/features/shared'
import { Card, Icon, type IconProps, Text } from '@/ui'

const MASCOT = require('../../../assets/brand/mascot.png')

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
}

/**
 * The sales half of both paywall screens.
 *
 * Shared because they were diverging: two files with the same mascot, the same
 * perks and the same plan picker, and a change to one silently made the other
 * the old version. What differs between them is how you LEAVE — the onboarding
 * one offers "Maybe later", the standing one has a back chevron — so that is
 * what stays in the screens.
 */
export function ProPitch({ plan, onPlanChange }: ProPitchProps) {
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
        <Image source={MASCOT} style={{ width: 72, height: 72 }} contentFit="contain" />
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
            {t('hard.assurance')}
          </Text>
        </View>
        {/* The sentence needs the price, so it waits for it rather than
            printing half of itself. */}
        <Text variant="caption" className="text-center text-faint">
          {smallPrint}
        </Text>
      </View>
    </>
  )
}
