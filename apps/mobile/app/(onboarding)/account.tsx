import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { OnboardingStep } from '@/features/onboarding'
import { Button, Checkbox, Divider, Icon, Text, TextField } from '@/ui'

/** 08 CREATE ACCOUNT */
export default function AccountStep() {
  const { t } = useTranslation('onboarding')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  // Errors appear only after a submit attempt. Marking a field invalid while
  // the user is still typing their address is the most common form sin there is.
  const [submitted, setSubmitted] = useState(false)

  const emailError = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ? undefined
    : t('account.errors.email')
  const passwordError = password.length >= 8 ? undefined : t('account.errors.password')
  const valid = !emailError && !passwordError && accepted

  const submit = () => {
    setSubmitted(true)
    if (valid) router.push('/trial')
  }

  return (
    <OnboardingStep
      step={6}
      total={7}
      accent="water"
      title={t('account.title')}
      subtitle={t('account.subtitle')}
      primaryLabel={t('account.submit')}
      onPrimary={submit}
    >
      <View className="gap-2.5">
        {/* No real provider is wired: these skip ahead exactly as a successful
            sign-in would, which is what the flow needs to be walkable. */}
        <Button
          variant="neutral"
          fullWidth
          leftIcon={<Icon set="system" name="phone" size={24} />}
          onPress={() => router.push('/trial')}
        >
          {t('account.apple')}
        </Button>
        <Button
          variant="neutral"
          fullWidth
          leftIcon={<Icon set="system" name="language" size={24} />}
          onPress={() => router.push('/trial')}
        >
          {t('account.google')}
        </Button>
      </View>

      <View className="flex-row items-center gap-3 py-1">
        <Divider className="flex-1" />
        <Text variant="caption">{t('account.or')}</Text>
        <Divider className="flex-1" />
      </View>

      <TextField
        label={t('account.email')}
        placeholder={t('account.emailPlaceholder')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={submitted ? emailError : undefined}
      />

      <TextField
        label={t('account.password')}
        placeholder={t('account.passwordPlaceholder')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        error={submitted ? passwordError : undefined}
      />

      <Checkbox checked={accepted} onChange={setAccepted} label={t('account.terms')} />

      {submitted && !accepted ? (
        <Text variant="meta" className="text-hibiscus-ink">
          {t('account.errors.terms')}
        </Text>
      ) : null}
    </OnboardingStep>
  )
}
