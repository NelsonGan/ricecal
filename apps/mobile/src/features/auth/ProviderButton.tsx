import { useTranslation } from 'react-i18next'

import { useThemeColors } from '@/theme/useTheme'
import { BrandMark, Button } from '@/ui'

export type Provider = 'apple' | 'google'

export type ProviderButtonProps = {
  provider: Provider
  onPress: () => void
  disabled?: boolean
  loading?: boolean
}

/**
 * "Continue with Apple" and "Continue with Google", built the same way.
 *
 * Both are the app's own `Button` rather than each vendor's drop-in widget.
 * `AppleAuthenticationButton` renders a UIKit control with its own height and
 * corner radius, so beside anything else on this screen it read as a component
 * from a different app. Both vendors allow a custom button provided it carries
 * their mark, their wording and enough contrast.
 *
 * Apple's guidance is black on light, white on dark, which is what `bg-inverse`
 * is, so the button follows the theme without a branch.
 */
export function ProviderButton({ provider, onPress, disabled, loading }: ProviderButtonProps) {
  const { t } = useTranslation('onboarding')
  const colors = useThemeColors()
  const isApple = provider === 'apple'

  return (
    <Button
      fullWidth
      variant={isApple ? 'neutral' : 'neutral'}
      // Apple: the inverted surface, which is black in light mode and white in
      // dark. Google: the outlined surface its own light button specifies.
      contentClassName={isApple ? 'bg-inverse border-inverse' : 'bg-surface border-line'}
      labelClassName={isApple ? 'text-on-inverse' : 'text-ink'}
      leftIcon={
        <BrandMark
          brand={provider}
          size={22}
          // Only Apple's mark takes a colour; Google's is fixed by its owner.
          color={isApple ? colors.onInverse : undefined}
        />
      }
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      accessibilityLabel={t(isApple ? 'account.apple' : 'account.google')}
    >
      {t(isApple ? 'account.apple' : 'account.google')}
    </Button>
  )
}
