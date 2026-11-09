import { toPng, toJpeg } from 'html-to-image';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import photoProvenance from '../../public/assets/screenshots-iphone/photo-provenance.json';
import artworkProvenance from '../../public/assets/app-store/artwork-provenance.json';
import foodCameraProvenance from '../../public/assets/app-store/food-camera/catalog.json';
import { APP_STORE_ASSETS, type AppStorePlacement } from '../data/appStoreAssets';
import watchCaptures from '../../public/assets/screenshots-watch/capture.json';
import { loadWatchScreenshots } from '../data/watchScreens';

/**
 * 6.9" iPhone — the size App Store Connect now asks for, and the one the
 * source screenshots were taken at (1320 × 2868, same aspect). Apple files
 * both 6.7" and 6.9" under the APP_IPHONE_67 display type.
 */
const EXPORT_WIDTH = 1290;
const EXPORT_HEIGHT = 2796;
/**
 * iPhone Duo open on its side, the size its inner display captures at turned
 * upright. App Store Connect files it as APP_IPHONE_DUO.
 */
const DUO_EXPORT_WIDTH = 2853;
const DUO_EXPORT_HEIGHT = 2007;
/** 12.9"/13" iPad Pro, landscape. */
const IPAD_EXPORT_WIDTH = 2732;
const IPAD_EXPORT_HEIGHT = 2048;
/** Google Play feature graphic. */
const FEATURE_EXPORT_WIDTH = 1024;
const FEATURE_EXPORT_HEIGHT = 500;
/** Square card for the website and social. */
const LANDING_EXPORT_WIDTH = 1200;
const LANDING_EXPORT_HEIGHT = 1200;

export type DeviceType = 'phone' | 'duo' | 'ipad' | 'feature' | 'landing';
/** Creative assets export separately and never enter the screenshot uploader. */
export type ExportDevice = DeviceType | AppStorePlacement;
export const isAppStoreCreative = (device: string): device is AppStorePlacement =>
  device === 'header' || device === 'search';
export const extensionFor = (device: ExportDevice) => device === 'search' ? 'mp4' : device === 'header' ? 'jpg' : 'png';

export function dimsFor(device: ExportDevice) {
  if (isAppStoreCreative(device)) {
    const { width, height } = APP_STORE_ASSETS[device];
    return { width, height };
  }
  if (device === 'duo') return { width: DUO_EXPORT_WIDTH, height: DUO_EXPORT_HEIGHT };
  if (device === 'ipad') return { width: IPAD_EXPORT_WIDTH, height: IPAD_EXPORT_HEIGHT };
  if (device === 'feature') return { width: FEATURE_EXPORT_WIDTH, height: FEATURE_EXPORT_HEIGHT };
  if (device === 'landing') return { width: LANDING_EXPORT_WIDTH, height: LANDING_EXPORT_HEIGHT };
  return { width: EXPORT_WIDTH, height: EXPORT_HEIGHT };
}

/** Refuse incomplete assets instead of exporting an empty frame. */
export async function captureScene(element: HTMLElement, device: ExportDevice): Promise<string> {
  if (!element.isConnected) throw new Error('The screenshot view changed during export.');
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll('img'), async (image) => {
    try {
      await image.decode();
    } catch {
      throw new Error(`Could not load a screenshot image: ${image.getAttribute('src')}`);
    }
  }));
  if (!element.isConnected) throw new Error('The screenshot view changed during export.');
  const options = {
    ...dimsFor(device),
    pixelRatio: 1,
    cacheBust: true,
    style: { transform: 'none' },
  };
  // Freeze the camera at a consistent, readable scan frame while rasterizing.
  const previousCapture = element.getAttribute('data-capture-still');
  element.setAttribute('data-capture-still', 'true');
  try {
    // JPEG has no alpha channel; Apple disallows alpha even in an opaque PNG.
    return await (isAppStoreCreative(device)
      ? toJpeg(element, { ...options, quality: 0.96, backgroundColor: element.style.backgroundColor || '#F6F8F7' })
      : toPng(element, options));
  } finally {
    if (previousCapture === null) element.removeAttribute('data-capture-still');
    else element.setAttribute('data-capture-still', previousCapture);
  }
}

