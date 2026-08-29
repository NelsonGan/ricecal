import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'

import { useBack } from '@/lib/navigation'
import {
  AppBar,
  Button,
  CalorieRing,
  Card,
  Chip,
  cn,
  Icon,
  type IconProps,
  MacroBar,
  Screen,
  StepProgress,
  Text,
} from '@/ui'

/**
 * How RiceCal works: four cards, and no longer part of the flow.
 *
 * Each card is a mock of the thing it is about, drawn from the same design system
 * the real screen uses. A reader with the real screen one tap away is checking
 * whether the picture matches it, so the prose is a line apiece.
 *
 * The mocks are hand-built rather than screenshots, because a picture of last
 * year's UI is worse than no picture and these are made of the components the
 * real screens are made of.
 *
 * One route rather than four: the cards are read forwards and never returned to.
 */

const CARDS = ['log', 'read', 'fix', 'day'] as const

export default function Tutorial() {
  const { t } = useTranslation(['onboarding', 'common'])
  const goBack = useBack('/today')

  const [index, setIndex] = useState(0)
  const card = CARDS[index] ?? 'log'
  const last = index === CARDS.length - 1

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => (last ? goBack() : setIndex((current) => current + 1))}>
            {last ? t('onboarding:tutorial.done') : t('common:action.continue')}
          </Button>
          {/* No skip on the last card: the primary button IS the way out, and a
              second one beside it saying the same thing in quieter type is a
              choice with no difference in it. */}
          {last ? null : (
            <Button variant="ghost" fullWidth onPress={() => goBack()}>
              {t('onboarding:tutorial.skip')}
            </Button>
          )}
        </View>
      }
    >
      <AppBar
        title={t('onboarding:tutorial.appBar')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      <StepProgress
        total={CARDS.length}
        current={index + 1}
        tone="pandan"
        accessibilityLabel={t('common:a11y.step', { current: index + 1, total: CARDS.length })}
      />

      {/* Keyed on the card, so moving forward CROSSFADES rather than swapping.
          The heading, the body and the mock all leave and arrive together — one
          movement per tap, which is what stops four different card shapes
          reading as four different screens. */}
      <Animated.View
        key={card}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(120)}
        className="gap-md"
      >
        <View className="gap-2 pt-2">
          <Text variant="title">{t(`onboarding:tutorial.${card}.title`)}</Text>
          <Text className="text-[16px] leading-[24px]">
            {t(`onboarding:tutorial.${card}.subtitle`)}
          </Text>
        </View>

        {card === 'log' ? <LogWays /> : null}
        {card === 'read' ? <Reads /> : null}
        {card === 'fix' ? <Fixes /> : null}
        {card === 'day' ? <Day /> : null}
      </Animated.View>
    </Screen>
  )
}

/**
 * The four squares, in the order and the colours the log sheet uses.
 *
 * Not `QuickAction` itself: that one is a button, and a button in a tutorial is
 * a control that does nothing when pressed. This is the same square with the
 * press taken out.
 */
function LogWays() {
  const { t } = useTranslation('onboarding')

  const ways = [
    {
      key: 'snap',
      icon: { set: 'system', name: 'camera' },
      fill: 'bg-pandan-soft',
      slab: 'bg-pandan-soft-line',
    },
    {
      key: 'describe',
      icon: { set: 'system', name: 'sparkle' },
      fill: 'bg-kaya-soft',
      slab: 'bg-kaya-soft-line',
    },
    {
      key: 'search',
      icon: { set: 'ui', name: 'search' },
      fill: 'bg-track',
      slab: 'bg-line-strong',
    },
    {
      key: 'recipes',
      icon: { set: 'food', name: 'cooking-pot' },
      fill: 'bg-water-soft',
      slab: 'bg-water-soft-line',
    },
  ] as const satisfies ReadonlyArray<{ key: string; icon: IconProps; fill: string; slab: string }>

  return (
    <>
      <Card>
        <View className="flex-row flex-wrap gap-2.5">
          {ways.map((way, position) => (
            <Animated.View
              key={way.key}
              // Staggered, so the four land one after another and the eye is
              // walked across them in the order the sheet lists them.
              entering={FadeInDown.delay(120 + position * 70).duration(300)}
              className="basis-[47%] grow"
            >
              <View className={cn('rounded-md pt-1', way.slab)}>
                <View className={cn('items-center gap-2 rounded-md px-2 py-4', way.fill)}>
                  <Icon {...way.icon} size={30} />
                  <Text variant="bodyStrong">{t(`tutorial.log.${way.key}`)}</Text>
                  <Text variant="meta" numberOfLines={1}>
                    {t(`tutorial.log.${way.key}Body`)}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ))}
        </View>
      </Card>

      <View className="flex-row items-center gap-2.5 px-1">
        <Icon set="system" name="barcode" size={24} />
        <Text variant="meta" className="flex-1">
          {t('tutorial.log.barcode')}
        </Text>
      </View>
    </>
  )
}

