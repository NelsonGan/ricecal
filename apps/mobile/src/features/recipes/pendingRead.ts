/**
 * One-shot handoff from the Recipes tab's Photo or Describe sheet into
 * `/recipe/edit`.
 *
 * Kept in memory rather than in URL params: a spoken recipe can run to a
 * thousand characters with newlines and punctuation, and neither that text nor
 * a local `file://` path belongs in a navigation URL or screen-view log.
 */
export type PendingRecipeRead = { kind: 'photo'; uri: string } | { kind: 'text'; text: string }

let pending: PendingRecipeRead | null = null

/** Stage a captured photo or typed description for `/recipe/edit` to read. */
export function stageRecipeRead(input: PendingRecipeRead) {
  pending = input
}

/**
 * Inspect the staged input without clearing it yet, so React's StrictMode
 * double-init on mount reads the same value twice and the effect clears it once
 * the request actually starts.
 */
export function peekRecipeRead(): PendingRecipeRead | null {
  return pending
}

/** Clear the staged input, optionally only if it still matches what was read. */
export function clearRecipeRead(expected?: PendingRecipeRead) {
  if (!expected || pending === expected) pending = null
}
