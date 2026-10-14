import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { AuthProblem, asAuthProblem, sendPasswordReset } from './auth'

/**
 * Whether the account has a stored password, which is not the same as whether
 * its owner knows one: Supabase gives an account made from an email code a
 * random password of its own. That is why the change form offers a reset code
 * beside the current-password field.
 */
export async function hasAccountPassword(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_account_password')
  if (error) throw asAuthProblem(error)
  if (typeof data !== 'boolean') throw new AuthProblem('unknown')
  return data
}

/** A client of its own, for proving something without replacing the app's
 * session or emitting its navigation events. Nothing it signs in is kept. */
function isolatedClient() {
  return createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** The signed-in account, with the address a proof is checked against. */
async function signedInOwner() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new AuthProblem('unknown')
  return data.user
}

/**
 * Sets the new password on the app's own session, once the caller has proved
 * who they are. On this session rather than the one that proved it, because a
 * password change signs out every session but the one making it, and the app's
 * is the one that has to survive.
 */
async function updateOwnPassword(ownerId: string, password: string, currentPassword?: string) {
  const { data: active, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (active.session?.user.id !== ownerId) throw new AuthProblem('unknown')
  const { error } = await supabase.auth.updateUser({
    password,
    ...(currentPassword ? { current_password: currentPassword } : {}),
  })
  if (error) throw error
}

/** Verify in an isolated session: signing in on the app client replaces its
 * session and emits navigation events. The global current-password requirement
 * stays off because released apps do not send that field. */
export async function changeAccountPassword(
  password: string,
  currentPassword?: string,
  captchaToken?: string,
): Promise<void> {
  try {
    const owner = await signedInOwner()
    if (await hasAccountPassword()) {
      if (!currentPassword || !owner.email) throw new AuthProblem('invalid_credentials')
      const verifier = isolatedClient()
      try {
        const { data, error } = await verifier.auth.signInWithPassword({
          email: owner.email,
          password: currentPassword,
          options: { captchaToken },
        })
        if (error) throw error
        if (data.user?.id !== owner.id) throw new AuthProblem('invalid_credentials')
      } finally {
        // Revoke only the verification session, never the user's other devices.
        await verifier.auth.signOut({ scope: 'local' })
      }
    }
    await updateOwnPassword(owner.id, password, currentPassword)
  } catch (error) {
    throw asAuthProblem(error)
  }
}

/**
 * Mails the signed-in account a password reset code, for an owner who does not
 * know the current password. Usually because there never was one they chose:
 * an account made from an email code has a random password Supabase set.
 *
 * The address is the account's own rather than one typed in, so this can only
 * ever send to the inbox that already proves ownership.
 */
export async function sendAccountPasswordCode(captchaToken?: string): Promise<string> {
  try {
    const owner = await signedInOwner()
    if (!owner.email) throw new AuthProblem('unknown')
    await sendPasswordReset(owner.email, captchaToken)
    return owner.email
  } catch (error) {
    throw asAuthProblem(error)
  }
}

/**
 * Sets a new password using a reset code in place of the current password.
 *
 * The code is spent on an isolated client, for the same reason the current
 * password is checked on one: verifying it signs that client in, and on the app
 * client the new session would replace this one. The account it signs in must
 * be this account. A code mailed to someone else cannot change this password.
 */
export async function resetAccountPassword(password: string, code: string): Promise<void> {
  try {
    const owner = await signedInOwner()
    if (!owner.email) throw new AuthProblem('unknown')
    const verifier = isolatedClient()
    try {
      const { data, error } = await verifier.auth.verifyOtp({
        email: owner.email,
        // Pasted codes bring the clipboard's spaces with them.
        token: code.replace(/\s/g, ''),
        type: 'recovery',
      })
      if (error) throw error
      if (data.user?.id !== owner.id) throw new AuthProblem('code_invalid')
    } finally {
      await verifier.auth.signOut({ scope: 'local' })
    }
    await updateOwnPassword(owner.id, password)
  } catch (error) {
    throw asAuthProblem(error)
  }
}
