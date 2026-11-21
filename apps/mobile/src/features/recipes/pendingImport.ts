import { useRouter } from 'expo-router'
import { useEffect } from 'react'

/**
 * A video link that arrived before there was anybody signed in to import it
 * for: the share sheet opens `/recipe/import?url=…` whether or not the app has
 * a session, and the recipe routes send a signed-out visitor to the welcome
 * screen. Held here, in memory, until the tabs mount behind a session, which
 * then opens the import. Memory rather than storage, because a link shared
 * yesterday and resumed after tomorrow's sign-in is a surprise, not a feature.
 */
let pending: string | null = null

export function holdPendingImport(url: string) {
  pending = url
}

/** Opens the held import once, from the first screen that has a session. */
export function usePendingImport() {
  const router = useRouter()
  useEffect(() => {
    const url = pending
    if (!url) return
    pending = null
    router.push({ pathname: '/recipe/import', params: { url } })
  }, [router])
}
