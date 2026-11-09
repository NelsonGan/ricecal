/**
 * The Apple Watch gallery: native captures from the watch simulator, uploaded
 * as they are. A frame and a headline do not fit on a 416 × 496 screen, and
 * Apple shows watch screenshots bare, so there is nothing here to rasterize.
 *
 * English only. App Store Connect shows the primary language's screenshots in
 * any localization that has none of its own, so one set covers every listing.
 */
export const WATCH_DIR = '/assets/screenshots-watch/en';

/** Apple Watch Series 10 and later, 46 mm: the slot `asc` calls WATCH_SERIES_10. */
export const WATCH_WIDTH = 416;
export const WATCH_HEIGHT = 496;

export const WATCH_SCREENS = [
  { id: '01-set', label: 'Set' },
  { id: '02-rest', label: 'Rest' },
  { id: '03-routine', label: 'Routine' },
  { id: '04-exercises', label: 'Exercises' },
  { id: '05-routines', label: 'Routines' },
] as const;

export const watchUrl = (id: string) => `${WATCH_DIR}/${id}.png`;

/**
 * The captures, byte for byte, as base64. Sent as the files are rather than
 * redrawn, and checked for size here so a wrong file is caught before `asc`
 * is asked to take it.
 */
export async function loadWatchScreenshots(): Promise<Array<{ filename: string; data: string }>> {
  return Promise.all(WATCH_SCREENS.map(async ({ id }) => {
    const res = await fetch(watchUrl(id), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not load ${watchUrl(id)}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width !== WATCH_WIDTH || height !== WATCH_HEIGHT) {
      throw new Error(`${id}.png is ${width} × ${height}; the watch slot takes ${WATCH_WIDTH} × ${WATCH_HEIGHT}`);
    }
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { filename: `${id}.png`, data: btoa(binary) };
  }));
}
