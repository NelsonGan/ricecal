import { Directory, File, Paths } from 'expo-file-system'

/**
 * Photos of meals waiting for a connection.
 *
 * The camera and the picker hand back a file in the cache directory, which the
 * OS may empty while the app is not running. That is fine for a scan that
 * uploads it a second later and wrong for one that waits for a connection: a
 * queued meal whose photo was reclaimed is a meal that cannot be sent. So a
 * queued photo is copied into the documents directory, which is kept, and
 * deleted once its row is done.
 */
const FOLDER = 'queued-snaps'

function folder(): Directory {
  return new Directory(Paths.document, FOLDER)
}

/**
 * A copy of `uri` that survives the app being closed, or `uri` itself when the
 * copy cannot be made. Never throws: a queued meal with a photo that might be
 * reclaimed still beats one that was not queued at all.
 */
export async function keepQueuedPhoto(id: string, uri: string): Promise<string> {
  if (isQueuedPhoto(uri)) return uri
  try {
    const dir = folder()
    dir.create({ idempotent: true, intermediates: true })
    const kept = new File(dir, `${id.replace(/[^\w-]/g, '')}.jpg`)
    if (kept.exists) kept.delete()
    await new File(uri).copy(kept)
    return kept.uri
  } catch (error) {
    console.warn('[snap] could not keep the queued photo', error)
    return uri
  }
}

/** Whether `uri` is one of the copies `keepQueuedPhoto` made. */
function isQueuedPhoto(uri: string): boolean {
  return uri.includes(`/${FOLDER}/`)
}

function fileName(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

/**
 * Where a kept photo is now. The stored uri names the app's container, and
 * iOS can move the container when the app updates, so a meal queued before an
 * update would point at nothing. Only the file name is trusted; the folder is
 * asked again. Anything that is not a kept copy comes back as it was.
 */
export function queuedPhotoUri(uri: string): string
export function queuedPhotoUri(uri: string | undefined): string | undefined
export function queuedPhotoUri(uri: string | undefined): string | undefined {
  if (!uri || !isQueuedPhoto(uri)) return uri
  try {
    return new File(folder(), fileName(uri)).uri
  } catch {
    return uri
  }
}

/** Deletes a copy `keepQueuedPhoto` made. Anything else is left alone. */
export function dropQueuedPhoto(uri: string): void {
  if (!isQueuedPhoto(uri)) return
  try {
    const file = new File(queuedPhotoUri(uri))
    if (file.exists) file.delete()
  } catch {
    // A file that will not delete is a few hundred kilobytes, not a meal.
  }
}

/**
 * Deletes every kept copy no row still uses. A row can go without its copy
 * going with it: aged out of storage at launch, or removed while its photo
 * was still being copied. Documents is never emptied by the OS, so this is
 * the only thing that ever would.
 */
export function sweepQueuedPhotos(inUse: readonly (string | undefined)[]): void {
  try {
    const dir = folder()
    if (!dir.exists) return
    const keep = new Set(
      inUse.filter((uri) => uri && isQueuedPhoto(uri)).map((uri) => fileName(uri as string)),
    )
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.has(fileName(entry.uri))) entry.delete()
    }
  } catch {
    // As above.
  }
}

/** Every copy at once, for a sign-out. */
export function dropQueuedPhotos(): void {
  try {
    const dir = folder()
    if (dir.exists) dir.delete()
  } catch {
    // As above.
  }
}
