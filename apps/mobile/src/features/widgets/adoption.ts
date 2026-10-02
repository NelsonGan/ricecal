import type { WidgetKind } from '@modules/ricecal-widgets'
import { createMMKV } from 'react-native-mmkv'
import { setPersonProps, track } from '@/lib/analytics'

/**
 * Which widgets are on this phone, and what changed since anybody last looked.
 *
 * Neither platform announces an install: WidgetKit's `getCurrentConfigurations`
 * and Android's `getAppWidgetIds` both answer "what is there now", and the app is
 * not running when somebody adds one. So adoption is a diff: poll on foreground,
 * compare against what was stored last time, report the difference.
 *
 * MMKV rather than a column, for the reason `theme/preference.ts` gives: this is
 * a fact about the handset, not the account. Signing out does not take a widget
 * off a home screen.
 */
const storage = createMMKV({ id: 'ricecal-widgets' })

const KEY = 'installed'
let profileOwner: string | null = null

export type WidgetDiff = {
  added: WidgetKind[]
  removed: WidgetKind[]
}

/**
 * What changed, in both directions.
 *
 * Exported for its own test rather than inlined, because every interesting case
 * here is a case where the answer should be "nothing": the first poll of a
 * fresh install, two polls in a row, and the same set in a different order.
 */
export function diffWidgets(previous: WidgetKind[], current: WidgetKind[]): WidgetDiff {
  const before = new Set(previous)
  const after = new Set(current)

  return {
    added: current.filter((kind) => !before.has(kind)),
    removed: previous.filter((kind) => !after.has(kind)),
  }
}

/**
 * The set as it was at the last poll, or null before there has ever been one.
 *
 * Null and "none installed" are deliberately different. A fresh install has
 * never looked, so its first poll must not report every widget the user already
 * had as newly added — which is exactly what would happen on a reinstall, where
 * the widgets survive the app being deleted.
 */
function stored(): WidgetKind[] | null {
  const raw = storage.getString(KEY)
  if (raw === undefined) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? (parsed.filter((v) => typeof v === 'string') as WidgetKind[])
      : []
  } catch {
    return []
  }
}

/**
 * Compare, report, remember.
 *
 * Each account gets its first count, then updates when the set changes, including
 * to zero:
 * "used to have widgets and took them all off" is a real answer and leaving the
 * old count in place would file that account under "has three".
 */
export function reportWidgets(current: WidgetKind[], userId?: string): WidgetDiff {
  const previous = stored()
  storage.set(KEY, JSON.stringify(current))
  const owner = userId ?? null

  // The first look on this install. Recorded so the next poll has something to
  // compare against, and counted so the property is right, but not reported as
  // a burst of installs that may have happened months ago.
  if (previous === null) {
    setPersonProps({ widgets_installed: current.length })
    profileOwner = owner
    return { added: [], removed: [] }
  }

  const diff = diffWidgets(previous, current)
  for (const widget of diff.added) track('Widget Added', { widget })
  for (const widget of diff.removed) track('Widget Removed', { widget })
  if (diff.added.length > 0 || diff.removed.length > 0 || profileOwner !== owner) {
    // The baseline belongs to the handset, but each account needs its own count.
    setPersonProps({ widgets_installed: current.length })
    profileOwner = owner
  }

  return diff
}

/**
 * Forget the last poll, so the next one counts as the first.
 *
 * A test hook, and only that. It is deliberately NOT called on sign-out: the
 * widgets belong to the phone rather than to whoever is signed in, and clearing
 * this would make the next account's first poll silent about a set that has not
 * changed at all.
 */
export function forgetWidgetsForTest(): void {
  storage.remove(KEY)
  profileOwner = null
}
