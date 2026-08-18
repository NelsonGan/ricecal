import { Image } from 'expo-image'
import * as Linking from 'expo-linking'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { DISCORD_INVITE, DISCORD_LOGO, SOCIAL_PLATFORMS } from '@/features/settings'
import { track } from '@/lib/analytics'
import { useBack } from '@/lib/navigation'
import { radius, slab } from '@/theme/tokens'
import {
  AppBar,
  Badge,
  type BadgeTone,
  Button,
  Card,
  Icon,
  type IconProps,
  Screen,
  Squish,
  Tappable,
  Text,
  useToast,
} from '@/ui'

/**
 * SHARE & EARN PRO — post about the app, and we give you Pro.
 *
 * THE WHOLE THING IS MANUAL, and that is the design rather than a first
 * version. There is no referral code, no attribution, no tracking pixel and no
 * table: somebody posts, somebody brings the link to Discord, and a promotional
 * grant goes out by hand in RevenueCat. What a referral SYSTEM would buy is
 * automatic attribution, and the cost of it is a deep-link scheme, a claimed-by
 * column, a fraud story and a support thread for every code that did not
 * register. At the volume this app is at, a person reading a link is cheaper
 * and better, and it is the only version that can judge the thing that actually
 * matters — whether the post is real.
 *
 * IT IS ALSO WHY THE REWARD IS LIKES RATHER THAN INSTALLS. Installs need
 * attribution to count at all; likes are visible on the post itself, to us and
 * to the person claiming, and neither side has to trust the other's dashboard.
 *
 * WHY IT IS NOT GATED ON BEING FREE. A monthly subscriber can earn a year, and
 * a yearly one can earn lifetime, so the row is offered to everybody. The copy
 * is about posting rather than about unlocking, so it reads correctly to
 * somebody who has already paid.
 *
 * The claim goes to Discord because Discord is already where support happens
 * (`HelpSheet`) — a second channel would be a second inbox to forget about.
 */

/** The three rungs. What each is worth is the copy's; this is the shape. */
const TIERS: readonly { key: 'post' | 'liked' | 'viral'; icon: IconProps; tone: BadgeTone }[] = [
  { key: 'post', icon: { set: 'system', name: 'star' }, tone: 'pandan' },
  { key: 'liked', icon: { set: 'system', name: 'trophy' }, tone: 'kaya' },
  { key: 'viral', icon: { set: 'system', name: 'crown' }, tone: 'hibiscus' },
]

/**
 * Open the first URL the phone will take: the app's own scheme, then its
 * website. See `SOCIAL_PLATFORMS` for the ladder.
 *
 * IT ASKS BY TRYING, RATHER THAN BY ASKING FIRST. The obvious shape is
 * `canOpenURL` and then `openURL`, and it is the one that does not work: that
 * question is gated behind a declaration on both platforms — iOS wants the
 * scheme in `LSApplicationQueriesSchemes` and Android 11+ wants a `<queries>`
 * block — and an undeclared scheme answers FALSE rather than erroring. Both are
 * native manifest keys, so the honest answer would arrive only in a new binary
 * and never in an OTA update, and until then every tile here would quietly open
 * a browser on a phone with the app installed. That failure is invisible: the
 * tap works, it just goes to the wrong place.
 *
 * OPENING needs no such declaration on either platform. So this attempts each
 * URL and lets the rejection be the answer — "no activity found to handle
 * intent" on Android, an unhandled scheme on iOS — and falls through to the
 * website, which every phone can open. One fewer thing to declare, and it is
 * right the day it ships rather than the day a binary does.
 */
async function openFirst(urls: readonly string[]): Promise<void> {
  let lastError: unknown
  for (const url of urls) {
    try {
      await Linking.openURL(url)
      return
    } catch (error) {
      // Not an error: a scheme nothing answers for is a platform this phone
      // does not have. Kept so the caller can report the LAST failure, which is
      // the website's — the only one that means something went wrong.
      lastError = error
    }
  }
  throw lastError ?? new Error('no url could be opened')
}

