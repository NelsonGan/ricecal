import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { useSession, useSettings, useUpdateSettings } from '@/data'
import { currentLanguage, type Language } from '@/i18n'

/**
 * Renderless. Copies the chosen language into `user_settings.language`, one
 * direction only. `src/i18n/preference.ts` is the owner: MMKV, read
 * synchronously before the first frame, and the only store that exists during
 * onboarding. The row is a copy the server can read, for the language an email
 * or a model prompt should come back in.
 *
 * Reading the row back would undo the setting: a phone switched to Thai would
 * flip to whatever the row said the moment the query resolved. The two can
 * disagree while a write is in flight, because only one is ever consulted.
 *
 * A component rather than a hook in the layout body, for the reason
 * `EntitlementSync` is one: a hook there would sit above `SessionProvider`.
 */
export function LanguageSync() {
  const { userId } = useSession()

  // Split in two because `useSettings` reads `useUserId`, which throws without
  // a session rather than returning null. There is nothing to sync before
  // sign-in anyway: the flush writes the account, and this catches the row up
  // on the render after it exists.
  return userId ? <Sync /> : null
}

function Sync() {
  // Subscribes this component to `languageChanged`, which is what makes
  // `currentLanguage()` below re-read after the picker or the settings card
  // switches. The `t` is unused; the re-render is the point.
  useTranslation()

  const { data: settings } = useSettings()
  const { mutate } = useUpdateSettings()
  const language = currentLanguage()

  /**
   * What was last sent, so a rejected write is not sent again on the next
   * render.
   *
   * `useUpdateSettings` rolls the cache back when the server refuses, which
   * puts `settings.language` back to the old value and would make the condition
   * below true again, forever. Offline is not this case — the mutation is
   * paused rather than failed and resumes by itself — so what this guards is a
   * genuine refusal, and the right response to one is to stop and try again
   * next launch rather than to hammer PostgREST from a mounted component.
   */
  const sent = useRef<Language | null>(null)

  useEffect(() => {
    if (!settings || settings.language === language || sent.current === language) return
    sent.current = language
    mutate({ language })
  }, [settings, language, mutate])

  return null
}
