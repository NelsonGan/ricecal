import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  appleSignInAvailable,
  googleSignInAvailable,
  SignInCancelled,
  signInWithApple,
  signInWithGoogle,
} from '@/data/auth'
import { ProviderButton, useAuthMessage } from '@/features/auth'
import { StepHeader } from '@/features/onboarding'
import { AppBar, Button, Divider, Icon, Screen, Text, TextField, useToast } from '@/ui'

/** Only what the screen says differs; the email button does the same thing either way. */
type Mode = 'sign-in' | 'sign-up'

/**
 * The gate. Nothing behind it renders without a session.
 *
 * THREE WAYS IN, and this screen's only job is to find out which. Apple and
 * Google hand back an identity token and are done in one tap. Email is a
 * question, so it takes an address here and asks the rest on the next screen:
 * a password, or a code in the post, whichever the person wants.
 *
 * It used to end here, with one button that mailed a link. What that could not
 * survive is somebody who opens this app every day, for whom "wait for an
 * email" is the whole cost of coming back, and somebody on a work address whose
 * employer's link scanner spends the link before they can. So the address is
 * still all this screen asks for, and `password.tsx` owns the rest.
 *
 * `mode` decides the heading and which side of the next screen opens. It does
 * NOT change what any of these buttons do: Supabase makes the account when the
 * identity is new either way.
 *
 * Nothing here explains the app any more. Both ways in pass through welcome or
 * the questions first, so by the time anyone reads this screen the pitch has
 * been made.
 */
export default function SignInScreen() {
  const { t } = useTranslation(['auth', 'onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()
  const message = useAuthMessage()

  /**
   * Which side to open on, when the caller knows.
   *
   * Welcome has a button for each direction, and "I already have an account"
   * under a "Save your progress" heading makes the tap look ignored. Sign-in is
   * the default, because a bare visit to this route is someone coming back — a
   * new user reaches it at the end of onboarding, which says so explicitly.
   */
  const params = useLocalSearchParams<{ mode?: Mode; step?: string; total?: string }>()
  const mode: Mode = params.mode === 'sign-up' ? 'sign-up' : 'sign-in'

  /**
   * The onboarding bar, when onboarding is what sent us here.
   *
   * This screen belongs to two flows. In the middle of onboarding it is one
   * numbered step of eight, and dropping the bar for exactly the screen that
   * asks for an email is where a flow reads as having stopped being a flow — the
   * question the user is weighing at that moment is "how much more of this is
   * there", and the answer was on every screen but this one. Reached on its own,
   * by a returning user tapping "I already have an account", there is no flow
   * and no bar.
   *
   * Passed as params rather than read from a store because the position is a
   * property of the route that pushed this one, and this file must not learn the
   * shape of a flow it is only borrowed by. It is passed onward to the password
   * and code screens for the same reason.
   */
  const step = Number(params.step)
  const total = Number(params.total)
  const showProgress = Number.isFinite(step) && Number.isFinite(total) && step > 0 && step <= total

  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

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

  /** Both providers funnel through here so one failure path serves them. */
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      // No navigation on success: the session changes, and the guard in
      // `_layout` moves the user. Pushing here as well would race it.
    } catch (error) {
      if (error instanceof SignInCancelled) return
      toast.show({ title: message(error), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  /**
   * The email route, and it sends nothing.
   *
   * Nothing is posted until the next screen, where the person has said whether
   * they want a password or a code. Mailing one here on the way past would send
   * a code to everybody who typed an address, including everybody about to type
   * a password they remember perfectly well — and the send limit is one mail a
   * minute, so those wasted sends are taken out of a real one later.
   */
  const withEmail = () => {
    setSubmitted(true)
    if (emailError) return

    router.push({
      pathname: '/(auth)/password',
      params: {
        email: email.trim(),
        mode,
        ...(showProgress ? { step: String(step), total: String(total) } : {}),
      },
    })
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={withEmail} disabled={busy}>
          {t('auth:choose.email')}
        </Button>
      }
    >
      {/* A CHEVRON EITHER WAY, because there is no edge swipe here any more.
          This route is pushed onto the ROOT stack from inside onboarding, so a
          gesture on it unwound the root rather than the questions — see
          `(onboarding)/_layout.tsx`. Where it goes depends on which flow sent
          us: the target screen for somebody mid-onboarding, welcome for a
          returning user who tapped "I already have an account".

          `dismissTo` rather than `back()`, for the reason the target screen
          gives: this route is deep-linkable, `back()` with nothing to pop is
          answered by whichever navigator is listening, and `dismissTo` falls
          back to replacing this screen with the href. */}
      {showProgress ? (
        <StepHeader
          step={step}
          total={total}
          tone="pandan"
          onBack={() => router.dismissTo('/(onboarding)/target')}
        />
      ) : (
        // No title: the heading a few points below says "Welcome back", and a
        // bar repeating it would be the same words twice.
        <AppBar
          onBack={() => router.dismissTo('/(onboarding)/welcome')}
          backLabel={t('common:a11y.back')}
        />
      )}

      <View className="items-center gap-3 pb-2 pt-6">
        <Icon set="food" name="rice-bowl" size={96} />
        {/* The heading follows the mode. It used to read "Save your progress"
            in both, so arriving from "I already have an account" showed a
            screen that had apparently ignored the tap. */}
        <Text variant="screenTitle" className="text-center">
          {mode === 'sign-up' ? t('onboarding:account.title') : t('onboarding:account.signInTitle')}
        </Text>
        <Text variant="meta" className="text-center">
          {mode === 'sign-up'
            ? t('onboarding:account.subtitle')
            : t('onboarding:account.signInSubtitle')}
        </Text>
      </View>

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
        onSubmitEditing={withEmail}
      />

      <Text variant="meta">{t('auth:choose.explainer')}</Text>
    </Screen>
  )
}
