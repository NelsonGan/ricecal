import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { openLegal, PRIVACY_URL, TERMS_URL } from '@/lib/legal'
import { Button, Text } from '@/ui'

/**
 * The compact legal line every screen that can start a purchase has to carry.
 *
 * Guideline 3.1.2 asks for four things: what is being sold, how long it lasts,
 * what it costs, and working links to the terms of use and the privacy policy.
 * The first three are the sentence above this one (`hard.smallPrint*`, or
 * `ended.terms`); these are the last two, and they were on none of the three
 * screens that can charge somebody. The two paywalls also put restore on this
 * line, where it reads as account recovery rather than another purchase CTA.
 *
 * A component rather than a copied pair of links, because the set of screens that
 * can start a purchase grows.
 *
 * Ghost buttons rather than underlined text inside a sentence: `Text` here is not
 * a link primitive, and a tappable span inside a paragraph is less accessible
 * than two buttons that each say what they open.
 */
type PurchaseTermsProps = {
  onRestore?: () => void
  restoreDisabled?: boolean
}

export function PurchaseTerms({ onRestore, restoreDisabled }: PurchaseTermsProps = {}) {
  const { t } = useTranslation('paywall')

  return (
    <View className="flex-row items-center justify-center">
      {onRestore ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            contentClassName="px-2"
            labelClassName="text-[12px]"
            onPress={onRestore}
            disabled={restoreDisabled}
          >
            {t('hard.restore')}
          </Button>
          <Text variant="micro">·</Text>
        </>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        contentClassName="px-2"
        labelClassName="text-[12px]"
        onPress={() => openLegal(TERMS_URL)}
      >
        {t('hard.terms')}
      </Button>
      <Text variant="micro">·</Text>
      <Button
        variant="ghost"
        size="sm"
        contentClassName="px-2"
        labelClassName="text-[12px]"
        onPress={() => openLegal(PRIVACY_URL)}
      >
        {t('hard.privacy')}
      </Button>
    </View>
  )
}
