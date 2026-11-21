/**
 * The one-time sheets that put a question to the user (the rating ask, the
 * Locations offer) each hold the floor while they are on screen, and neither
 * goes up while another holds it. Two questions stacked read as nagging, and
 * on iOS a second native modal over the first can strand both.
 *
 * Read rather than subscribed: a sheet that finds the floor taken lets its turn
 * pass, and asks again at its next chance.
 */
const holders = new Set<string>()

export function holdFloor(name: string, held: boolean): void {
  if (held) holders.add(name)
  else holders.delete(name)
}

/** Whether a sheet other than `name` is up. */
export function floorTaken(name: string): boolean {
  for (const holder of holders) if (holder !== name) return true
  return false
}
