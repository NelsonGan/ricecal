import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { ChoiceCard } from '@/features/onboarding'
import { deviceLanguage, LANGUAGES, type Language, setLanguage, storedLanguage } from '@/i18n'
import { Button, Screen, Text } from '@/ui'

/**
 * 00 LANGUAGE, the first screen in the app.
 *
 * BEFORE the welcome, because the welcome is a pitch and a pitch in the wrong
 * language is not one. It is shown once: `app/index.tsx` routes here only while
 * nothing has been chosen, so a returning visitor goes straight to welcome.
 *
 * It is NOT one of `ONBOARDING_STEPS` and draws no progress bar. The questions
 * that bar counts are about the person's body and produce a calorie budget;
 * this is a setting, asked here because it has to be asked before anything else
 * can be read. Welcome is outside the bar for the same reason.
 *
 * Tapping a card applies the language IMMEDIATELY rather than on Continue. The
 * screen is its own preview: the heading, the subtitle and the button all
 * change under the thumb, which is the only way somebody can tell they picked
 * the right one from a list of names they may not be able to read.
 */
export default function LanguageStep() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()

  /**
   * Opens on the phone's language, resolved to a bundle we have.
   *
   * `storedLanguage()` first for the case this screen is reached with a choice
   * already made — a deep link, or a back navigation — so it shows the answer
   * rather than overriding it with the device's.
   */
  const [selected, setSelected] = useState<Language>(() => storedLanguage() ?? deviceLanguage())

  const choose = (language: Language) => {
    setSelected(language)
    setLanguage(language)
  }

  /**
   * Continue writes the selection again, and that is not redundant: somebody
   * who agrees with the preselection never taps a card, so this is the only
   * call that runs for them. Without it nothing is stored and the screen comes
   * back on the next launch.
   *
   * `replace`, so the back gesture cannot return to a decision that has been
   * made and applied.
   */
  const start = () => {
    setLanguage(selected)
    router.replace('/(onboarding)/welcome')
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={start}>
          {t('common:action.continue')}
        </Button>
      }
    >
      <View className="gap-2 pt-4">
        <Text variant="title">{t('language.title')}</Text>
        <Text className="text-[16px] leading-[24px]">{t('language.subtitle')}</Text>
      </View>

      <View className="gap-2 pt-6">
        {LANGUAGES.map((language) => (
          <ChoiceCard
            key={language.code}
            title={language.label}
            selected={language.code === selected}
            onPress={() => choose(language.code)}
            accent="pandan"
          />
        ))}
      </View>
    </Screen>
  )
}
