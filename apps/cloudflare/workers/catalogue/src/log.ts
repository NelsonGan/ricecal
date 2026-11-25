/**
 * What a caught error says, as text, for a log line.
 *
 * A D1 error's stack holds only its frames, and Workers Logs prints an error
 * object by its stack, so a line of the error alone said where a query failed
 * and never why (2026-11-25: nine 500s logged as "at
 * D1DatabaseSessionAlwaysPrimary._sendOrThrow"). The message, and the cause's
 * when there is one, go in as a string beside it.
 */
export function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  // D1's cause usually repeats the message ("no such table: …"), so only a
  // cause that adds something is written out.
  const said = error.cause instanceof Error ? error.cause.message : ''
  const cause = said && !error.message.includes(said) ? ` (cause: ${said})` : ''
  return `${error.name}: ${error.message}${cause}`
}