/** One encoder for Search downloads and App Store uploads. */
export async function captureCreativeMedia(element: HTMLElement, placement: AppStorePlacement): Promise<string> {
  if (placement === 'header') return captureScene(element, placement);
  const viewport = element.querySelector<HTMLElement>('[data-camera-viewport]');
  const beam = element.querySelector<HTMLElement>('[data-camera-scanline]');
  const locale = element.querySelector<HTMLElement>('[data-search-locale]')?.dataset.searchLocale;
  if (!viewport || !beam || !locale) throw new Error('The localized food camera is not ready.');
  // Wait for layout fitting after a locale change before measuring the export geometry.
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const canvas = element.getBoundingClientRect();
  const camera = viewport.getBoundingClientRect();
  const scanline = beam.getBoundingClientRect();
  const ratio = APP_STORE_ASSETS.search.width / canvas.width;
  const geometry = {
    x: (camera.left - canvas.left) * ratio, y: (camera.top - canvas.top) * ratio,
    width: camera.width * ratio, height: camera.height * ratio,
    beamX: (scanline.left - canvas.left) * ratio,
    beamWidth: scanline.width * ratio, beamHeight: scanline.height * ratio,
  };
  const previous = element.getAttribute('data-capture-video');
  element.setAttribute('data-capture-video', 'true');
  let frame: string;
  try { frame = await captureScene(element, 'search'); }
  finally {
    if (previous === null) element.removeAttribute('data-capture-video');
    else element.setAttribute('data-capture-video', previous);
  }
  const response = await fetch('/api/creatives/search-video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale, data: frame.split(',')[1], geometry }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error ?? 'Could not render the Search video.');
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the Search video.'));
    reader.readAsDataURL(blob);
  });
}

async function captureExport(element: HTMLElement, device: ExportDevice) {
  return isAppStoreCreative(device) ? captureCreativeMedia(element, device) : captureScene(element, device);
}

export async function exportSingleScreenshot(
  element: HTMLElement,
  filename: string,
  device: ExportDevice = 'phone',
): Promise<void> {
  const dataUrl = await captureExport(element, device);
  const link = document.createElement('a');
  link.download = `${filename}.${extensionFor(device)}`;
  link.href = dataUrl;
  link.click();
}

export async function exportAllScreenshots(
  elements: Map<string, HTMLElement>,
  locale: string,
  device: ExportDevice = 'phone',
): Promise<void> {
  if (!elements.size) throw new Error('There are no screenshots to export.');
  const zip = new JSZip();
  const folderName = isAppStoreCreative(device)
    ? `ricecal-app-store-${device}-${locale}`
    : device === 'ipad' || device === 'duo'
    ? `ricecal-screenshots-${device}-${locale}`
    : `ricecal-screenshots-${locale}`;
  const folder = zip.folder(folderName)!;
  folder.file('photo-provenance.json', JSON.stringify(photoProvenance, null, 2));
  if (isAppStoreCreative(device)) folder.file('artwork-provenance.json', JSON.stringify(artworkProvenance, null, 2));
  if (device === 'search') folder.file('food-camera-provenance.json', JSON.stringify(foodCameraProvenance, null, 2));

  for (const [name, element] of elements) {
    const dataUrl = await captureExport(element, device);
    folder.file(`${name}.${extensionFor(device)}`, dataUrl.split(',')[1], { base64: true });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${folderName}.zip`);
}

/**
 * The Apple Watch captures as they are, with their capture record. One folder,
 * `en`, the shape `npm run upload:ios -- --device watch` reads.
 */
export async function exportWatchScreenshots(): Promise<void> {
  const shots = await loadWatchScreenshots();
  const zip = new JSZip();
  const root = 'ricecal-watch-all';
  zip.file(`${root}/capture.json`, JSON.stringify(watchCaptures, null, 2));
  const folder = zip.folder(`${root}/en`)!;
  for (const shot of shots) folder.file(shot.filename, shot.data, { base64: true });
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${root}.zip`);
}

/**
 * Export every locale into one zip, a folder per locale.
 * `prepareLocale` must switch the app to the locale, wait for the scenes to
 * render, and return the elements to capture keyed by file name (no extension).
 */
export async function exportAllLocalesScreenshots(
  locales: string[],
  device: ExportDevice,
  prepareLocale: (locale: string) => Promise<Map<string, HTMLElement>>,
): Promise<void> {
  if (!locales.length) throw new Error('There are no languages to export.');
  const zip = new JSZip();
  const root = device === 'phone'
    ? 'ricecal-screenshots-all'
    : `ricecal-${device}-all`;
  zip.file(`${root}/photo-provenance.json`, JSON.stringify(photoProvenance, null, 2));
  if (isAppStoreCreative(device)) zip.file(`${root}/artwork-provenance.json`, JSON.stringify(artworkProvenance, null, 2));
  if (device === 'search') zip.file(`${root}/food-camera-provenance.json`, JSON.stringify(foodCameraProvenance, null, 2));

  for (const locale of locales) {
    const elements = await prepareLocale(locale);
    if (!elements.size) throw new Error(`There are no screenshots for ${locale}.`);
    const folder = zip.folder(`${root}/${locale}`)!;
    for (const [name, element] of elements) {
      const dataUrl = await captureExport(element, device);
      folder.file(`${name}.${extensionFor(device)}`, dataUrl.split(',')[1], { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `${root}.zip`);
}

export {
  EXPORT_WIDTH, EXPORT_HEIGHT,
  DUO_EXPORT_WIDTH, DUO_EXPORT_HEIGHT,
  IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT,
  FEATURE_EXPORT_WIDTH, FEATURE_EXPORT_HEIGHT,
  LANDING_EXPORT_WIDTH, LANDING_EXPORT_HEIGHT,
};
