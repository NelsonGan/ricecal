/**
 * A drag-to-reorder list's slots with `key` moved to `to`, and everything
 * between its old slot and the new one shifted a place towards where it came
 * from. On either thread: a drag runs it on the UI thread, a screen reader's
 * adjust on the JS one. Shared by the workout's reorder sheet and a group's
 * member list, so the two cannot disagree about where a row lands.
 */
export function reslot(slots: Record<string, number>, key: string, to: number) {
  'worklet'
  const at = slots[key]
  if (at === undefined || to === at) return slots
  const next: Record<string, number> = {}
  for (const other in slots) {
    const slot = slots[other]
    if (other === key) next[other] = to
    else if (at < to && slot > at && slot <= to) next[other] = slot - 1
    else if (at > to && slot < at && slot >= to) next[other] = slot + 1
    else next[other] = slot
  }
  return next
}
