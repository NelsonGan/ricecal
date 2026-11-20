import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ONBOARDING_ART } from '@/features/onboarding'
import { track } from '@/lib/analytics'
import { Button, CalorieRing, Icon, Screen, Text } from '@/ui'

/**
 * The app's own icon, and the FILE rather than a copy of the drawing, so the
 * mark over the heading is the square somebody taps tomorrow.
 */
const LOGO = require('../../assets/app-mark.png')

/**
 * The sample day. Food is never translated, so the dish names are written
 * here. The ring is the budget the `how` step's plate came out of:
 * 1,880 less 644 and 120 is 1,116.
 */
const BUDGET = 1880
const MEALS = [
  { id: 'breakfast', name: 'Nasi lemak ayam', kcal: 644 },
  { id: 'snack', name: 'Teh tarik', kcal: 120 },
] as const
const EATEN = MEALS.reduce((sum, meal) => sum + meal.kcal, 0)

/**
 * 01 WELCOME
 *
 * The first screen anybody sees, and the fork between the two kinds of visitor.
 *
 * It wears the same frame as every step after it (a mark over the heading, one
 * line under it, the buttons at the foot) so the flow looks like one thing from
 * the first screen. Under the heading is the whole idea, drawn from the app's
 * own parts rather than an illustration of it: a photographed plate and a drink
 * on today's diary, and the ring saying what is left. It used to be a generated
 * picture of a plate and a phone, which said "food app" and not what it does.
 *
 * "Get started" goes straight into the flow, with no account and nothing to
 * type. Anyone who already has one takes the second button and skips it.
 */
export default function Welcome() {
  const { t } = useTranslation(['onboarding', 'common', 'logging'])
  const router = useRouter()

  /** Straight into the flow. No session needed: the answers are held locally. */
  const start = () => {
    // The top of the funnel, and the only place it can be marked. This screen
    // is also where a returning user lands, so rendering it is not the same
    // thing as starting; pressing this button is.
    track('Onboarding Started', {})
    router.push('/how')
  }

  /**
   * Skips the flow.
   *
   * `push`, so the edge swipe comes back here: someone who taps this by mistake
   * has not lost the way in. The mode says which side of that screen to open on,
   * because "I already have an account" under a "Save your progress" heading
   * reads as a tap that was ignored.
   */
  const signIn = () => router.push({ pathname: '/sign-in', params: { mode: 'sign-in' } })

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={start}>
            {t('welcome.start')}
          </Button>
          <Button variant="ghost" fullWidth onPress={signIn}>
            {t('welcome.signIn')}
          </Button>
        </View>
      }
    >
      <View className="gap-1.5 pt-3">
        <View className="pb-1">
          <Image
            source={LOGO}
            style={{ width: 48, height: 48, borderRadius: 12 }}
            contentFit="cover"
            accessible={false}
          />
        </View>
        <Text variant="title" className="text-[26px] leading-[32px]" accessibilityRole="header">
          {t('welcome.title')}
        </Text>
        <Text variant="meta" className="text-[16px] leading-[22px]">
          {t('welcome.subtitle')}
        </Text>
      </View>

      <View
        className="mt-6 gap-3 rounded-tile border-2 border-line bg-surface p-4"
        accessible
        accessibilityLabel={`${t('common:date.today')}: ${MEALS.map((meal) => `${meal.name}, ${meal.kcal} kcal`).join('; ')}. ${(BUDGET - EATEN).toLocaleString()} kcal left.`}
      >
        <View className="flex-row items-center gap-4">
          <CalorieRing
            value={EATEN}
            goal={BUDGET}
            size={104}
            thickness={11}
            tone="pandan"
            centerLabel={(BUDGET - EATEN).toLocaleString()}
            centerCaption={t('logging:today.kcalLeft')}
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="overlineSm">{t('common:date.today')}</Text>
            <Text variant="numeric">
              {EATEN.toLocaleString()}
              <Text variant="meta">
                {' '}
                / {BUDGET.toLocaleString()} {t('common:unit.kcal')}
              </Text>
            </Text>
          </View>
        </View>

        <View className="h-[2px] bg-line" />

        <View className="flex-row items-center gap-3">
          <Image
            source={ONBOARDING_ART.nasiLemak}
            style={{ width: 44, height: 44, borderRadius: 12 }}
            contentFit="cover"
            transition={0}
          />
          <MealText name={MEALS[0].name} meal={t('common:meal.breakfast')} />
          <Kcal value={MEALS[0].kcal} unit={t('common:unit.kcal')} />
        </View>
        <View className="flex-row items-center gap-3">
          <View className="h-[44px] w-[44px] items-center justify-center rounded-[12px] bg-surface-alt">
            <Icon set="dishes" name="teh-tarik" size={34} />
          </View>
          <MealText name={MEALS[1].name} meal={t('common:meal.snack')} />
          <Kcal value={MEALS[1].kcal} unit={t('common:unit.kcal')} />
        </View>
      </View>
    </Screen>
  )
}

function MealText({ name, meal }: { name: string; meal: string }) {
  return (
    <View className="min-w-0 flex-1">
      <Text variant="bodyStrong" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="meta">{meal}</Text>
    </View>
  )
}

function Kcal({ value, unit }: { value: number; unit: string }) {
  return (
    <Text variant="label">
      {value}
      <Text variant="caption"> {unit}</Text>
    </Text>
  )
}
