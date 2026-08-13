import { format, getISOWeek, parseISO } from 'date-fns'

// From the type module rather than from `@/data`, which is a barrel over the
// whole data layer: importing it here drags expo-notifications into a file that
// does date arithmetic, and the unit test for that arithmetic cannot load a
// native module. Same reason `features/logging/week.ts` reaches past the barrel.
import { REVIEW_KINDS, type ReviewKind, type ReviewSummary } from '@/data/types'

/**
 * A period as a route segment: `week-2026-08-03`.
 *
 * The kind travels with the date because the date alone cannot carry it — the
 * third of August is a Monday and the first day of a month is a Saturday, and a
 * story that guessed would open the wrong review roughly one week in seven.
 *
 * `start` may be `LATEST` instead of a date; see below.
 */
export function reviewId(kind: ReviewKind, start: string): string {
  return `${kind}-${start}`
}

/**
 * The newest period of its kind, whichever that turns out to be.
 *
 * What a report notification links to. One is scheduled weeks ahead of the
 * Monday it fires on and cannot name the week it will be about, so the link
 * says "the latest weekly review" and the screen resolves it against the list
 * when it opens.
 */
export const LATEST = 'latest'

const ID = /^(week|month)-(\d{4}-\d{2}-\d{2}|latest)$/

/**
 * The other direction, for a route param.
 *
 * Validated rather than split, because this is the one value in the flow that
 * arrives from outside the app: a deep link, or a link somebody edited. An
 * unparseable id has to become a screen that says so, not a request for the
 * review of `NaN`.
 */
export function parseReviewId(id: string | undefined): { kind: ReviewKind; start: string } | null {
  const match = ID.exec(id ?? '')
  if (!match) return null
  const kind = match[1] as ReviewKind
  return REVIEW_KINDS.includes(kind) ? { kind, start: match[2] } : null
}

/**
 * What a period is called: "3 to 9 August", "27 July to 2 August", "July 2026".
 *
 * A week that stays inside one month names it once, which is how somebody says
 * it out loud. One that crosses a boundary has to name both, and that is the
 * only reason this is three cases rather than one format string.
 */
export function periodTitle(kind: ReviewKind, start: string, end: string): string {
  if (kind === 'month') return format(parseISO(start), 'LLLL yyyy')

  const from = parseISO(start)
  const to = parseISO(end)
  if (from.getMonth() === to.getMonth()) {
    return `${format(from, 'd')} to ${format(to, 'd LLLL')}`
  }
  return `${format(from, 'd LLLL')} to ${format(to, 'd LLLL')}`
}

/** The short form, for the counter beside a story's title bar. */
export function periodShortTitle(kind: ReviewKind, start: string, end: string): string {
  if (kind === 'month') return format(parseISO(start), 'LLLL')
  return periodTitle(kind, start, end)
}

/** Which week of the year it was. The line under a weekly row's name. */
export function weekOfYear(start: string): number {
  return getISOWeek(parseISO(start))
}

/**
 * The steps a story actually has, in order.
 *
 * Not a constant list, and that is the whole of the "design for what the data
 * has" rule in one function. A review of a month before the watch arrived has
 * no movement and may have no weigh-ins, and a fourth step drawn from nothing
 * is worse than three steps: the progress bar promises something the tap does
 * not deliver.
 *
 * The first three always hold. A period only reaches a story at all if it
 * qualifies, which means days with food in them, which means there is a card,
 * a dish list and a calorie chart to draw.
 */
export type ReviewStep = 'card' | 'food' | 'calories' | 'body'

export function reviewSteps(summary: ReviewSummary | null, meals: number): ReviewStep[] {
  if (!summary) return []

  const steps: ReviewStep[] = ['card']
  if (meals > 0) steps.push('food')
  steps.push('calories')
  // Either a scale or a watch is enough for a body step; neither is not.
  if (summary.weighIns > 0 || summary.activeDays > 0) steps.push('body')
  return steps
}

/**
 * How much of the period was under budget, as a fraction, for the bar on the
 * calorie step.
 *
 * Guarded rather than divided, because a period with a budget and nothing
 * logged divides by zero and a progress bar of `NaN` renders as full.
 */
export function underGoalShare(summary: ReviewSummary): number {
  return summary.daysLogged > 0 ? summary.daysUnderGoal / summary.daysLogged : 0
}
