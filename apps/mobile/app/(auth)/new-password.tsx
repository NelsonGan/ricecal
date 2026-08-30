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
 * One screen rather than two, for a race rather than a taste. Verifying a
 * recovery code creates a session, which is what makes it a licence to set a new
 * password, and `(auth)/_layout` redirects the moment a session appears. Split
 * across two screens the guard carried the user off to Today with the password
 * they could not remember still in force.
 *
 * Together, nothing is verified until Save and the session and the new password
 * land within milliseconds of each other. The guard leaves this one screen alone,
 * so the last step cannot be interrupted by its own success.
 *
 * It reads better too: the code is next to the field it unlocks.
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
  /** Which request is running, so the spinner lands on the control that was
   *  pressed rather than always on the footer. See `password.tsx`. */
  const [running, setRunning] = useState<'save' | 'resend' | null>(null)
  const busy = running !== null
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

  const attempt = async (which: 'save' | 'resend', work: () => Promise<void>) => {
    setRunning(which)
    try {
      await work()
    } catch (error) {
      toast.show({ title: message(error), tone: 'error' })
    } finally {
      setRunning(null)
    }
  }

  const save = () => {
    setSubmitted(true)
    if (badCode || tooShort || mismatched) return

    attempt('save', async () => {
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
    attempt('resend', async () => {
      await sendPasswordReset(email, await captcha())
      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      toast.show({ title: t('auth:verify.resent') })
    })

  return (
    <Screen
      footer={
        <Button fullWidth onPress={save} disabled={busy} loading={running === 'save'}>
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
          // The platform's keyboard, like the code field on `verify`. A code is
          // six digits rather than a quantity: the app's pad drops the leading
          // zero and takes `oneTimeCode` autofill with it. See `systemKeyboard`.
          keyboardType="number-pad"
          systemKeyboard
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          inputClassName="text-[24px] tracking-[8px]"
          error={submitted && badCode ? t('auth:errors.codeLength') : undefined}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!busy}
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
        editable={!busy}
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
        editable={!busy}
      />

      {/* Only when a code is what is missing. Offered to somebody who arrived
          through the link, it would post a second mail they have no use for and
          spend their one send a minute. A quiet centred link, matching the same
          offer on `verify`. */}
      {needsCode ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          onPress={resend}
          disabled={busy || cooldown > 0}
          loading={running === 'resend'}
        >
          {cooldown > 0
            ? t('auth:verify.resendIn', { seconds: cooldown })
            : t('auth:verify.resend')}
        </Button>
      ) : null}
    </Screen>
  )
}
