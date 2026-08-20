import { useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { usePlanSummary } from '@/features/paywall'
import { useEnterApp } from '@/lib/navigation'
import { useThemeColors } from '@/theme/useTheme'
import { Button, cn, Icon, type IconProps, Screen, Text } from '@/ui'

/**
 * The three things Pro just bought, as pictures rather than as sentences.
 *
 * IT WAS A TICKED LIST OF TWO LINES, under a paragraph, under a title, over a
 * note — four blocks of prose on the one screen in the app whose entire job is
 * to say "done". Nobody reads a feature list on the receipt; they have just
 * read the whole table on the paywall and pressed the button. So what is left
 * is three glyphs with three or four words under each, which is legible at a
 * glance and gets out of the way of the button.
 *
 * ASKING WHAT TO EAT IS ONE OF THEM, and it is the newest thing Pro does — the
 * paywall's own table has carried it since the feature landed, and this screen
 * was still describing a two-feature product.
 */
const PERKS = [
  { key: 'log', icon: { set: 'system', name: 'camera' }, tint: 'bg-pandan-soft' },
  { key: 'database', icon: { set: 'system', name: 'database' }, tint: 'bg-water-soft' },
  { key: 'suggest', icon: { set: 'system', name: 'sparkle' }, tint: 'bg-kaya-soft' },
] as const satisfies ReadonlyArray<{ key: string; icon: IconProps; tint: string }>

/** W5 WELCOME TO PRO */
export default function WelcomeToPro() {
  const { t } = useTranslation('paywall')
  const enterApp = useEnterApp()
  /**
   * Which plan was just bought.
   *
   * Lifetime has no trial and nothing to cancel, and this screen told every
   * buyer "Trial active for 7 days" regardless — false for a one-off purchase,
   * and false again for anybody who arrived here by RESTORING a subscription
   * they bought months ago.
   */
  const { plan } = useLocalSearchParams<{ plan?: string }>()
  const lifetime = plan === 'lifetime'
  // WHETHER THIS IS ACTUALLY A TRIAL is the store's answer, not the button's.
  // The line under the title used to claim seven free days to everybody who had
  // not bought lifetime — including a resubscriber, who has already used the
  // introductory offer for this subscription group and was charged on the spot.
  const { state } = usePlanSummary()

  /**
   * Land on Today, and stop there.
   *
   * IT USED TO RAISE THE LOG SHEET AS WELL, and that put a camera in front of
   * somebody who had just paid. `/log` with no `panel` param does not open on
   * the four tiles: `openingPanel` falls through to `'camera'`, so the viewfinder
   * is what a bare push presents. Whatever the user was doing when they hit the
   * paywall — reading their trends, opening a recipe, finishing onboarding —
   * they were not asking to photograph a plate, and being handed a live camera
   * as the first thing Pro does is a demand rather than a reward.
   *
   * So the button goes to the diary and the FloatingAction is right there when
   * they want it. A purchase should return people to the app, not redirect them
   * into one feature of it.
   *
   * `enterApp` rather than a bare replace, because this screen is the end of
   * onboarding as often as it is a purchase made from the app — and a replace
   * leaves every screen the user walked to get here standing under the diary.
   * See `useEnterApp`.
   */
  const goToDiary = () => enterApp()

  return (
    <Screen
      scroll={false}
      contentClassName="justify-center gap-7"
      footer={
        <Button fullWidth onPress={goToDiary}>
          {t('welcome.start')}
        </Button>
      }
    >
      <View className="items-center gap-4">
        <SuccessMark />

        {/* The title and the one line under it arrive together, a beat after
            the mark lands: the check is what this screen says, and the words
            are the caption to it. */}
        <Animated.View
          entering={FadeInDown.delay(260).duration(380)}
          className="items-center gap-2"
        >
          <Text variant="title" className="text-center">
            {t('welcome.title')}
          </Text>
          {/* ONE SHORT SENTENCE, and it used to be two. "Trial active for 7
              days. Everything is unlocked, nothing to set up." said the same
              thing twice: there is nothing to set up because everything is
              unlocked, and a receipt is not the place to reassure somebody
              about work they are not being asked to do. */}
          <Text className="text-center text-[15px] leading-[23px] text-muted">
            {lifetime
              ? t('welcome.bodyLifetime')
              : state === 'trial'
                ? t('welcome.body')
                : t('welcome.bodyActive')}
          </Text>
        </Animated.View>
      </View>

      {/* Three squares in a row rather than three ticked lines in a column: the
          same information in a third of the height, and the height is what this
          screen was spending badly. Staggered so they land one after another,
          which is the only motion on the page that says "and this, and this". */}
      <View className="flex-row gap-2.5">
        {PERKS.map((perk, index) => (
          <Animated.View
            key={perk.key}
            entering={FadeInDown.delay(420 + index * 90).duration(340)}
            className="flex-1"
            accessible
          >
            {/* `cn` rather than a template literal: NativeWind resolves a
                className string at runtime, but Tailwind only generates a class
                it has SEEN in the source, and a tint assembled from a variable
                is a class that exists nowhere for it to find. The literals are
                in `PERKS` above, which is the file it scans. */}
            <View className={cn('items-center gap-2 rounded-md px-1.5 py-3.5', perk.tint)}>
              <Icon {...perk.icon} size={26} />
              <Text variant="micro" className="text-center text-ink">
                {t(`welcome.perks.${perk.key}`)}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.delay(720).duration(340)}>
        <Text variant="caption" className="text-center text-faint">
          {lifetime ? t('welcome.manageNoteLifetime') : t('welcome.manageNote')}
        </Text>
      </Animated.View>
    </Screen>
  )
}

/** How far a ring travels past the mark before it has faded out entirely. */
const RING_GROWTH = 0.9

/**
 * The check, arriving.
 *
 * IT USED TO BE A STATIC SQUISHED SQUARE, which is the app's mechanic for a
 * control you press — and this one cannot be pressed. A confirmation that just
 * IS there is indistinguishable from a screen that was already there: the whole
 * of this page is one beat of "that worked", and a mark that lands is the only
 * part of it that can say so without another sentence.
 *
 * So the mark springs in from nothing, and two rings travel out from under it
 * and fade. The rings run TWICE and stop, rather than repeating: a ring pulsing
 * for as long as the screen is open reads as something still in progress, which
 * is the opposite of what a receipt is for.
 *
 * Nothing here closes over anything but shared values and numbers, which is the
 * rule the numpad's frozen ref taught: a worklet freezes the object graph it
 * captures, and a captured object holding mutable state stops being mutable.
 */
function SuccessMark() {
  const colors = useThemeColors()

  const pop = useSharedValue(0)
  const inner = useSharedValue(0)
  const outer = useSharedValue(0)

  useEffect(() => {
    // A spring rather than a timing, and a soft one: the overshoot is what
    // makes it read as landing rather than as appearing.
    pop.value = withDelay(60, withSpring(1, { damping: 11, stiffness: 190 }))
    // Two runs and then still, rather than an endless pulse. A function so the
    // two rings cannot drift apart in duration while being offset in time.
    const ring = () =>
      withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), 2, false)
    inner.value = withDelay(220, ring())
    outer.value = withDelay(680, ring())
  }, [pop, inner, outer])

  const markStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + pop.value * 0.4 }],
  }))
  const innerStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - inner.value),
    transform: [{ scale: 1 + inner.value * RING_GROWTH }],
  }))
  const outerStyle = useAnimatedStyle(() => ({
    opacity: 0.3 * (1 - outer.value),
    transform: [{ scale: 1 + outer.value * RING_GROWTH }],
  }))

  return (
    <View className="h-24 w-24 items-center justify-center">
      {/* The rings are behind the mark and take no touches. They are borders
          rather than fills, so the mark's own colour is never washed by one
          passing under it. */}
      <Animated.View
        pointerEvents="none"
        style={innerStyle}
        className="absolute h-24 w-24 rounded-full border-2 border-pandan"
      />
      <Animated.View
        pointerEvents="none"
        style={outerStyle}
        className="absolute h-24 w-24 rounded-full border-2 border-pandan"
      />
      <Animated.View
        style={markStyle}
        className="h-24 w-24 items-center justify-center rounded-full bg-pandan"
      >
        <Icon set="ui" name="check" size={48} tintColor={colors.onPandan} />
      </Animated.View>
    </View>
  )
}
