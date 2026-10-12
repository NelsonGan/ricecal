/**
 * The seam between the app and error tracking (PostHog), shaped like the
 * analytics one: nothing native is imported here, so a data module or a screen
 * can report without dragging the SDK into every test that reaches it.
 * `startup.ts` registers the live reporter; before that, and in development,
 * a report goes to the console instead.
 *
 * Uncaught exceptions, unhandled rejections and native crashes are captured by
 * the SDK on its own. This is for the failures the app catches and still wants
 * to hear about.
 */

/** Short scalar context, filed beside the exception. Never diary values. */
export type ErrorContext = Record<string, string | number | boolean>

export type ErrorReporter = (error: unknown, context: ErrorContext) => void

let reporter: ErrorReporter | null = null

export function registerErrorReporter(next: ErrorReporter | null): void {
  reporter = next
}

/** Something threw and was caught, and somebody should still know. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  if (!reporter) {
    if (__DEV__ && process.env.NODE_ENV !== 'test') console.warn('[error]', error, context)
    return
  }
  try {
    reporter(error, context)
  } catch {
    // Reporting must never be the second failure.
  }
}

/**
 * Nothing threw, but a state was reached that a developer should read about,
 * with a date and a build attached. Sent as an exception at warning level so it
 * groups into an issue like any other.
 */
export function reportMessage(message: string, context: ErrorContext = {}): void {
  reportError(new Error(message), { ...context, $exception_level: 'warning' })
}
