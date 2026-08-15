/**
 * Everything the password, code and reset screens say.
 *
 * A namespace of its own rather than more of `onboarding.account`, because
 * these screens serve two flows that have nothing to do with each other: the
 * last step of onboarding, and a returning user who has forgotten a password
 * three months later. `onboarding.account` keeps the copy that is genuinely
 * about arriving; this is about credentials.
 *
 * No long dashes anywhere in here. See the conventions note in CLAUDE.md.
 */
export const auth = {
  /** The three ways in, on the screen that offers them. */
  choose: {
    email: 'Continue with email',
    /** Under the three buttons. Says what a password is FOR, not that it exists. */
    explainer: 'Use a password, or have us email you a code. Your choice.',
  },

  password: {
    signUpTitle: 'Choose a password',
    signUpSubtitle: 'For {{email}}. You will use this to sign back in.',
    signInTitle: 'Enter your password',
    signInSubtitle: 'Signing in as {{email}}.',

    field: 'PASSWORD',
    confirmField: 'CONFIRM PASSWORD',
    placeholder: 'At least 8 characters',
    show: 'Show password',
    hide: 'Hide password',

    createAccount: 'Create account',
    signIn: 'Sign in',
    forgot: 'Forgot your password?',

    /**
     * The alternative, offered on both sides of the screen. It is what makes a
     * password optional rather than a wall: somebody who never set one, or who
     * cannot remember whether they did, has a way in that always works.
     */
    codeInstead: 'Email me a code instead',

    /** Switches between the two halves without going back a screen. */
    haveAccount: 'Already have an account? Sign in',
    needAccount: 'New here? Create an account',

    /**
     * Shown when the address already has an account, and it does NOT say so.
     * Supabase deliberately answers a repeat signup as though it worked, so
     * that a signup form cannot be used to find out who has this app. Saying it
     * out loud here would give away exactly what the server declined to. Both
     * offers below are safe to make to a stranger and both get the real owner
     * where they were going.
     */
    maybeExisting:
      'If there is already an account at this address, sign in below or ask for a code.',
  },

  verify: {
    /** The heading changes with what the code is for; the screen does not. */
    signUpTitle: 'Check your email',
    signInTitle: 'Check your email',
    sentTo: 'We sent a 6 digit code to {{email}}. It is in the subject line too.',

    field: 'CODE',
    placeholder: '000000',
    submit: 'Continue',

    resend: 'Send it again',
    /** While the server would refuse a second mail. Counts down. */
    resendIn: 'Send it again in {{seconds}}s',
    resent: 'Sent. Check your email again.',

    /** Under everything, for the person who typed the address wrong. */
    wrongEmail: 'Wrong address? Go back and change it.',
  },

  reset: {
    newTitle: 'Choose a new password',
    newSubtitle: 'Nearly there. Pick something you will remember.',
    field: 'NEW PASSWORD',
    confirmField: 'CONFIRM NEW PASSWORD',
    save: 'Save and sign in',
    done: 'Password changed. You are signed in.',
  },

  /** The Turnstile panel, on the rare occasion Cloudflare asks for a person. */
  captcha: {
    title: 'One quick check',
    body: 'Cloudflare wants to confirm you are a person. It only takes a second.',
  },

  errors: {
    /** Local, before anything is sent. */
    passwordShort: 'Use at least 8 characters.',
    /** Signing in, where the only rule is that there has to be one. */
    passwordRequired: 'Enter your password.',
    passwordMismatch: 'The two passwords do not match.',
    codeLength: 'The code is 6 digits.',

    /** The `AuthProblem` reasons, one sentence each. */
    invalid_credentials: 'That email and password do not match. Try again, or ask for a code.',
    email_not_confirmed: 'Confirm your email address first. We have sent you a new code.',
    /**
     * A FALLBACK THAT STILL SAYS NOTHING. The password screen catches this
     * reason and switches itself to sign-in rather than showing a message, so
     * this line should never be read — and if some future call site does read
     * it, it must not give away what Supabase deliberately withheld.
     */
    account_exists: 'Try signing in at this address, or ask us to email you a code.',
    code_invalid: 'That code is wrong or has expired. Ask for a new one.',
    weak_password: 'That password is too easy to guess. Try a longer one.',
    same_password: 'That is the password you already have. Pick a different one.',
    rate_limited: 'Wait a moment before asking for another email.',
    /** Same, but we know how long. */
    rate_limited_in: 'Wait {{seconds}} seconds before asking for another email.',
    captcha: 'We could not confirm you are a person. Close the app and try again.',
    offline: 'No connection. Try again when you are back online.',
    unknown: 'Something went wrong. Try again.',
  },
} as const
