import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { sendPasswordReset } from '@/data/auth'
import { useAuthMessage, useCaptchaToken } from '@/features/auth'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, Text, TextField, useToast } from '@/ui'

/**
 * Which address to reset, asked rather than assumed. It used to send on the tap,
 * to whatever address the password screen was holding, which posts a mail before
 * the person has agreed to anything and assumes the address is the one they
 * meant. Somebody who cannot remember their password often cannot remember which
 * of two addresses they signed up with.
 *
 * So the tap opens this with nothing in flight, and the send happens behind a
 * button whose job is to send. The address is carried over as a starting value
 * because it usually is right, and it is a field because it is not always.
 */
export default function ForgotScreen() {
  const { t } = useTranslation(['auth', 'onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const message = useAuthMessage()
  const captcha = useCaptchaToken()

  const params = useLocalSearchParams<{ email?: string }>()
  const [email, setEmail] = useState((params.email ?? '').trim())
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  const back = useBack('/(auth)/sign-in')

  const emailError = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ? undefined
    : t('onboarding:account.errors.email')

  const send = async () => {
    setSubmitted(true)
    if (emailError || busy) return

    setBusy(true)
    try {
      const address = email.trim()
      await sendPasswordReset(address, await captcha())
      // `replace`, not `push`: this screen's whole job was to ask which address
      // and post the mail, and both are done. Left on the stack, the chevron on
      // the next screen comes back to a form whose button would send a second
      // mail into the same one-a-minute window.
      //
      // And `new-password` rather than the code screen: verifying a recovery
      // code creates a session, and the guard in `_layout` would carry the user
      // off to Today before they had chosen anything — see `new-password.tsx`.
      router.replace({ pathname: '/(auth)/new-password', params: { email: address } })
    } catch (error) {
      toast.show({ title: message(error), tone: 'error' })
      setBusy(false)
    }
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={send} disabled={busy} loading={busy}>
          {t('auth:reset.send')}
        </Button>
      }
    >
      <AppBar onBack={back} backLabel={t('common:a11y.back')} />

      <View className="gap-2 pb-2 pt-6">
        <Text variant="screenTitle">{t('auth:reset.askTitle')}</Text>
        <Text variant="meta">{t('auth:reset.askSubtitle')}</Text>
      </View>

      <TextField
        label={t('onboarding:account.email')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('onboarding:account.emailPlaceholder')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={submitted ? emailError : undefined}
        returnKeyType="go"
        onSubmitEditing={send}
        editable={!busy}
      />
    </Screen>
  )
}
