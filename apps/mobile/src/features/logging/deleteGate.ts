/**
 * Lets one diary delete own its lookup and confirmation at a time.
 *
 * A rejected request resolves false so its swipe row closes again instead of
 * replacing the resolver held by the first row.
 */
export function createDeleteGate() {
  let pending = false
  return async (request: () => Promise<boolean>): Promise<boolean> => {
    if (pending) return false
    pending = true
    try {
      return await request()
    } finally {
      pending = false
    }
  }
}
