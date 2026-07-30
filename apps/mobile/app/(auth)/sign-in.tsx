import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type TextInput, View } from 'react-native'

import {
  appleSignInAvailable,
  googleSignInAvailable,
  SignInCancelled,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/data/auth'
import { ProviderButton } from '@/features/auth'
import { Alert, Button, Divider, Icon, Screen, Text, TextField, useToast } from '@/ui'

type Mode = 'sign-in' | 'sign-up'

/**
 * The gate. Nothing behind it renders without a session.
 *
 * One screen for both directions rather than two: the fields are identical,
 * the difference is one call, and a user who mistypes an address on a "create
 * account" screen should not have to find the other one to try again.
 */
export default function SignInScreen() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()

  /**
   * Which side to open on, when the caller knows.
   *
   * The welcome screen has a button for each direction, and "I already have an
   * account" landing on a Create account form makes the tap look ignored. Sign
   * up stays the default: a user arriving from the router has no account yet
   * more often than not.
   */
  const params = useLocalSearchParams<{ mode?: Mode }>()
  const [mode, setMode] = useState<Mode>(params.mode === 'sign-in' ? 'sign-in' : 'sign-up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()

  // So "next" on the password keyboard lands in the confirmation field rather
  // than dismissing the keyboard and leaving the last field unnoticed.
  const confirmRef = useRef<TextInput>(null)

  // Asked of the OS rather than assumed from the platform, because a local
  // simulator build ships without the entitlement. `undefined` until the answer
  // arrives, so the button does not appear and then vanish.
  const [appleReady, setAppleReady] = useState<boolean | undefined>()
  useEffect(() => {
    let cancelled = false
    appleSignInAvailable().then((ready) => {
      if (!cancelled) setAppleReady(ready)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const emailError = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
    ? undefined
    : t('onboarding:account.errors.email')

  /**
   * The length rule belongs to sign-UP only.
   *
   * On sign-in the password is whatever the account already has, and refusing
   * to submit a 6-character one tells a user with a valid old password that
   * their own password is malformed — while the actual server-side answer
   * ("wrong password", or "that account does not exist") never gets a chance
   * to be shown.
   */
  const passwordError =
    mode === 'sign-up' && password.length < 8
      ? t('onboarding:account.errors.password')
      : password.length === 0
        ? t('onboarding:account.errors.passwordEmpty')
        : undefined

  /**
   * Confirmation is a sign-UP concern only.
   *
   * A typo in a password you cannot read is invisible until the next time you
   * try to sign in — by which point the only way back is a reset mail. Asking
   * twice is the cheapest place to catch it. On sign-in there is nothing to
   * catch: the server already knows the answer.
   */
  const confirmPasswordError =
    mode !== 'sign-up'
      ? undefined
      : confirmPassword.length === 0
        ? t('onboarding:account.errors.confirmPasswordEmpty')
        : confirmPassword !== password
          ? t('onboarding:account.errors.confirmPasswordMismatch')
          : undefined
  const valid = !emailError && !passwordError && !confirmPasswordError

  /** Every provider funnels through here so one failure path serves all three. */
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true)
    setNotice(undefined)
    try {
      await work()
      // No navigation on success: the session changes, and the router's guard
      // moves the user. Pushing here as well would race it.
    } catch (error) {
      if (error instanceof SignInCancelled) return
      toast.show({
        title: error instanceof Error ? error.message : t('common:action.retry'),
        tone: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = () => {
    setSubmitted(true)
    if (!valid) return

    attempt(async () => {
      if (mode === 'sign-in') {
        await signInWithEmail(email, password)
        return
      }
      const result = await signUpWithEmail(email, password)
      // A project with confirmations on hands back no session. Saying so is
      // the whole difference between "nothing happened" and "go and click the
      // link we just sent you".
      if (result.status === 'check-your-email') {
        setNotice(t('onboarding:account.checkEmail', { email: result.email }))
      }
    })
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={submitEmail} disabled={busy}>
          {mode === 'sign-up' ? t('onboarding:account.submit') : t('onboarding:account.signInCta')}
        </Button>
      }
    >
      <View className="items-center gap-3 pt-6 pb-2">
        <Icon set="food" name="rice-bowl" size={96} />
        {/* The heading follows the mode. It used to read "Save your progress"
            in both, so tapping "I already have an account" changed one button
            label and nothing else — the screen looked like it had ignored the
            tap. */}
        <Text variant="screenTitle" className="text-center">
          {mode === 'sign-up' ? t('onboarding:account.title') : t('onboarding:account.signInTitle')}
        </Text>
        <Text variant="meta" className="text-center">
          {mode === 'sign-up'
            ? t('onboarding:account.subtitle')
            : t('onboarding:account.signInSubtitle')}
        </Text>
      </View>

      {notice ? <Alert tone="success" title={notice} /> : null}

      {appleReady ? (
        <ProviderButton provider="apple" onPress={() => attempt(signInWithApple)} disabled={busy} />
      ) : null}

      {/* Hidden rather than disabled while its client ids are placeholders:
          a button that cannot succeed is worse than one fewer option. */}
      {googleSignInAvailable() ? (
        <ProviderButton
          provider="google"
          onPress={() => attempt(signInWithGoogle)}
          disabled={busy}
        />
      ) : null}

      <View className="flex-row items-center gap-3">
        <Divider className="flex-1" />
        <Text variant="meta">{t('onboarding:account.or')}</Text>
        <Divider className="flex-1" />
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
        returnKeyType="next"
      />

      <TextField
        label={t('onboarding:account.password')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('onboarding:account.passwordPlaceholder')}
        autoCapitalize="none"
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        secureTextEntry
        error={submitted ? passwordError : undefined}
        returnKeyType={mode === 'sign-up' ? 'next' : 'go'}
        onSubmitEditing={mode === 'sign-up' ? () => confirmRef.current?.focus() : submitEmail}
      />

      {mode === 'sign-up' ? (
        <TextField
          ref={confirmRef}
          label={t('onboarding:account.confirmPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('onboarding:account.confirmPasswordPlaceholder')}
          autoCapitalize="none"
          autoComplete="new-password"
          secureTextEntry
          error={submitted ? confirmPasswordError : undefined}
          returnKeyType="go"
          onSubmitEditing={submitEmail}
        />
      ) : null}

      <Button
        variant="ghost"
        fullWidth
        onPress={() => {
          setMode((current) => (current === 'sign-up' ? 'sign-in' : 'sign-up'))
          setSubmitted(false)
          setNotice(undefined)
          // Not carried across the switch: coming back to sign-up with a stale
          // value in a field the user cannot read is how a mismatch error
          // appears against a password they typed correctly.
          setConfirmPassword('')
        }}
      >
        {mode === 'sign-up' ? t('onboarding:welcome.signIn') : t('onboarding:account.needAccount')}
      </Button>

      <Button variant="ghost" fullWidth onPress={() => router.push('/welcome')}>
        {t('onboarding:account.aboutApp')}
      </Button>
    </Screen>
  )
}