/** A diary row, as it appears on Today once a scan lands. */
function Reads() {
  const { t } = useTranslation(['onboarding', 'common'])

  return (
    <>
      <Animated.View entering={FadeInDown.delay(120).duration(320)}>
        <Card>
          <View className="flex-row items-center gap-3.5">
            {/* A tinted square standing in for the photograph, because a stock
                plate would be the one thing on this card that is not the user's
                own. */}
            <View className="h-[56px] w-[56px] items-center justify-center rounded-md bg-pandan-soft">
              <Icon set="dishes" name="nasi-lemak" size={40} />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="bodyStrong">{t('onboarding:tutorial.read.exampleName')}</Text>
              <Text variant="meta">{t('onboarding:tutorial.read.exampleDetail')}</Text>
            </View>
            <View className="items-end">
              <Text className="font-display text-[26px] leading-[31px] text-heading">
                {t('onboarding:tutorial.read.exampleKcal')}
              </Text>
              <Text variant="caption">{t('common:unit.kcal')}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View className="flex-row items-center gap-2.5 px-1">
        <Icon set="system" name="camera" size={24} />
        <Text variant="meta" className="flex-1">
          {t('onboarding:tutorial.read.tip')}
        </Text>
      </View>
    </>
  )
}

/**
 * The correction, as the two numbers either side of it.
 *
 * Before and after rather than one row with an arrow, because the point is that
 * the entry MOVES — and the chips above them are the real ones from `FixSheet`,
 * so somebody who has read this recognises the sheet when it opens.
 */
function Fixes() {
  const { t } = useTranslation(['onboarding', 'common'])

  return (
    <>
      <Card>
        <View className="flex-row items-center gap-2.5">
          <Icon set="system" name="sparkle" size={26} />
          <Text variant="body" className="flex-1 italic">
            {t('onboarding:tutorial.fix.typed')}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {(['chipHalf', 'chipNoRice', 'chipExtra'] as const).map((chip) => (
            // Not pressable: these stand for controls on another screen, and a
            // chip that highlights under the thumb and does nothing is worse
            // than one that plainly does not respond.
            <Chip key={chip} tone="kaya" soft>
              {t(`onboarding:tutorial.fix.${chip}`)}
            </Chip>
          ))}
        </View>
      </Card>

      <View className="flex-row items-center gap-2.5">
        <Swap
          label={t('onboarding:tutorial.fix.beforeLabel')}
          value={t('onboarding:tutorial.fix.before')}
          unit={t('common:unit.kcal')}
        />
        <Icon set="ui" name="arrow-right" size={22} />
        <Swap
          label={t('onboarding:tutorial.fix.afterLabel')}
          value={t('onboarding:tutorial.fix.after')}
          unit={t('common:unit.kcal')}
          settled
        />
      </View>
    </>
  )
}

function Swap({
  label,
  value,
  unit,
  settled = false,
}: {
  label: string
  value: string
  unit: string
  settled?: boolean
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(settled ? 320 : 120).duration(300)}
      className={cn(
        'flex-1 items-center gap-1 rounded-md border-[3px] p-4',
        settled ? 'border-pandan bg-pandan-soft' : 'border-line bg-surface',
      )}
    >
      <Text variant="overlineSm" className="text-muted">
        {label}
      </Text>
      <Text className={cn('font-display text-[28px] leading-[32px]', settled && 'text-pandan-ink')}>
        {value}
      </Text>
      <Text variant="caption">{unit}</Text>
    </Animated.View>
  )
}

/**
 * The day itself: the real ring and the real macro bars.
 *
 * Both are the components Today renders, given made-up numbers — so this card
 * cannot drift from the screen it describes without the screen changing too.
 */
function Day() {
  const { t } = useTranslation('onboarding')

  return (
    <>
      <Animated.View entering={FadeInDown.delay(120).duration(320)}>
        <Card>
          <View className="flex-row items-center gap-4">
            <CalorieRing
              value={1180}
              goal={1900}
              size={122}
              thickness={15}
              centerLabel="720"
              centerCaption={t('tutorial.day.ringCaption')}
            />
            <View className="flex-1 gap-2.5">
              <MacroBar label={t('tutorial.day.carbs')} amount="142g" value={0.62} tone="kaya" />
              <MacroBar
                label={t('tutorial.day.protein')}
                amount="68g"
                value={0.55}
                tone="hibiscus"
              />
              <MacroBar label={t('tutorial.day.fat')} amount="41g" value={0.7} tone="teh" />
            </View>
          </View>
        </Card>
      </Animated.View>

      <View className="flex-row items-center gap-2.5 px-1">
        <Icon set="body" name="footprints" size={24} />
        <Text variant="meta" className="flex-1">
          {t('tutorial.day.note')}
        </Text>
      </View>
    </>
  )
}
