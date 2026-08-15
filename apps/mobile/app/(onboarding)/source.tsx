import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Platform, View } from 'react-native'

import {
  type BrandLogo,
  OnboardingStep,
  SourceOption,
  useOnboardingDraft,
} from '@/features/onboarding'
import type { IconProps } from '@/ui'

/**
 * Stored on the profile and sent to Mixpanel. NEVER RENAMED — a chart built on
 * "tiktok" stops counting the day it becomes "tik_tok".
 *
 * A union rather than `string`, so the copy lookup below is checked: every id
 * has to have a `source.<id>` key, and adding one without copy is a compile
 * error rather than a blank tile.
 */
type SourceId =
  | 'xiaohongshu'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'facebook'
  | 'reddit'
  | 'friend'
  | 'other'
  | 'appStore'
  | 'googlePlay'

type Option = {
  id: SourceId
  logo?: BrandLogo
  icon?: IconProps
}

/**
 * Every platform anybody actually arrives from, plus the two that are not one.
 *
 * BOTH STORES ARE ALWAYS OFFERED, whichever phone this is. Somebody can meet an
 * app on Google Play and install it later on an iPhone, and a cross-platform
 * user picks the store they genuinely came from — so the only thing the
 * platform decides is which of the two is listed first.
 */
const PLATFORMS: Option[] = [
  { id: 'xiaohongshu', logo: 'xiaohongshu' },
  { id: 'instagram', logo: 'instagram' },
  { id: 'tiktok', logo: 'tiktok' },
  { id: 'youtube', logo: 'youtube' },
  { id: 'threads', logo: 'threads' },
  { id: 'facebook', logo: 'facebook' },
  { id: 'reddit', logo: 'reddit' },
]

const APP_STORE: Option = { id: 'appStore', logo: 'appStore' }
const GOOGLE_PLAY: Option = { id: 'googlePlay', logo: 'googlePlay' }

/**
 * The two answers that are not a platform, and they go LAST.
 *
 * "Somewhere else" is the escape and belongs at the end by definition; word of
 * mouth sits beside it because a tile with no logo in a grid of logos reads as
 * the end of the list, and putting the stores after them made the two most
 * recognisable marks on the screen look like an afterthought.
 */
const ELSEWHERE: Option[] = [
  { id: 'friend', icon: { set: 'system', name: 'users-group' } },
  { id: 'other', icon: { set: 'ui', name: 'more-horizontal' } },
]

/**
 * 03 WHERE HEARD — the last question before the plan is worked out.
 *
 * A GRID OF LOGOS, not a list of sentences. The answer somebody gives here is
 * recognised rather than read: eleven full-width rows with a radio apiece is two
 * screens of scrolling to answer a question worth one tap, and it made the
 * options nobody expects — XiaoHongShu, Threads — the ones below the fold.
 *
 * The answer is the only thing on this screen that leaves the phone. It lands on
 * `profiles.referral_source`, on the Mixpanel person, and on
 * `Onboarding Completed` so a funnel can be broken down by channel.
 */
export default function SourceStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  const options = useMemo(
    () => [
      ...PLATFORMS,
      ...(Platform.OS === 'android' ? [GOOGLE_PLAY, APP_STORE] : [APP_STORE, GOOGLE_PLAY]),
      ...ELSEWHERE,
    ],
    [],
  )

  return (
    <OnboardingStep
      name="source"
      accent="water"
      title={t('source.title')}
      subtitle={t('source.subtitle')}
      // `dismissTo` rather than `back()`, as everywhere in this flow — see the
      // note on `about`.
      onBack={() => router.dismissTo('/(onboarding)/activity')}
      primaryLabel={t('common:action.continue')}
      primaryDisabled={!draft.referralSource}
      // Group-qualified for the same reason `about` qualifies its push: route
      // groups add no path segment, so a bare name is ambiguous the moment two
      // files anywhere in the app share it.
      onPrimary={() => router.push('/(onboarding)/calculating')}
    >
      <View className="flex-row flex-wrap gap-2.5" accessibilityRole="radiogroup">
        {options.map((option) => (
          <SourceOption
            key={option.id}
            label={t(`source.${option.id}`)}
            logo={option.logo}
            icon={option.icon}
            selected={draft.referralSource === option.id}
            onPress={() => patch({ referralSource: option.id })}
          />
        ))}
      </View>
    </OnboardingStep>
  )
}
