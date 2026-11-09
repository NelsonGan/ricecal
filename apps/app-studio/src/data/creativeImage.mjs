import { CreativeUploadError } from './creativeError.mjs';
import { IOS_LOCALE_MAP } from './storeLocales.mjs';
const SPECS = { header: { width: 3840, height: 1646, label: 'Header' }, search: { width: 3840, height: 2560, label: 'Search Results' } };

/** Check the actual JPEG, including size and three color components, before writes. */
export function validateCreativeImage(placement, locale, data, allowExportLocale = false) {
  const spec = Object.hasOwn(SPECS, placement) ? SPECS[placement] : null;
  if (!spec) throw new CreativeUploadError('Choose Header or Search Results.', 400);
  if (!Object.hasOwn(IOS_LOCALE_MAP, locale) && !(allowExportLocale && locale === 'fil')) {
    throw new CreativeUploadError('This language has no App Store Connect localization.', 400);
  }
  if (typeof data !== 'string' || !data.length || data.length > 16 * 1024 * 1024
    || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new CreativeUploadError('The creative must be a complete base64 JPEG under 12 MB.', 400);
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8
    || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) {
    throw new CreativeUploadError('The creative must be an opaque JPEG.', 400);
  }
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const components = bytes[offset + 7];
      if (width !== spec.width || height !== spec.height || components !== 3) {
        throw new CreativeUploadError(`${spec.label} requires a ${spec.width} × ${spec.height} RGB JPEG.`, 400);
      }
      return bytes;
    }
    offset += length;
  }
  throw new CreativeUploadError('Could not read the creative JPEG dimensions.', 400);
}
