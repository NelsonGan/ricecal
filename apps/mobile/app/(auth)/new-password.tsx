import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'
import { View } from 'react-native'

import { useSession } from '@/data'
import { sendPasswordReset, updatePassword, verifyEmailCode } from '@/data/auth'
import { PasswordField, useAuthMessage, useCaptchaToken } from '@/features/auth'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, Text, TextField, useToast } from '@/ui'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_S = 60

/**
 * The end of a password reset: the code and the new password, on one screen.
 *
 * ONE SCREEN RATHER THAN TWO, and the reason is a race rather than a taste.
 * Verifying a recovery code CREATES A SESSION — that is what makes it a licence
 * to set a new password — and `(auth)/_layout` redirects the moment a session
 * appears, which is the correct behaviour for every other way into this stack.
 * Split across two screens, the code screen verifies, the session lands, and
 * the guard carries the user off to Today before the second screen has drawn:
 * signed in, with the password they could not remember still in force, and
 * nothing on screen to say the reset did not finish.
 *
 * Together, nothing is verified until Save, the passwords are checked locally
 * first, and the session and the new password land within a few milliseconds of
 * each other. The guard is told to leave this one screen alone (see the layout)
 * so the last step cannot be interrupted by its own success.
 *
 * It reads better too. The code is next to the field it unlocks, and somebody
 * switching to their mail app and back comes back to one screen rather than
 * wondering which of two they were on.
 */
export default function NewPasswordScreen() {
  const { t } = useTranslation(['auth', 'common'])
  const router = useRouter()
  const toast = useToast()
  const message = useAuthMessage()
  const captcha = useCaptchaToken()

  const params = useLocalSearchParams<{ email?: string }>()
  const email = (params.email ?? '').trim()

  /**
   * THERE ARE TWO WAYS TO ARRIVE HERE, and they differ by exactly one field.
   *
   * From the code: `password.tsx` posted a reset and pushed this screen, so
   * there is no session and the code below is what gets one.
   *
   * From the link: the reader tapped the button in the mail, `LoginLinkHandler`
   * exchanged it, and a session ALREADY EXISTS. Asking for a code as well would
   * be asking them to go back to a mail whose code was spent by the link they
   * just used.
   *
   * Session-or-not is the honest test, rather than a parameter saying which
   * route was taken: it is the thing the next call actually depends on, and it
   * stays right if somebody opens the link while this screen is already up.
   */
  const { session } = useSession()
  const needsCode = !session

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Full on arrival, because the mail that brought them here just went out. */
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)
  useEffect(() => {
    const ticker = setInterval(() => setCooldown((left) => (left > 0 ? left - 1 : 0)), 1000)
    return () => clearInterval(ticker)
  }, [])

  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)

  const back = useBack('/(auth)/sign-in')

  const badCode = needsCode && code.length !== CODE_LENGTH
  const tooShort = password.length < 8
  const mismatched = confirm !== password

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
    } catch (error) {
      toast.show({ title: message(error), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    setSubmitted(true)
    if (badCode || tooShort || mismatched) return

    attempt(async () => {
      // In this order, and the local checks above are what make it safe. The
      // code is spent by `verifyEmailCode`, so a password rejected AFTER it
      // would leave the user signed in with the old one and no code left to try
      // again with. Length and match are settled before anything is sent.
      if (needsCode) await verifyEmailCode(email, code, 'recovery')
      await updatePassword(password)

      toast.show({ title: t('auth:reset.done') })
      // Ours to do, because the guard is deliberately not watching this screen.
      // `/` rather than `/today`: index is what knows whether onboarding is
      // finished, and a reset can happen to somebody who never got that far.
      router.replace('/')
    })
  }

  const resend = () =>
    attempt(async () => {
      await sendPasswordReset(email, await captcha())
      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      toast.show({ title: t('auth:verify.resent') })
    })

  return (
    <Screen
      footer={
        <Button fullWidth onPress={save} disabled={busy} loading={busy}>
          {t('auth:reset.save')}
        </Button>
      }
    >
      <AppBar onBack={back} backLabel={t('common:a11y.back')} />

      <View className="gap-2 pb-2 pt-6">
        <Text variant="screenTitle">{t('auth:reset.newTitle')}</Text>
        <Text variant="meta">
          {needsCode ? t('auth:verify.sentTo', { email }) : t('auth:reset.newSubtitle')}
        </Text>
      </View>

      {needsCode ? (
        <TextField
          label={t('auth:verify.field')}
          value={code}
          onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder={t('auth:verify.placeholder')}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          inputClassName="text-[24px] tracking-[8px]"
          error={submitted && badCode ? t('auth:errors.codeLength') : undefined}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
      ) : null}

      <PasswordField
        ref={passwordRef}
        label={t('auth:reset.field')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth:password.placeholder')}
        autoComplete="new-password"
        textContentType="newPassword"
        error={submitted && tooShort ? t('auth:errors.passwordShort') : undefined}
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />

      <PasswordField
        ref={confirmRef}
        label={t('auth:reset.confirmField')}
        value={confirm}
        onChangeText={setConfirm}
        placeholder={t('auth:password.placeholder')}
        autoComplete="new-password"
        textContentType="newPassword"
        error={submitted && !tooShort && mismatched ? t('auth:errors.passwordMismatch') : undefined}
        returnKeyType="go"
        onSubmitEditing={save}
      />

      {/* Only when a code is what is missing. Offered to somebody who arrived
          through the link, it would post a second mail they have no use for and
          spend their one send a minute. */}
      {needsCode ? (
        <Button variant="ghost" fullWidth onPress={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0
            ? t('auth:verify.resendIn', { seconds: cooldown })
            : t('auth:verify.resend')}
        </Button>
      ) : null}
    </Screen>
  )
}