export default function ShareAndEarnScreen() {
  const { t } = useTranslation(['profile', 'common'])
  const goBack = useBack('/me')
  const toast = useToast()

  const openPlatform = (platform: (typeof SOCIAL_PLATFORMS)[number]) => {
    track('Share Platform Opened', { platform: platform.key })
    openFirst(platform.urls).catch(() => {
      toast.show({ title: t('profile:shareEarn.openFailed'), tone: 'error' })
    })
  }

  const claim = () => {
    track('Share Claim Opened', {})
    Linking.openURL(DISCORD_INVITE).catch(() => {
      toast.show({ title: t('profile:help.failed'), tone: 'error' })
    })
  }

  return (
    <Screen>
      <AppBar
        title={t('profile:shareEarn.title')}
        onBack={() => goBack()}
        backLabel={t('common:a11y.back')}
      />

      {/* The offer, once, at the top. Everything below it is the detail. */}
      <Card>
        <View className="items-center gap-2">
          <Icon set="system" name="gift" size={72} />
          <Text variant="subtitle" className="text-center">
            {t('profile:shareEarn.heroTitle')}
          </Text>
          <Text variant="meta" className="text-center">
            {t('profile:shareEarn.heroBody')}
          </Text>
        </View>
      </Card>

      {/* WHERE TO POST, as six shortcuts rather than as a sentence listing
          them. The list is a hint about what counts, and it is doing a second
          job: the hardest part of this offer is starting, and a tap that puts
          somebody in Instagram with their camera roll one tap away is a much
          shorter path than "go and post about us". */}
      <Card title={t('profile:shareEarn.platforms')}>
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {SOCIAL_PLATFORMS.map((platform) => (
            <Tappable
              key={platform.key}
              accessibilityRole="button"
              accessibilityLabel={platform.label}
              onPress={() => openPlatform(platform)}
              className="w-[30%] items-center gap-1.5"
            >
              {/* Each logo is a self-contained square app icon carrying its own
                  background, so it fills a rounded tile edge to edge rather
                  than sitting on one. No `Squish` under it, unlike the Discord
                  mark in the help sheet: that one is a flat vector on a
                  transparent field and needs a plate to sit on. */}
              <Image
                source={platform.logo}
                style={{ width: 56, height: 56, borderRadius: radius.tile }}
                contentFit="cover"
                // Bundled, so there is nothing to fade in from.
                transition={0}
                accessible={false}
              />
              <Text variant="caption" numberOfLines={1}>
                {platform.label}
              </Text>
            </Tappable>
          ))}
        </View>
      </Card>

      {/* WHAT IT IS WORTH. Three rungs, and the badge is the threshold rather
          than the reward: the reward is the line somebody reads first, and the
          number beside it is the condition. Written the other way round, the
          card is three numbers with prizes attached. */}
      <Card title={t('profile:shareEarn.rewards')}>
        <View className="gap-4">
          {TIERS.map((tier) => (
            <View key={tier.key} className="flex-row items-center gap-md" accessible>
              <Icon {...tier.icon} size={32} />
              <View className="min-w-0 flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text variant="bodyStrong" className="min-w-0 shrink">
                    {t(`profile:shareEarn.${tier.key}Reward`)}
                  </Text>
                  <Badge size="sm" tone={tier.tone}>
                    {t(`profile:shareEarn.${tier.key}Badge`)}
                  </Badge>
                </View>
                <Text variant="meta">{t(`profile:shareEarn.${tier.key}Body`)}</Text>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card title={t('profile:shareEarn.how')}>
        <View className="gap-3.5">
          {([1, 2, 3] as const).map((step) => (
            <View key={step} className="flex-row items-center gap-md" accessible>
              {/* The numeral on the app's own raised plate, which is what makes
                  three lines of prose read as an ordered list without a bullet
                  in sight. Same slab the help sheet's logo sits on. */}
              <Squish
                depth={slab.sm}
                radius={radius.full}
                containerClassName="self-start"
                slabClassName="bg-line-strong"
                className="h-8 w-8 items-center justify-center bg-track"
              >
                <Text variant="caption" className="text-ink">
                  {step}
                </Text>
              </Squish>
              <Text variant="body" className="min-w-0 flex-1">
                {t(`profile:shareEarn.step${step}`)}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* THE CLAIM, and it is the only button on the page. Everything above is
          a shortcut into somebody else's app; this is the one thing that
          reaches us. */}
      <Card title={t('profile:shareEarn.claim')}>
        <View className="flex-row items-center gap-3">
          <Image
            source={DISCORD_LOGO}
            style={{ width: 36, height: 36 }}
            contentFit="contain"
            transition={0}
            accessibilityLabel={t('profile:help.logo')}
          />
          <Text variant="meta" className="min-w-0 flex-1">
            {t('profile:shareEarn.claimBody')}
          </Text>
        </View>
        <Button fullWidth onPress={claim}>
          {t('profile:shareEarn.claimAction')}
        </Button>
      </Card>

      {/* The rules, in the smallest type on the page and last, because they are
          what somebody checks after deciding rather than before. They are
          still here in full: "one reward per person" and "we check the likes
          when you claim" are the two things that would otherwise be an argument
          in a Discord thread. */}
      <Text variant="caption" className="text-center">
        {t('profile:shareEarn.finePrint')}
      </Text>
    </Screen>
  )
}
