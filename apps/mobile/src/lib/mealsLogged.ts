/**
 * When a meal was last logged on this phone, this run. The avatar on Today
 * tells a meal it should eat from rows the first server answer after launch
 * brings in from other devices (README: The avatar on Today): a first answer
 * that follows a log here carries that meal.
 */
let lastLoggedAt = 0

/** Called beside `recordMealLogged`, where a meal is saved from this phone. */
export function noteMealLoggedHere(now = Date.now()): void {
  lastLoggedAt = now
}

export function mealLoggedHereSince(time: number): boolean {
  return lastLoggedAt >= time
}
