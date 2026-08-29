import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TextInput } from 'react-native'
import { View } from 'react-native'

import {
  asAuthProblem,
  resendConfirmation,
  signInWithPassword,
  signUpWithPassword,
} from '@/data/auth'
import { PasswordField, useAuthMessage, useCaptchaToken } from '@/features/auth'
import { StepHeader } from '@/features/onboarding'
import { useBack } from '@/lib/navigation'
import { Alert, AppBar, Button, Divider, Screen, Tappable, Text, useToast } from '@/ui'

/** Which half of the screen is showing. Only the copy and the calls differ. */
type Mode = 'sign-in' | 'sign-up'

/**
 * The password, on a screen of its own.
 *
 * Split from sign-in on purpose: the address and the password are two questions,
 * and a single form asking both cannot know which it is running until both are
 * filled in. Apart, the first screen offers three ways in and this one is about
 * the one chosen, so it can name the account and put "forgot your password"
 * where somebody who has just failed to remember one will look.
 *
 * Nothing here is a dead end. A password that does not match offers a code, an
 * address that already has an account offers sign-in, and an account that never
 * confirmed gets a fresh code rather than an error.
 */
export default function PasswordScreen() {
  const { t } = useTranslation(['auth', 'onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const message = useAuthMessage()
  const captcha = useCaptchaToken()

  const params = useLocalSearchParams<{
    email?: string
    mode?: Mode
    step?: string
    total?: string
  }>()
  const email = (params.email ?? '').trim()

  /**
   * Held in state rather than read from the route, because this screen can
   * switch sides without going anywhere: somebody signing up at an address that
   * already has an account is offered sign-in right here, and pushing a second
   * copy of the same screen to say so would leave the first one in the stack
   * behind it.
   */
  const [mode, setMode] = useState<Mode>(params.mode === 'sign-in' ? 'sign-in' : 'sign-up')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  /**
   * ONE request can be in flight here, and it is always the same one.
   *
   * That is the shape of the screen rather than a simplification of it. A tap
   * that is going somewhere now goes there first and does its network work on
   * arrival, so nothing else on this page waits — only signing in and signing
   * up stay, because those two ARE the request and there is nowhere to go until
   * the server answers. So the flag can say "the form is submitting" and the
   * spinner can only land on the button that means it.
   */
  const [busy, setBusy] = useState(false)
  /**
   * Set when a signup came back looking like a repeat. It does NOT say the
   * account exists — see the copy, and `signUpWithPassword` for why Supabase
   * refuses to either.
   */
  const [maybeExisting, setMaybeExisting] = useState(false)

  const confirmRef = useRef<TextInput>(null)

  const step = Number(params.step)
  const total = Number(params.total)
  const showProgress = Number.isFinite(step) && Number.isFinite(total) && step > 0 && step <= total

  /** Carried onto every screen this one pushes, so the bar does not vanish. */
  const flow = showProgress ? { step: String(step), total: String(total) } : {}

  /**
   * The minimum, and it agrees with the server. SIGNING UP ONLY.
   *
   * `password_min_length` is 8 on the project and in `config.toml`, and it is
   * checked here as well because a rejection that costs a round trip to learn
   * reads as a broken button on a slow connection.
   *
   * On the SIGN-IN side there is no policy to enforce, only a password to send.
   * A form that refuses to submit a seven-character password is a form that
   * cannot sign in an account created before the minimum was raised, or by any
   * route that did not go through this screen — and it fails in the one way
   * nobody can debug from the outside, by telling somebody their own correct
   * password is too short. What the server accepts is the server's business.
   */
  const tooShort = mode === 'sign-up' ? password.length < 8 : password.length === 0
  const mismatched = mode === 'sign-up' && confirm !== password

  /**
   * The sentence under the field, and it follows the rule that was broken
   * rather than the field it was broken in. "Use at least 8 characters" over an
   * empty box on the sign-in side is advice about a password nobody is choosing.
   */
  const shortMessage = t(
    mode === 'sign-up' ? 'auth:errors.passwordShort' : 'auth:errors.passwordRequired',
  )

  const localError = tooShort
    ? shortMessage
    : mismatched
      ? t('auth:errors.passwordMismatch')
      : undefined

  // `useBack` rather than `router.back()`: with nothing left to pop, `back()`
  // is offered to the tabs underneath and answered by changing tab. See the
  // note in `src/lib/navigation.ts`.
  const back = useBack('/(onboarding)/welcome')

  /** One failure path for the one request this screen makes. */
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
    if (localError) return

    attempt(async () => {
      const token = await captcha()

      if (mode === 'sign-in') {
        try {
          await signInWithPassword(email, password, token)
          // No navigation. The session appears and the guard in `_layout`
          // moves the user; pushing here as well would race it.
          return
        } catch (error) {
          // Right password, address never confirmed. That is not a failure to
          // report and walk away from: the account is real and one mail away
          // from working, so post the code and carry on into the same screen a
          // fresh signup would have reached.
          // Read through `asAuthProblem` rather than with `instanceof`: see the
          // note on `isAuthProblem` for why class identity is not something to
          // branch on here.
          if (asAuthProblem(error).reason === 'email_not_confirmed') {
            await resendConfirmation(email, await captcha())
            toast.show({ title: t('auth:errors.email_not_confirmed') })
            router.push({
              pathname: '/(auth)/verify',
              params: { email, purpose: 'signup', ...flow },
            })
            return
          }
          throw error
        }
      }

      try {
        const outcome = await signUpWithPassword(email, password, token)
        // `signed-in` only happens on a stack with confirmations off. There is
        // nowhere to go: the guard has already seen the session.
        if (outcome === 'confirm') {
          router.push({ pathname: '/(auth)/verify', params: { email, purpose: 'signup', ...flow } })
        }
      } catch (error) {
        if (asAuthProblem(error).reason === 'account_exists') {
          setMaybeExisting(true)
          setMode('sign-in')
          setSubmitted(false)
          setConfirm('')
          return
        }
        throw error
      }
    })
  }

  /**
   * The way in that always works, whether or not this account has a password.
   *
   * GOES FIRST AND SENDS ON ARRIVAL. It used to post the mail here and navigate
   * on the answer, which put a whole round trip — a captcha token, then an SMTP
   * send Supabase does synchronously — between the tap and anything happening.
   * On a slow connection that is several seconds of a screen that has not
   * changed, which is the shape of a button that did not work, and the usual
   * reply to it is a second tap. The code screen is where the waiting belongs:
   * it can say a mail is on its way while it is on its way, and it is where the
   * person needs to be either way.
   */
  const mailCode = () =>
    router.push({
      pathname: '/(auth)/verify',
      params: { email, purpose: 'email', send: '1', ...flow },
    })

  /**
   * Opens the screen that asks WHICH address. Nothing is sent from here: see
   * `forgot.tsx` for why assuming the address is the wrong thing to do to
   * somebody who has just failed to remember something.
   */
  const forgot = () => router.push({ pathname: '/(auth)/forgot', params: { email } })

  const signingUp = mode === 'sign-up'

  return (
    <Screen
      footer={
        <Button fullWidth onPress={submit} disabled={busy} loading={busy}>
          {t(signingUp ? 'auth:password.createAccount' : 'auth:password.signIn')}
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
          {t(signingUp ? 'auth:password.signUpTitle' : 'auth:password.signInTitle')}
        </Text>
        <Text variant="meta">
          {t(signingUp ? 'auth:password.signUpSubtitle' : 'auth:password.signInSubtitle', {
            email,
          })}
        </Text>
      </View>

      {maybeExisting ? <Alert tone="info" title={t('auth:password.maybeExisting')} /> : null}

      <PasswordField
        label={t('auth:password.field')}
        /* Level with the label, and only on the sign-in side. Offered next to
           "choose a password" it is a reset for an account that does not exist
           yet, which sends a mail saying nothing. */
        labelAction={
          signingUp ? null : (
            <Tappable
              onPress={forgot}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              // A line of 13pt text is a 17pt tap target. Padding would make
              // the label row taller than the label, so the slop grows the
              // touch area without moving anything.
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text variant="caption" className={busy ? 'text-faint' : 'text-pandan-ink'}>
                {t('auth:password.forgot')}
              </Text>
            </Tappable>
          )
        }
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth:password.placeholder')}
        // `new-password` is what makes a keychain OFFER TO SAVE one rather than
        // trying to fill it, and the two screens want opposite answers.
        autoComplete={signingUp ? 'new-password' : 'current-password'}
        textContentType={signingUp ? 'newPassword' : 'password'}
        error={submitted && tooShort ? shortMessage : undefined}
        returnKeyType={signingUp ? 'next' : 'go'}
        onSubmitEditing={() => (signingUp ? confirmRef.current?.focus() : submit())}
        editable={!busy}
      />

      {signingUp ? (
        <PasswordField
          ref={confirmRef}
          label={t('auth:password.confirmField')}
          value={confirm}
          onChangeText={setConfirm}
          placeholder={t('auth:password.placeholder')}
          autoComplete="new-password"
          textContentType="newPassword"
          error={
            submitted && !tooShort && mismatched ? t('auth:errors.passwordMismatch') : undefined
          }
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!busy}
        />
      ) : null}

      {/* THREE OFFERS, THREE WEIGHTS, and they used to be one.
          A ghost button is a line of text with a tap target round it, so three
          of them stacked read as three sentences somebody had left lying on the
          page rather than as things to press — and the stack grew to three
          exactly when a signup bounced, which is the worst moment to look
          unfinished.

          So the alternative ROUTE gets a real button, behind the same divider
          the address screen uses to separate a provider from an address, and
          the two things that only change what this screen is asking stay quiet
          underneath it. */}
      <View className="flex-row items-center gap-3 pt-2">
        <Divider className="flex-1" />
        <Text variant="meta">{t('onboarding:account.or')}</Text>
        <Divider className="flex-1" />
      </View>

      {/* Navigates rather than sends, so it never spins. */}
      <Button variant="secondary" fullWidth onPress={mailCode} disabled={busy}>
        {t('auth:password.codeInstead')}
      </Button>

      <View className="items-center gap-1 pt-1">
        {/* Sends nothing either: it swaps which question the screen is asking. */}
        <Button
          variant="ghost"
          size="sm"
          className="self-center"
          disabled={busy}
          onPress={() => {
            setMode(signingUp ? 'sign-in' : 'sign-up')
            setSubmitted(false)
            setConfirm('')
            setMaybeExisting(false)
          }}
        >
          {t(signingUp ? 'auth:password.haveAccount' : 'auth:password.needAccount')}
        </Button>
      </View>
    </Screen>
  )
}
