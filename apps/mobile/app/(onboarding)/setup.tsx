import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { FormCard, FormRow, SegmentedControl, Select } from '@/ui'

/**
 * Setup: the language the app is read in and the units it is measured in.
 *
 * First, because both are answered by the screen immediately after: `about` asks
 * for a height and a weight in whichever system is chosen here, and asking
 * afterwards would mean converting what somebody had typed or asking again.
 *
 * Neither answer is a fact about the body, so neither goes to `profiles`: the
 * language is MMKV's, the units are `user_settings`', and the database stores
 * kilograms and centimetres whatever this screen says.
 *
 * Both controls open on an answer, so Continue is live on arrival, unlike every
 * question after it: there is no version of this screen a person can fail to fill
 * in.
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
      art={{ art: 'globe' }}
      title={t('setup.title')}
      subtitle={t('setup.subtitle')}
      onBack={() => router.dismissTo('/(onboarding)/how')}
      primaryLabel={t('common:action.continue')}
      onPrimary={next}
    >
      {/* One card of two rows, the same shape as the questions after it. Each
          answer used to be its own titled card, with a line under the units
          spelling out what "metric" means. */}
      <FormCard>
        <FormRow label={t('profile:preferences.language')}>
          <LanguageHelpButton />
          <Select
            size="sm"
            className="w-[168px]"
            label={t('profile:preferences.languageLabel')}
            hideLabel
            options={LANGUAGES.map((entry) => ({ value: entry.code, label: entry.label }))}
            closeLabel={t('common:action.close')}
            value={currentLanguage()}
            onChange={chooseLanguage}
          />
        </FormRow>
        <FormRow label={t('setup.unitsTitle')}>
          <SegmentedControl
            size="sm"
            className="w-[176px]"
            options={[
              { value: 'metric', label: t('setup.metric') },
              { value: 'imperial', label: t('setup.imperial') },
            ]}
            value={units}
            onChange={(chosen) => patch({ units: chosen as Units })}
            accessibilityLabel={t('setup.unitsTitle')}
          />
        </FormRow>
      </FormCard>

      <LanguageAiNote />
    </OnboardingStep>
  )
}
