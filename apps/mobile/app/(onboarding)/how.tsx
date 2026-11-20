import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ONBOARDING_ART, OnboardingStep } from '@/features/onboarding'
import { Icon, type IconProps, ProgressBar, Text } from '@/ui'

/**
 * The sample scan, as the diary would hold it.
 *
 * Food is never translated, so the dish names live here in the catalogue's
 * spelling rather than in a bundle. The figures are the macro split of the
 * kcal (68 × 4 + 29 × 4 + 28 × 9 ≈ 644), so the card adds up for anybody
 * who checks it.
 */
const SAMPLE = { name: 'Nasi lemak ayam', kcal: 644, carbs: 68, protein: 29, fat: 28 }

/** The bars are drawn against a typical day, the same scale Today uses. */
const DAY = { carbs: 250, protein: 110, fat: 65 }

const MORE: { name: string; kcal: number; icon: IconProps }[] = [
  { name: 'Laksa', kcal: 482, icon: { set: 'dishes', name: 'laksa' } },
  { name: 'Roti canai', kcal: 385, icon: { set: 'dishes', name: 'roti-canai' } },
  { name: 'Pad thai', kcal: 560, icon: { set: 'dishes', name: 'pad-thai' } },
]

/**
 * HOW IT WORKS, the first step.
 *
 * Shown before a single question, because the welcome screen promises the app
 * counts a plate from a photo and this is where that promise is kept: a real
 * plate, the corners of the viewfinder over it, and the entry it turns into.
 * The tour used to say this in four cards of prose after the account; somebody
 * deciding whether to answer twelve screens of questions needs it first.
 *
 * Nothing on it is interactive. It is a picture of the product, not a demo of
 * the camera, which needs a permission this flow has not asked for.
 */
export default function HowStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()

  return (
    <OnboardingStep
      name="how"
      art={{ set: 'scenes', name: 'phone' }}
      title={t('how.title')}
      subtitle={t('how.subtitle')}
      onBack={() => router.dismissTo('/(onboarding)/welcome')}
      primaryLabel={t('common:action.continue')}
      onPrimary={() => router.push('/(onboarding)/setup')}
    >
      <View
        accessible
        accessibilityLabel={`${SAMPLE.name}, ${SAMPLE.kcal} ${t('common:unit.kcal')}`}
      >
        <View className="h-[190px] overflow-hidden rounded-card">
          <Image
            source={ONBOARDING_ART.nasiLemak}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={0}
          />
          <Viewfinder />
        </View>

        {/* Lifted onto the photo's lower edge, so the photo and the entry it
            became read as one thing happening rather than two cards. */}
        <View className="-mt-10 mx-3 gap-3 rounded-tile border-2 border-line bg-surface p-4">
          <View className="flex-row items-end justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text variant="bodyStrong" numberOfLines={1}>
                {SAMPLE.name}
              </Text>
              <Text variant="meta">{t('how.portion')}</Text>
            </View>
            <Text variant="numeric" className="text-[28px] leading-[32px]">
              {SAMPLE.kcal}
              <Text variant="meta"> {t('common:unit.kcal')}</Text>
            </Text>
          </View>
          <View className="gap-2">
            <Macro
              label={t('common:macro.carbs')}
              unit={t('common:unit.gram')}
              grams={SAMPLE.carbs}
              of={DAY.carbs}
              tone="kaya"
            />
            <Macro
              label={t('common:macro.protein')}
              unit={t('common:unit.gram')}
              grams={SAMPLE.protein}
              of={DAY.protein}
              tone="hibiscus"
            />
            <Macro
              label={t('common:macro.fat')}
              unit={t('common:unit.gram')}
              grams={SAMPLE.fat}
              of={DAY.fat}
              tone="teh"
            />
          </View>
        </View>
      </View>

      <View className="flex-row gap-2">
        {MORE.map((dish) => (
          <View
            key={dish.name}
            className="min-w-0 flex-1 flex-row items-center gap-1.5 rounded-sm border-2 border-line bg-surface px-2 py-2"
            accessible
            accessibilityLabel={`${dish.name}, ${dish.kcal} ${t('common:unit.kcal')}`}
          >
            <Icon {...dish.icon} size={30} />
            <View className="min-w-0 flex-1">
              <Text variant="caption" numberOfLines={1} className="text-ink">
                {dish.name}
              </Text>
              <Text variant="caption">{dish.kcal}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text variant="meta" className="text-center">
        {t('how.more')}
      </Text>
    </OnboardingStep>
  )
}

/**
 * One macro: its name, its grams, its bar. The grams are their own text so a
 * long translated name ("たんぱく質") can only truncate itself, never the figure
 * the row exists to show.
 */
function Macro({
  label,
  unit,
  grams,
  of,
  tone,
}: {
  label: string
  unit: string
  grams: number
  of: number
  tone: 'kaya' | 'hibiscus' | 'teh'
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text variant="meta" className="w-[76px]" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" className="w-[40px] text-right">
        {grams}
        {unit}
      </Text>
      <ProgressBar value={grams / of} tone={tone} height={8} className="flex-1" />
    </View>
  )
}

/**
 * The camera's four corners, drawn over the photo. Decorative. The bottom edge
 * stops short of the card lifted over the photo, or two corners hide under it.
 */
function Viewfinder() {
  const corner = 'absolute h-7 w-7 border-white'
  return (
    <View
      className="absolute"
      style={{ top: 16, left: 16, right: 16, bottom: 56 }}
      pointerEvents="none"
    >
      <View className={`${corner} left-0 top-0 rounded-tl-[12px] border-l-4 border-t-4`} />
      <View className={`${corner} right-0 top-0 rounded-tr-[12px] border-r-4 border-t-4`} />
      <View className={`${corner} bottom-0 left-0 rounded-bl-[12px] border-b-4 border-l-4`} />
      <View className={`${corner} bottom-0 right-0 rounded-br-[12px] border-b-4 border-r-4`} />
    </View>
  )
}
