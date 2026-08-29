import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { currentLanguage, DEFAULT_LANGUAGE } from '@/i18n'
import { Icon, IconButton, Sheet, Text } from '@/ui'

/**
 * What the language setting does not change, said where it is chosen.
 *
 * Everything on screen is translated. The scanning, describing and suggestions
 * are not: they go to a model that reads English best, against a catalogue whose
 * dish names and serving labels are stored in English. Somebody who sets the app
 * to Thai and types a Thai description gets a worse read, and the answer arrives
 * in English either way.
 *
 * Said in two strengths: a line under the control for anybody who chose a
 * language other than English, and the full version behind an info button.
 */

/**
 * The always-present half. Sits beside the card's HEADING rather than under the
 * control, because a reader who has not chosen anything yet is not being warned
 * about anything — they are being offered a detail about the word above it.
 */
export function LanguageHelpButton() {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <>
      <IconButton
        variant="ghost"
        size="xs"
        hitSlop={8}
        accessibilityLabel={t('aiLanguage.open')}
        onPress={() => setOpen(true)}
      >
        <Icon set="ui" name="info" size={22} />
      </IconButton>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('aiLanguage.title')}
        closeLabel={t('action.close')}
      >
        <View className="gap-3 pb-2">
          <Text>{t('aiLanguage.body')}</Text>
          <Text>{t('aiLanguage.results')}</Text>
          {/* And the other direction: what a person has already written down is
              left alone. It used to sit under the picker as a second line of
              small print; it is the same subject as the two above it. */}
          <Text>{t('aiLanguage.dishes')}</Text>
        </View>
      </Sheet>
    </>
  )
}

/**
 * The other half, and it renders NOTHING in English.
 *
 * There is nothing to tell somebody reading the app in the language the model
 * and the catalogue already speak, and a caveat that appears for everybody is
 * one nobody reads.
 */
export function LanguageAiNote() {
  const { t } = useTranslation('common')

  if (currentLanguage() === DEFAULT_LANGUAGE) return null

  return <Text variant="meta">{t('aiLanguage.note')}</Text>
}
