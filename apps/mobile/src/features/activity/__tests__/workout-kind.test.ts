import { showsDistance, showsPace, showsSpeed } from '../workoutKind'

/**
 * Which figures a workout kind is allowed to show.
 *
 * All three read the same `distance_m`, and the point of the rules is that the
 * column being present in the database does not make it meaningful: a watch
 * records a few hundred metres of shuffling for a badminton game, and every
 * figure derived from that number inherits its meaninglessness.
 */
describe('what a workout kind may show', () => {
  it('shows a distance only for the kinds that travel', () => {
    expect(showsDistance('run')).toBe(true)
    expect(showsDistance('cycle')).toBe(true)
    expect(showsDistance('swim')).toBe(true)

    expect(showsDistance('badminton')).toBe(false)
    expect(showsDistance('basketball')).toBe(false)
    expect(showsDistance('strength')).toBe(false)
  })

  it('reads on-foot kinds in pace and the rest in speed', () => {
    expect(showsPace('run')).toBe(true)
    expect(showsSpeed('run')).toBe(false)

    expect(showsPace('cycle')).toBe(false)
    expect(showsSpeed('cycle')).toBe(true)
  })

  /**
   * THE REGRESSION.
   *
   * `showsSpeed` was `!showsPace(kind)` at the call site, which is true of every
   * court sport — so the detail screen divided the shuffling distance by the
   * duration and printed "PACE 2.0 km/h" over a 53-minute basketball game. A
   * speed is a distance divided by a time; if the distance is suppressed, so is
   * everything computed from it.
   */
  it('never derives a speed from a distance it refuses to show', () => {
    for (const kind of ['badminton', 'basketball', 'strength', 'yoga', 'gym', 'other']) {
      expect(showsDistance(kind)).toBe(false)
      expect(showsSpeed(kind)).toBe(false)
    }
  })

  /** An unmapped type falls back to `other`, which travels nowhere. */
  it('shows nothing for a kind nobody has mapped', () => {
    expect(showsDistance('kabaddi')).toBe(false)
    expect(showsPace('kabaddi')).toBe(false)
    expect(showsSpeed('kabaddi')).toBe(false)
  })
})
