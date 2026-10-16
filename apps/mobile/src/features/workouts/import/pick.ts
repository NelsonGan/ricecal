import { File } from 'expo-file-system'

import { type ParsedExport, parseExport } from './parse'

/** Why a picked file could not be imported, each a `workouts:import.*` message. */
export type ReadError = 'unknown' | 'empty' | 'failed' | 'dates'

/**
 * Opens the file picker and reads a Strong or Hevy export. Null when the
 * person cancels.
 *
 * Opened straight from the settings rows, so the import screen starts on the
 * preview: a screen whose only content was a button to open this was one tap
 * too many.
 */
export async function pickExport(): Promise<
  { parsed: ParsedExport } | { error: ReadError } | null
> {
  try {
    // Every type a CSV turns up as: Android's file providers and anything
    // that passed through Windows label one as Excel's, and a picker
    // filtered to text/csv alone greys the file out.
    const picked = await File.pickFileAsync({
      mimeTypes: [
        'text/csv',
        'text/comma-separated-values',
        'application/csv',
        'application/vnd.ms-excel',
        'text/plain',
      ],
    })
    if (picked.canceled) return null
    const result = parseExport(await picked.result.text())
    if ('error' in result) return { error: result.error }
    if (!result.workouts.length) return { error: result.skippedRows ? 'dates' : 'empty' }
    return { parsed: result }
  } catch (failure) {
    if ((failure as { code?: string }).code === 'ERR_PICKER_CANCELLED') return null
    console.warn('[workouts] import read failed', failure)
    return { error: 'failed' }
  }
}

/**
 * The file read on the settings screen, handed to the import screen it opens.
 * A parsed history is too big for a route parameter.
 */
let handed: ParsedExport | null = null

export function handExport(parsed: ParsedExport): void {
  handed = parsed
}

/** What was handed over, if anything. Read, not taken, so a second render sees it too. */
export function handedExport(): ParsedExport | null {
  return handed
}

export function clearHandedExport(): void {
  handed = null
}
