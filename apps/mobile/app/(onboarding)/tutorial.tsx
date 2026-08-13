import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { FactRow } from '@/features/onboarding'
import { Button, Card, Icon, Screen, StepProgress, Text } from '@/ui'

/**
 * 10-13 THE TOUR
 *
 * Four cards on how a meal becomes a number, after the account and the two
 * permissions, and the last thing between a new user and their diary.
 *
 * ONE ROUTE, NOT FOUR
 *
 * The cards are read forwards and never returned to, and each one's CTA is a
 * question the next card answers — "what happens next?", "how do I snap a good
 * one?", "one more thing". As four routes that is four files, four back-stack
 * entries a `replace` has to unwind, and an edge swipe that lands somewhere in
 * the middle of a tour the user has finished. As one route with an index it is a
 * list, and the list is the thing worth reading.
 *
 * WHAT IT PROMISES
 *
 * Only what the app does. There is no confidence score in RiceCal and no recipe
 * builder, so the tour does not describe either — a tour that advertises a
 * feature is a support thread waiting to happen. The three ways in are the three
 * the FAB actually opens, and the correction card is the two things the entry
 * screen actually offers: change the portion by hand, or say what was wrong.
 */

const CARDS = ['ways', 'match', 'photo', 'adjust'] as const

/**
 * What the forward button says on each card.
 *
 * A map rather than `tutorial.${card}.next`, because the last card's button is
 * not a "next" — it leaves the flow — and an interpolated key would have had to
 * invent a `adjust.next` nobody renders to keep the types happy. Written out,
 * every entry is a key that exists.
 */
const FORWARD = {
  ways: 'onboarding:tutorial.ways.next',
  match: 'onboarding:tutorial.match.next',
  photo: 'onboarding:tutorial.photo.next',
  adjust: 'onboarding:tutorial.adjust.logFirst',
} as const

export default function TutorialStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()

  const [index, setIndex] = useState(0)
  const card = CARDS[index] ?? 'ways'
  const last = index === CARDS.length - 1

  /**
   * `replace` on the way out, on every path.
   *
   * The tabs are where the app IS, not somewhere you went — and the questions
   * are still underneath this screen on the stack. Pushing Today over them left
   * an edge swipe on the tab bar that walked back into onboarding, which is what
   * `gestureEnabled: false` on the tabs was already there to catch.
   *
   * BOTH BUTTONS GO THE SAME PLACE, which is new. The tour used to fork here —
   * "log my first meal" to Today, "explore" to a read-only preview of it — and
   * the paywall now sits between the tour and the app for either answer. Its
   * own "Maybe later" is the explore path, and it lands on the real Today
   * rather than a mock of one, so the fork had nothing left to decide.
   */
  const leave = () => router.replace('/paywall/intro')

  return (
    <Screen
      footer={
        <View className="gap-1.5">
          <Button fullWidth onPress={() => (last ? leave() : setIndex((current) => current + 1))}>
            {t(FORWARD[card])}
          </Button>
          <Button variant="ghost" fullWidth onPress={leave}>
            {last ? t('onboarding:tutorial.adjust.explore') : t('onboarding:tutorial.skip')}
          </Button>
        </View>
      }
    >
      {/* Four marks, not nine. The numbered bar ended with the permissions; this
          is a separate thing of its own length, and carrying on from 9 would
          promise four more questions. */}
      <StepProgress
        total={CARDS.length}
        current={index + 1}
        tone="pandan"
        accessibilityLabel={t('common:a11y.step', { current: index + 1, total: CARDS.length })}
      />

      <View className="gap-2 pt-4">
        <Text variant="title">{t(`onboarding:tutorial.${card}.title`)}</Text>
        <Text className="text-[16px] leading-[24px]">
          {t(`onboarding:tutorial.${card}.subtitle`)}
        </Text>
      </View>

      <View className="gap-md pt-2">
        {card === 'ways' ? <Ways /> : null}
        {card === 'match' ? <Match /> : null}
        {card === 'photo' ? <Photo /> : null}
        {card === 'adjust' ? <Adjust /> : null}
      </View>
    </Screen>
  )
}

