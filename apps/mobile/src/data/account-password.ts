import { createClient } from '@supabase/supabase-js'

import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { AuthProblem, asAuthProblem } from './auth'

export async function hasAccountPassword(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_account_password')
  if (error) throw asAuthProblem(error)
  if (typeof data !== 'boolean') throw new AuthProblem('unknown')
  return data
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
    const { data: owner, error: ownerError } = await supabase.auth.getUser()
    if (ownerError) throw ownerError
    if (!owner.user) throw new AuthProblem('unknown')
    if (await hasAccountPassword()) {
      if (!currentPassword || !owner.user.email) throw new AuthProblem('invalid_credentials')
      const verifier = createClient(
        env.EXPO_PUBLIC_SUPABASE_URL,
        env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        },
      )
      try {
        const { data, error } = await verifier.auth.signInWithPassword({
          email: owner.user.email,
          password: currentPassword,
          options: { captchaToken },
        })
        if (error) throw error
        if (data.user?.id !== owner.user.id) throw new AuthProblem('invalid_credentials')
      } finally {
        // Revoke only the verification session, never the user's other devices.
        await verifier.auth.signOut({ scope: 'local' })
      }
    }
    const { data: active, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (active.session?.user.id !== owner.user.id) throw new AuthProblem('unknown')
    const { error } = await supabase.auth.updateUser({
      password,
      ...(currentPassword ? { current_password: currentPassword } : {}),
    })
    if (error) throw error
  } catch (error) {
    throw asAuthProblem(error)
  }
}
