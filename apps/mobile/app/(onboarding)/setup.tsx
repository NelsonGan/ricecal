import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import type { Units } from '@/data'
import { OnboardingStep, useOnboardingDraft } from '@/features/onboarding'
import { LanguageAiNote, LanguageHelpButton } from '@/features/shared'
import {
  currentLanguage,
  deviceLanguage,
  LANGUAGES,
  type Language,
  setLanguage,
  storedLanguage,
} from '@/i18n'
import { Card, SegmentedControl, Select, Text } from '@/ui'

/**
 * 01 SETUP: the language the app is read in and the units it is measured in.
 *
 * FIRST, and both questions are here because both are answered by the screen
 * immediately after this one. `about` asks for a height and a weight, and the
 * fields it draws are centimetres and kilograms or feet and pounds depending on
 * what is chosen here. Asking afterwards would mean either converting what
 * somebody had already typed or asking them to type it again.
 *
 * Neither answer is a fact about the body, which is why neither goes to
 * `profiles`: the language is MMKV's, the units are `user_settings`', and the
 * database stores kilograms and centimetres whatever this screen says.
 *
 * Nothing here can be got wrong. Both controls open on an answer — the phone's
 * own language, and metric — so Continue is live on arrival, unlike every
 * question after it. There is no version of this screen a person can fail to
 * fill in, and holding the CTA hostage to a preference somebody already agrees
 * with is a tap for nothing.
 */
export default function SetupStep() {
  const { t } = useTranslation(['onboarding', 'profile', 'common'])
  const router = useRouter()
  const { draft, patch } = useOnboardingDraft()

  /**
   * The language is applied as it is picked rather than on Continue, so this
   * screen is its own preview: the heading, the units labels and the button all
   * change under the thumb. It is the only way somebody can tell they picked
   * the right one out of a list of names they may not be able to read.
   *
   * `storedLanguage()` first for a return visit — walking back to this screen
   * should show the answer rather than overriding it with the phone's.
   */
  const [language, setLanguageState] = useState<Language>(
    () => storedLanguage() ?? deviceLanguage(),
  )
  const units: Units = draft.units ?? 'metric'

  const chooseLanguage = (next: Language) => {
    setLanguageState(next)
    setLanguage(next)
  }

  /**
   * Continue writes the language again, which is not redundant: somebody who
   * agrees with the preselection never touches the control, and this is the
   * only call that runs for them.
   */
  const next = () => {
    setLanguage(language)
    patch({ units })
    router.push('/(onboarding)/about')
  }

  return (
    <OnboardingStep
      name="setup"
      accent="pandan"
      title={t('setup.title')}
      subtitle={t('setup.subtitle')}
      onBack={() => router.dismissTo('/(onboarding)/welcome')}
      primaryLabel={t('common:action.continue')}
      onPrimary={next}
    >
      <Card title={t('profile:preferences.language')} titleAction={<LanguageHelpButton />}>
        <Select
          label={t('profile:preferences.languageLabel')}
          hideLabel
          options={LANGUAGES.map((entry) => ({ value: entry.code, label: entry.label }))}
          closeLabel={t('common:action.close')}
          value={currentLanguage()}
          onChange={chooseLanguage}
        />
        <LanguageAiNote />
      </Card>

      <Card title={t('setup.unitsTitle')}>
        <SegmentedControl
          options={[
            { value: 'metric', label: t('setup.metric') },
            { value: 'imperial', label: t('setup.imperial') },
          ]}
          value={units}
          onChange={(chosen) => patch({ units: chosen as Units })}
          accessibilityLabel={t('setup.unitsTitle')}
        />
        <View className="pt-0.5">
          <Text variant="meta">
            {units === 'metric' ? t('setup.metricNote') : t('setup.imperialNote')}
          </Text>
        </View>
      </Card>
    </OnboardingStep>
  )
}
