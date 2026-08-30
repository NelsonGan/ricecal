import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { asAuthProblem } from '@/data/auth'

/**
 * Turns whatever an auth call threw into one sentence a person can act on.
 *
 * Every screen in `(auth)` uses this and none reads a Supabase message directly.
 * Those messages are written for a server log ("Invalid login credentials", "For
 * security purposes, you can only request this after 47 seconds") and were being
 * shown verbatim. That was survivable while the only failure was a stale link;
 * with passwords, codes, resends and a send limit in the way it is not.
 *
 * The reason-to-copy mapping lives in `auth.errors`, so the taxonomy is in
 * `data/auth.ts` and the wording is with the rest of the wording.
 */
export function useAuthMessage(): (error: unknown) => string {
  const { t } = useTranslation('auth')

  return useCallback(
    (error: unknown) => {
      const problem = asAuthProblem(error)

      // The one reason with a number in it. Without the seconds the sentence
      // has to say "wait a moment", which is the advice somebody has already
      // taken by the time they read it.
      if (problem.reason === 'rate_limited' && problem.retryAfter) {
        return t('errors.rate_limited_in', { seconds: problem.retryAfter })
      }

      return t(`errors.${problem.reason}`)
    },
    [t],
  )
}
