/** Header images and animated Search videos use Asset Library placements. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { CreativeUploadError } from './creativeError.mjs';
import { validateCreativeImage } from './creativeImage.mjs';
import { validateCreativeVideo } from './creativeVideo.mjs';
export { CreativeUploadError } from './creativeError.mjs';
import {
  run, runJson, briefError, iosReady, iosVersion, iosLocalizationId,
} from './storeUpload.mjs';
import { IOS_LOCALE_MAP } from './storeLocales.mjs';

export const CREATIVE_UPLOAD_SPECS = {
  header: { width: 3840, height: 1646, type: 'PRODUCT_PAGE_HEADER_ASSET', label: 'Header' },
  search: { width: 3840, height: 2560, type: 'APP_STORE_SEARCH_RESULTS_ASSET', label: 'Search Results' },
};

export { validateCreativeImage } from './creativeImage.mjs';

const partialJSON = (result) => {
  if (result.json) return result.json;
  try { return JSON.parse(result.stdout); } catch { return null; }
};

/** Dependencies are injectable so upload/replace failures can be tested without writes. */
export function createCreativeUploader(services = {}) {
  const cli = services.run ?? run;
  const json = services.runJson ?? runJson;
  const ready = services.iosReady ?? iosReady;
  const version = services.iosVersion ?? iosVersion;
  const localization = services.iosLocalizationId ?? iosLocalizationId;
  const appId = services.appId ?? (() => process.env.ASC_APP_ID);
  const validateVideo = services.validateCreativeVideo ?? validateCreativeVideo;
  const root = services.stagingRoot ?? path.join(process.cwd(), '.upload-staging', 'ios', 'creatives');
  const locks = services.locks ?? new Set();

  async function target() {
    const status = await ready();
    if (!status.ok) throw new CreativeUploadError(status.why, 503);
    for (const args of [
      ['asset-library', 'images', 'upload', '--help'],
      ['asset-library', 'videos', 'upload', '--help'],
      ['localizations', 'placements', 'create', '--help'],
      ['localizations', 'placements', 'delete', '--help'],
    ]) {
      if (!(await cli('asc', args, { timeout: 10_000 })).ok) {
        throw new CreativeUploadError('Update the asc uploader to a version supporting Asset Library videos and placements (5.14.1 or later).', 503);
      }
    }
    for (const bin of ['ffmpeg', 'ffprobe']) {
      if (!(await cli(bin, ['-version'], { timeout: 10_000 })).ok) throw new CreativeUploadError(`Install FFmpeg to export and upload animated Search videos (${bin} is missing).`, 503);
    }
    const draft = await version({ refresh: true });
    const library = await json('asc', ['asset-library', 'view', '--app', appId(), '--output', 'json'], { timeout: 20_000 });
    const libraryId = library.json?.data?.id;
    if (!library.ok || !libraryId || library.json.data.type !== 'appAssetLibraries') {
      throw new CreativeUploadError(`Cannot access this app’s Asset Library: ${briefError(library)}`, 503);
    }
    return {
      versionId: draft.id, version: draft.versionString, libraryId,
      url: `https://appstoreconnect.apple.com/apps/${encodeURIComponent(appId())}/distribution/ios`,
    };
  }

  async function status() {
    try { return { ok: true, ...await target() }; }
    catch (error) { return { ok: false, error: error.message }; }
  }

  async function placements(localizationId, spec) {
    const result = await json('asc', [
      'localizations', 'placements', 'list', '--localization-id', localizationId,
      '--placement-type', spec.type, '--include', 'image,video', '--paginate', '--output', 'json',
    ]);
    if (!result.ok || !Array.isArray(result.json?.data)) {
      throw new Error(`Cannot inspect existing ${spec.label}: ${briefError(result)}`);
    }
    return result.json.data.filter(item => item.attributes?.placementType === spec.type
      && item.attributes?.placementGroup === 'DEFAULT_PROFILE');
  }

  async function assign(localizationId, media, spec) {
    const result = await json('asc', [
      'localizations', 'placements', 'create', '--localization-id', localizationId,
      `--${media.kind}-id`, media.id, '--placement-type', spec.type, '--output', 'json',
    ]);
    if (!result.ok || !result.json?.created || !result.json.id) {
      // A lost response must not trigger a second POST if Apple already assigned it.
      const actual = await placements(localizationId, spec);
      const found = actual.find(item => item.relationships?.[media.kind]?.data?.id === media.id
        && item.attributes?.state === 'ACTIVE');
      if (found) return found.id;
      throw new Error(`Could not assign ${spec.label}: ${briefError(result)}`);
    }
    return result.json.id;
  }

  async function upload({ placement, locale, data, mediaType, targetVersionId, replace = false, log = () => {} }) {
    const kind = placement === 'search' ? 'video' : 'image';
    if (mediaType && mediaType !== kind) throw new CreativeUploadError(`${placement === 'search' ? 'Search requires a video' : 'Header requires an image'}.`, 400);
    const media = kind === 'video' ? await validateVideo(locale, data) : { bytes: validateCreativeImage(placement, locale, data) };
    const bytes = media.bytes;
    if (typeof replace !== 'boolean' || typeof targetVersionId !== 'string' || !targetVersionId) {
      throw new CreativeUploadError('Choose an upload destination before starting.', 400);
    }
    const spec = CREATIVE_UPLOAD_SPECS[placement];
    const destination = await target();
    if (destination.versionId !== targetVersionId) {
      throw new CreativeUploadError('The editable version changed. Close and reopen the upload window.', 409);
    }
    const keys = IOS_LOCALE_MAP[locale].map(loc => `${appId()}/${targetVersionId}/${spec.type}/${loc}`);
    if (keys.some(key => locks.has(key))) {
      throw new CreativeUploadError('Another upload is already updating this asset. Wait for it to finish.', 409);
    }
    keys.forEach(key => locks.add(key));
    const receipt = { ...destination, placement, locale, uploaded: [], errors: [] };
    try {
      const targets = [];
      for (const ascLocale of IOS_LOCALE_MAP[locale]) {
        const found = await localization(targetVersionId, ascLocale, { create: false });
        const existing = found.id ? await placements(found.id, spec) : [];
        if (existing.length && !replace) {
          throw new CreativeUploadError(`${ascLocale} already has a ${spec.label}. Enable “Replace existing asset” to update it.`, 409);
        }
        if (existing.length > 1 || existing.some(item => {
          const image = item.relationships?.image?.data?.id;
          const video = item.relationships?.video?.data?.id;
          return Boolean(image) === Boolean(video);
        })) {
          throw new CreativeUploadError(`Manage the existing ${ascLocale} ${spec.label} in App Store Connect before replacing it.`, 409);
        }
        targets.push({ ascLocale, localizationId: found.id, existing: existing[0] });
      }

      fs.mkdirSync(root, { recursive: true });
      const directory = fs.mkdtempSync(path.join(root, 'upload-'));
      // Header stays opaque PNG; Search uses the validated animated MP4 bytes.
      const payload = kind === 'video' ? bytes : await sharp(bytes, { limitInputPixels: 3840 * 2560, failOn: 'warning' })
        .removeAlpha().toColourspace('srgb').png().toBuffer();
      const filename = `ricecal-app-store-${placement}-${locale}.${kind === 'video' ? 'mp4' : 'png'}`;
      const file = path.join(directory, filename);
      fs.writeFileSync(file, payload);
      log(`Uploading the ${kind} to Asset Library and waiting for processing…`);
      const uploaded = await json('asc', [
        'asset-library', `${kind}s`, 'upload', '--library-id', destination.libraryId,
        '--file', file, '--output', 'json',
      ], { timeout: 360_000, env: { ...process.env, ASC_UPLOAD_TIMEOUT: '5m' } });
      const asset = partialJSON(uploaded);
      const idKey = `${kind}Id`;
      if (asset?.[idKey]) receipt[idKey] = asset[idKey];
      if (!uploaded.ok || !asset?.uploaded || !asset.ready || !asset[idKey]
        || (asset.width !== (kind === 'video' ? media.width : spec.width)
          || asset.height !== (kind === 'video' ? media.height : spec.height))) {
        throw new Error(`Asset Library could not finish processing the ${kind}: ${briefError(uploaded)}`);
      }
      log(`${kind} ${asset[idKey]} is ready. Assigning ${spec.label}…`);
      if ((await version({ refresh: true })).id !== targetVersionId) {
        throw new Error('The editable version changed during processing. The asset is kept in Asset Library.');
      }

      for (const item of targets) {
        let removed = false;
        try {
          if (!item.localizationId) {
            item.localizationId = (await localization(targetVersionId, item.ascLocale)).id;
            if (!item.localizationId) throw new Error('Could not create this version’s localization.');
          }
          // Recheck the slot after processing, before removing any previous assignment.
          const current = await placements(item.localizationId, spec);
          if (current.length !== (item.existing ? 1 : 0)
            || (item.existing && current[0]?.id !== item.existing.id)) {
            throw new Error('The existing asset changed during upload. Open the upload window again.');
          }
          if (item.existing) {
            const deleted = await json('asc', [
              'localizations', 'placements', 'delete', '--id', item.existing.id, '--confirm', '--output', 'json',
            ]);
            if (!deleted.ok || !deleted.json?.deleted) {
              // A missing DELETE response is not proof that the old field still exists.
              const actual = await placements(item.localizationId, spec);
              if (actual.length) throw new Error(`Could not replace the existing asset: ${briefError(deleted)}`);
            }
            removed = true;
          }
          await assign(item.localizationId, { kind, id: asset[idKey] }, spec);
          receipt.uploaded.push(item.ascLocale);
          log(`${item.ascLocale}: ${spec.label} assigned`);
        } catch (error) {
          let message = error.message;
          if (removed) {
            try {
              const previousKind = item.existing.relationships.image?.data?.id ? 'image' : 'video';
              await assign(item.localizationId, { kind: previousKind, id: item.existing.relationships[previousKind].data.id }, spec);
              message += ' The previous asset was restored.';
            } catch (restoreError) {
              message += ` The previous asset could not be restored: ${restoreError.message}`;
            }
          }
          receipt.errors.push(`${item.ascLocale}: ${message}`);
        }
      }
      return receipt;
    } catch (error) {
      if (error instanceof CreativeUploadError && !receipt.imageId && !receipt.videoId) throw error;
      throw new CreativeUploadError(error.message, 500, receipt);
    } finally {
      keys.forEach(key => locks.delete(key));
    }
  }
  return { status, upload };
}

const lockKey = Symbol.for('ricecal.creativeUploadLocks');
globalThis[lockKey] ??= new Set();
const uploader = createCreativeUploader({ locks: globalThis[lockKey] });
export const creativeUploadStatus = uploader.status;
export const uploadIOSCreative = uploader.upload;
