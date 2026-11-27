import { Image } from 'expo-image'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, type ScrollViewInstance, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'

import { useThemeColors } from '@/theme/useTheme'
import { Card, Icon, Text } from '@/ui'
import { PAYWALL_REVIEWS, type PaywallReview, SOCIAL_PROOF } from './reviews'

/**
 * One laurel wing: the website's (`apps/web/src/components/home/reviews.tsx`)
 * rasterised, because the app has no SVG renderer and leaves drawn from Views
 * read as a braid at this size. Black, so it takes any tint.
 */
const LAUREL = require('../../../assets/paywall/laurel.png')

function LaurelWing({
  height,
  color,
  flip = false,
}: {
  height: number
  color: string
  flip?: boolean
}) {
  return (
    <Image
      source={LAUREL}
      tintColor={color}
      style={{ width: height * (80 / 225), height, transform: flip ? [{ scaleX: -1 }] : undefined }}
      accessible={false}
    />
  )
}

/** Five stars, the last one filled only as far as the rating goes (4.8). */
export function StarRow({ rating, size }: { rating: number; size: number }) {
  const { t } = useTranslation('paywall')
  const colors = useThemeColors()
  return (
    <View
      className="flex-row gap-0.5"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('proof.rated', { rating })}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.min(1, Math.max(0, rating - index))
        return (
          <View key={index} style={{ width: size, height: size }}>
            <Icon set="system" name="star" size={size} tintColor={colors.kayaSoftLine} />
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: size * fill,
                overflow: 'hidden',
              }}
            >
              <Icon set="system" name="star" size={size} tintColor={colors.kaya} />
            </View>
          </View>
        )
      })}
    </View>
  )
}

function LaurelStat({ value, children }: { value: string; children: ReactNode }) {
  const colors = useThemeColors()
  return (
    <View className="flex-row items-center gap-1">
      <LaurelWing height={58} color={colors.kayaSlab} />
      <View className="min-w-[84px] items-center">
        <Text variant="displayMd">{value}</Text>
        {children}
      </View>
      <LaurelWing height={58} color={colors.kayaSlab} flip />
    </View>
  )
}

function ReviewCard({ review }: { review: PaywallReview }) {
  return (
    <Card className="flex-1" contentClassName="flex-1 justify-between p-5">
      <View className="flex-row gap-2">
        <Text className="flex-1 font-body-bold text-[16px] leading-[23px] text-ink">
          {review.quote}
        </Text>
        <Text aria-hidden className="font-display text-[44px] leading-[44px] text-pandan-soft-line">
          ”
        </Text>
      </View>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="meta" numberOfLines={1} className="shrink">
          {review.author}
        </Text>
        <StarRow rating={review.stars} size={14} />
      </View>
    </Card>
  )
}

/** How much of the next card shows at the right edge, and the gap before it. */
const PEEK = 28
const GAP = 12
/** Long enough to read the longest quote twice over. */
const ADVANCE_MS = 5000
/** The reviews appear three times over; the reader stays in the middle copy. */
const n = PAYWALL_REVIEWS.length

/**
 * The reviews, one card at a time with the next peeking in, moving on by
 * itself unless the reader asked for less motion. Built as Money2Time's is:
 * the list is tripled and the active card kept in the middle copy, so it loops
 * forever in both directions without a visible rewind.
 */
function ReviewCarousel() {
  const reduceMotion = useReducedMotion()
  const [width, setWidth] = useState(0)
  const scrollRef = useRef<ScrollViewInstance>(null)
  const loop = useMemo(
    () =>
      [0, 1, 2].flatMap((copy) =>
        PAYWALL_REVIEWS.map((review) => ({ review, key: `${copy}-${review.author}` })),
      ),
    [],
  )
  const indexRef = useRef(n)
  const recenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const itemWidth = Math.max(0, width - PEEK - GAP)
  const interval = itemWidth + GAP

  const clearRecenter = useCallback(() => {
    if (recenterTimer.current) clearTimeout(recenterTimer.current)
    recenterTimer.current = null
  }, [])

  const goTo = useCallback(
    (index: number, animated: boolean) =>
      scrollRef.current?.scrollTo({ x: index * interval, animated }),
    [interval],
  )

  // Keep the active card in the middle copy, so a neighbour is always there.
  const recenter = useCallback(
    (index: number) => {
      let centred = index
      if (centred < n) centred += n
      else if (centred >= 2 * n) centred -= n
      if (centred !== index) goTo(centred, false)
      indexRef.current = centred
    },
    [goTo],
  )

  useEffect(() => {
    if (width === 0 || reduceMotion) return
    const id = setInterval(() => {
      clearRecenter()
      const next = indexRef.current + 1
      indexRef.current = next
      goTo(next, true)
      if (next >= 2 * n) recenterTimer.current = setTimeout(() => recenter(next), 450)
    }, ADVANCE_MS)
    return () => {
      clearInterval(id)
      clearRecenter()
    }
  }, [width, reduceMotion, goTo, recenter, clearRecenter])

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={interval}
          disableIntervalMomentum
          contentOffset={{ x: n * interval, y: 0 }}
          // The cards' slab sits below them; room for it, or the ScrollView clips it.
          contentContainerStyle={{ paddingBottom: 6 }}
          // `contentOffset` places the first paint on iOS; Android ignores it.
          onContentSizeChange={() => {
            if (indexRef.current === n) goTo(n, false)
          }}
          onScrollBeginDrag={clearRecenter}
          onMomentumScrollEnd={(event) => {
            clearRecenter()
            recenter(Math.round(event.nativeEvent.contentOffset.x / interval))
          }}
        >
          {loop.map(({ review, key }) => (
            <View key={key} style={{ width: itemWidth, marginRight: GAP }}>
              <ReviewCard review={review} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  )
}

/**
 * Why somebody else paid: the store rating and user count in laurels, then
 * real reviews. Between the plans and the comparison, so it is read on the way
 * from choosing a plan to deciding on it.
 */
export function PaywallSocialProof() {
  const { t } = useTranslation('paywall')
  return (
    <View className="mt-md gap-4">
      <View className="flex-row flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <LaurelStat value={SOCIAL_PROOF.rating.toFixed(1)}>
          <StarRow rating={SOCIAL_PROOF.rating} size={13} />
        </LaurelStat>
        <LaurelStat value={SOCIAL_PROOF.users}>
          <Text variant="overlineSm" className="text-muted" numberOfLines={1}>
            {t('proof.usersChoice')}
          </Text>
        </LaurelStat>
      </View>
      <ReviewCarousel />
    </View>
  )
}
