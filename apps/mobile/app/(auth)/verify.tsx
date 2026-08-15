import { useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { type CodePurpose, resendConfirmation, sendLoginLink, verifyEmailCode } from '@/data/auth'
import { useAuthMessage, useCaptchaToken } from '@/features/auth'
import { StepHeader } from '@/features/onboarding'
import { useBack } from '@/lib/navigation'
import { AppBar, Button, Screen, Text, TextField, useToast } from '@/ui'

/** How long the code is, and it agrees with `mailer_otp_length` on the project. */
const CODE_LENGTH = 6

/**
 * How long before "send it again" works.
 *
 * `smtp_max_frequency` is 60 seconds, so a second mail asked for inside that
 * window is refused with a sentence about security and a number in it. A button
 * that is enabled and always fails is worse than one that says when it will
 * work, so the wait is drawn rather than discovered.
 */
const RESEND_COOLDOWN_S = 60

/**
 * The six digits from the email.
 *
 * THIS SCREEN IS WHY THE EMAILS CHANGED. A link is consumed by whatever fetches
 * it first — on a corporate address, the employer's link scanner — so the mail
 * arrived already spent and the app said it had expired. And a link only ever
 * worked when the mail was opened on the phone the app is on, which is not
 * where most people read mail. A code has neither problem: nothing can spend it
 * by reading a mailbox, and it crosses from a laptop to a phone in somebody's
 * head.
 *
 * The link still works, and `LoginLinkHandler` still catches it. It is the
 * second offer now rather than the only one.
 *
 * Recovery is NOT handled here. Choosing a new password needs the code and the
 * password on one screen, for the reason `new-password.tsx` gives.
 */
export default function VerifyScreen() {
  const { t } = useTranslation(['auth', 'common'])
  const toast = useToast()
  const message = useAuthMessage()
  const captcha = useCaptchaToken()

  const params = useLocalSearchParams<{
    email?: string
    purpose?: CodePurpose
    step?: string
    total?: string
  }>()
  const email = (params.email ?? '').trim()
  const purpose: Exclude<CodePurpose, 'recovery'> = params.purpose === 'signup' ? 'signup' : 'email'

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  /**
   * Seconds left before another mail can be asked for.
   *
   * Starts full, because arriving here means one was just sent. Counted down in
   * state rather than from a timestamp because nothing has to survive a
   * backgrounded app: coming back to a stale countdown is fixed by the server's
   * own answer, which carries the real wait.
   */
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    ticker.current = setInterval(() => {
      setCooldown((left) => (left > 0 ? left - 1 : 0))
    }, 1000)
    return () => {
      if (ticker.current) clearInterval(ticker.current)
    }
  }, [])

  const back = useBack('/(auth)/sign-in')

  const tooShort = code.length !== CODE_LENGTH

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

  const submit = () => {
    setSubmitted(true)
    if (tooShort) return
    // No navigation on success. The session appears and the guard in `_layout`
    // decides where this person belongs, which is not the same place for
    // somebody halfway through onboarding as for somebody coming back.
    attempt(() => verifyEmailCode(email, code, purpose))
  }

  const resend = () =>
    attempt(async () => {
      const token = await captcha()
      // The two purposes are two different tokens on the row. Asking for a
      // magic link when the account is waiting to confirm its address signs
      // them in without ever confirming it, and the password path then refuses
      // the account it just let through.
      if (purpose === 'signup') await resendConfirmation(email, token)
      else await sendLoginLink(email, token)

      setCooldown(RESEND_COOLDOWN_S)
      setCode('')
      toast.show({ title: t('auth:verify.resent') })
    })

  const step = Number(params.step)
  const total = Number(params.total)
  const showProgress = Number.isFinite(step) && Number.isFinite(total) && step > 0 && step <= total

  return (
    <Screen
      footer={
        <Button fullWidth onPress={submit} disabled={busy} loading={busy}>
          {t('auth:verify.submit')}
        </Button>
      }
    >
      {showProgress ? (
        <StepHeader step={step} total={total} tone="pandan" onBack={back} />
      ) : (
        <AppBar onBack={back} backLabel={t('common:a11y.back')} />
      )}

      <View className="gap-2 pb-2 pt-6">
        <Text variant="screenTitle">
          {t(purpose === 'signup' ? 'auth:verify.signUpTitle' : 'auth:verify.signInTitle')}
        </Text>
        <Text variant="meta">{t('auth:verify.sentTo', { email })}</Text>
      </View>

      <TextField
        label={t('auth:verify.field')}
        value={code}
        onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        placeholder={t('auth:verify.placeholder')}
        // `number-pad` is what hands this to the app's own `Numpad`, which is
        // the rule for every numeric field here — see the note about iOS 26's
        // floating "Done" pill in CLAUDE.md. `Screen` provides the host.
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        inputClassName="text-[24px] tracking-[8px]"
        error={submitted && tooShort ? t('auth:errors.codeLength') : undefined}
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <View className="gap-1 pt-2">
        <Button variant="ghost" fullWidth onPress={resend} disabled={busy || cooldown > 0}>
          {cooldown > 0
            ? t('auth:verify.resendIn', { seconds: cooldown })
            : t('auth:verify.resend')}
        </Button>
      </View>

      <Text variant="meta">{t('auth:verify.wrongEmail')}</Text>
    </Screen>
  )
}