/** The three the FAB opens, in the order the sheet lists them. */
function Ways() {
  const { t } = useTranslation('onboarding')

  return (
    <Card>
      <View className="gap-4">
        <FactRow
          icon={{ set: 'system', name: 'camera' }}
          title={t('tutorial.ways.snap')}
          body={t('tutorial.ways.snapBody')}
        />
        <FactRow
          icon={{ set: 'system', name: 'chat' }}
          title={t('tutorial.ways.describe')}
          body={t('tutorial.ways.describeBody')}
        />
        <FactRow
          icon={{ set: 'ui', name: 'search' }}
          title={t('tutorial.ways.search')}
          body={t('tutorial.ways.searchBody')}
        />
      </View>
    </Card>
  )
}

/**
 * What comes back, and why the grams are the interesting part.
 *
 * The example is a made-up plate rather than a screenshot on purpose: it has to
 * survive a redesign of the diary row, and a picture of last year's UI is worse
 * than no picture.
 */
function Match() {
  const { t } = useTranslation(['onboarding', 'common'])

  return (
    <>
      <Card>
        <View className="flex-row items-center gap-3.5">
          <Icon set="dishes" name="nasi-lemak" size={44} />
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong">{t('onboarding:tutorial.match.exampleName')}</Text>
            <Text variant="meta">{t('onboarding:tutorial.match.exampleDetail')}</Text>
          </View>
          <View className="items-end">
            <Text className="font-display text-[26px] leading-[31px] text-heading">
              {t('onboarding:tutorial.match.exampleKcal')}
            </Text>
            <Text variant="caption">{t('common:unit.kcal')}</Text>
          </View>
        </View>
      </Card>

      <Card tone="kaya">
        <View className="gap-1">
          <Text variant="bodyStrong" className="text-kaya-ink">
            {t('onboarding:tutorial.match.weightTitle')}
          </Text>
          <Text variant="meta">{t('onboarding:tutorial.match.weightBody')}</Text>
        </View>
      </Card>
    </>
  )
}

function Photo() {
  const { t } = useTranslation('onboarding')

  return (
    <Card>
      <View className="gap-4">
        <FactRow
          icon={{ set: 'system', name: 'camera' }}
          title={t('tutorial.photo.angle')}
          body={t('tutorial.photo.angleBody')}
        />
        <FactRow
          icon={{ set: 'food', name: 'fork-spoon' }}
          title={t('tutorial.photo.scale')}
          body={t('tutorial.photo.scaleBody')}
        />
        <FactRow
          icon={{ set: 'food', name: 'empty-plate' }}
          title={t('tutorial.photo.single')}
          body={t('tutorial.photo.singleBody')}
        />
      </View>
    </Card>
  )
}

/**
 * Before and after, because the point is that the entry MOVES.
 *
 * Two cards rather than one row with an arrow: the two states are the same dish
 * at different sizes, and stacking them lets the second carry the accent that
 * says which one is the outcome.
 */
function Adjust() {
  const { t } = useTranslation('onboarding')

  return (
    <>
      <Card title={t('tutorial.adjust.beforeLabel')}>
        <View className="flex-row items-center gap-3.5">
          <Icon set="dishes" name="char-kuey-teow" size={40} />
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong">{t('tutorial.adjust.beforeName')}</Text>
            <Text variant="meta">{t('tutorial.adjust.beforeDetail')}</Text>
          </View>
        </View>
      </Card>

      <View className="items-center">
        <Icon set="ui" name="arrow-down" size={24} />
      </View>

      <Card tone="pandan" title={t('tutorial.adjust.afterLabel')}>
        <View className="flex-row items-center gap-3.5">
          <Icon set="dishes" name="char-kuey-teow" size={40} />
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong">{t('tutorial.adjust.afterName')}</Text>
            <Text variant="meta">{t('tutorial.adjust.afterDetail')}</Text>
          </View>
        </View>
      </Card>

      <Text variant="meta" className="px-0.5">
        {t('tutorial.adjust.closing')}
      </Text>
    </>
  )
}
