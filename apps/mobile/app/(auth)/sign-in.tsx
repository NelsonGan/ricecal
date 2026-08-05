import { useLocalSearchParams } from 'expo-router'
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
import { emailProblem, normaliseEmail, suggestEmail } from '@/lib/email'
import { Alert, Button, Divider, Icon, Screen, Text, TextField, useToast } from '@/ui'

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
  const toast = useToast()

  /**
   * Which side to open on, when the caller knows.
   *
   * Welcome has a button for each direction, and "I already have an account"
   * under a "Save your progress" heading makes the tap look ignored. Sign-in is
   * the default, because a bare visit to this route is someone coming back — a
   * new user reaches it at the end of onboarding, which says so explicitly.
   */
  const params = useLocalSearchParams<{ mode?: Mode }>()
  const mode: Mode = params.mode === 'sign-up' ? 'sign-up' : 'sign-in'

  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | undefined>()

  /**
   * The address we have already queried, and the correction we offered for it.
   *
   * Both, rather than a bare flag, because the question is about one specific
   * address: edit the field after declining and the next suspicious domain has
   * to be asked about afresh.
   */
  const [queried, setQueried] = useState<{ typed: string; meant: string } | undefined>()

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

  /**
   * Two different failures, and they need different sentences. A malformed
   * address is a typo; `example.com` is somebody deliberately getting past the
   * form, who has to be told that the form is how they get back in.
   */
  const problem = emailProblem(email)
  const emailError = problem
    ? t(
        problem === 'undeliverable' ? 'account.errors.emailUndeliverable' : 'account.errors.email',
        {
          ns: 'onboarding',
        },
      )
    : undefined

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

  /**
   * The first press on a suspicious address asks rather than sends.
   *
   * `gmail.con` is a well-formed address for a domain that does not take mail,
   * so nothing above catches it and the link goes nowhere — and because the
   * email IS the credential, the account it creates is one nobody can ever open.
   * Supabase counts that bounce against the project and throttles its shared
   * sender when enough of them add up, so one person's typo degrades sign-in for
   * everybody.
   *
   * Asked once and once only. A second press sends what is in the field, because
   * a domain one letter from a common one is sometimes exactly the domain the
   * user has — and a button that refuses twice is a button that has decided it
   * knows better than the person who owns the mailbox.
   */
  const mailLink = () => {
    setSubmitted(true)
    if (emailError) return

    const typed = normaliseEmail(email)
    if (queried?.typed !== typed) {
      const meant = suggestEmail(typed)
      setQueried({ typed, meant: meant ?? '' })
      if (meant) return
    }

    attempt(async () => {
      await sendLoginLink(typed)
      // The session arrives through the link, not through this call, so this
      // screen has to say what happens next or it looks like nothing did.
      setSentTo(typed)
    })
  }

  // Only while it is still the address in the field, and only until it is sent:
  // a correction offered under a "link sent" banner is asking about a decision
  // already made.
  const suggestion =
    !sentTo && queried?.meant && queried.typed === normaliseEmail(email) ? queried.meant : undefined

  return (
    <Screen
      footer={
        <Button fullWidth onPress={mailLink} disabled={busy}>
          {t('onboarding:account.sendLink')}
        </Button>
      }
    >
      <View className="items-center gap-3 pt-6 pb-2">
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

      {suggestion ? (
        <Alert
          tone="warning"
          title={t('onboarding:account.didYouMean', { email: suggestion })}
          description={t('onboarding:account.didYouMeanBody', {
            domain: normaliseEmail(email).split('@')[1],
          })}
          action={
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setEmail(suggestion)
                // Marked as answered for the address now in the field, so the
                // next press sends rather than asking about the corrected one.
                setQueried({ typed: suggestion, meant: '' })
              }}
            >
              {t('onboarding:account.useSuggestion')}
            </Button>
          }
        />
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
