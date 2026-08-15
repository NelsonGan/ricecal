import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import {
  appleSignInAvailable,
  googleSignInAvailable,
  SignInCancelled,
  sendLoginLink,
  signInWithApple,
  signInWithGoogle,
} from '@/data/auth'
import { ProviderButton } from '@/features/auth'
import { StepHeader } from '@/features/onboarding'
import { Alert, AppBar, Button, Divider, Icon, Screen, Text, TextField, useToast } from '@/ui'

/** Only what the screen says differs; the email button does the same thing either way. */
type Mode = 'sign-in' | 'sign-up'

/**
 * The gate. Nothing behind it renders without a session.
 *
 * Three ways in and not one password among them. Apple and Google hand back an
 * identity token; email gets a link in the post. There is no separate sign-up
 * call to make either — `sendLoginLink` creates the account when the address is
 * new — so this screen has one action per provider rather than two, and `mode`
 * only decides the heading.
 *
 * Nothing here explains the app any more. Both ways in pass through welcome or
 * the seven questions first, so by the time anyone reads this screen the pitch
 * has been made.
 */
export default function SignInScreen() {
  const { t } = useTranslation(['onboarding', 'common'])
  const router = useRouter()
  const toast = useToast()

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
   * numbered step of nine, and dropping the bar for exactly the screen that asks
   * for an email is where a flow reads as having stopped being a flow — the
   * question the user is weighing at that moment is "how much more of this is
   * there", and the answer was on every screen but this one. Reached on its own,
   * by a returning user tapping "I already have an account", there is no flow
   * and no bar.
   *
   * Passed as params rather than read from a store because the position is a
   * property of the route that pushed this one, and this file must not learn the
   * shape of a flow it is only borrowed by.
   */
  const step = Number(params.step)
  const total = Number(params.total)
  const showProgress = Number.isFinite(step) && Number.isFinite(total) && step > 0 && step <= total

  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | undefined>()

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

  /** Every provider funnels through here so one failure path serves all three. */
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      // No navigation on success: the session changes, and the guard in
      // `_layout` moves the user. Pushing here as well would race it.
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

  const mailLink = () => {
    setSubmitted(true)
    if (emailError) return

    attempt(async () => {
      await sendLoginLink(email)
      // The session arrives through the link, not through this call, so this
      // screen has to say what happens next or it looks like nothing did.
      setSentTo(email.trim())
    })
  }

  return (
    <Screen
      footer={
        <Button fullWidth onPress={mailLink} disabled={busy}>
          {t('onboarding:account.sendLink')}
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

      {sentTo ? (
        <Alert tone="success" title={t('onboarding:account.linkSent', { email: sentTo })} />
      ) : null}

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
        onChangeText={(next) => {
          setEmail(next)
          // A new address means the last link is not the one being talked about
          // any more.
          setSentTo(undefined)
        }}
        placeholder={t('onboarding:account.emailPlaceholder')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={submitted ? emailError : undefined}
        returnKeyType="go"
        onSubmitEditing={mailLink}
      />

      <Text variant="meta">{t('onboarding:account.linkExplainer')}</Text>
    </Screen>
  )
}
