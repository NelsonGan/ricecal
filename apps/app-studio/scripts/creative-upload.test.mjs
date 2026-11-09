import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createCreativeUploader, validateCreativeImage } from '../src/data/creativeUpload.mjs';

const header = fs.readFileSync(new URL('../public/assets/verification/app-store-header.jpg', import.meta.url)).toString('base64');
const search = fs.readFileSync(new URL('../public/assets/verification/app-store-search.jpg', import.meta.url)).toString('base64');
const options = { placement: 'header', locale: 'ms', data: header, targetVersionId: 'version-1' };
const placement = (id, imageId, type = 'PRODUCT_PAGE_HEADER_ASSET', kind = 'image') => ({
  id, type: 'appAssetLibraryPlacements',
  attributes: { placementType: type, placementGroup: 'DEFAULT_PROFILE', state: 'ACTIVE' },
  relationships: { [kind]: { data: { id: imageId, type: kind === 'video' ? 'appAssetLibraryVideos' : 'appAssetLibraryImages' } } },
});
const success = value => ({ ok: true, json: value, stdout: JSON.stringify(value), stderr: '', code: 0 });
const failure = (message, receipt) => ({ ok: false, json: null, stdout: receipt ? JSON.stringify(receipt) : '', stderr: message, code: 1 });

function fixture(t, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ricecal-creative-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const fields = new Map(config.fields ?? []);
  let versionReads = 0;
  const uploader = createCreativeUploader({
    appId: () => 'test-app', stagingRoot: root,
    validateCreativeVideo: async (_, data) => { assert.equal(data, 'encoded-video'); return { bytes: Buffer.from('MP4 bytes'), width: 1920, height: 1280, fps: 30, duration: 7.2 }; },
    iosReady: async () => ({ ok: true }),
    iosVersion: async () => ({ id: ++versionReads === config.changeVersionAt ? 'version-2' : 'version-1', versionString: '1.0.13' }),
    iosLocalizationId: async (_, locale) => {
      if (config.lookupFailure) throw new Error('could not inspect localization');
      return { id: `loc-${locale}` };
    },
    run: async (_, args) => { calls.push(args); return { ok: true, stdout: '', stderr: '', code: 0 }; },
    runJson: async (_, args) => {
      calls.push(args);
      const flag = name => args[args.indexOf(name) + 1];
      if (args[0] === 'asset-library' && args[1] === 'view') return success({ data: { id: 'library-1', type: 'appAssetLibraries' } });
      if (args[0] === 'asset-library' && args[2] === 'upload') {
        const bytes = fs.readFileSync(flag('--file'));
        const isSearch = args[1] === 'videos';
        if (isSearch) {
          assert.equal(path.extname(flag('--file')), '.mp4');
          assert.equal(bytes.toString(), 'MP4 bytes');
        } else {
          const original = Buffer.from(options.data, 'base64');
          assert.equal(path.extname(flag('--file')), '.png');
          const metadata = await sharp(bytes).metadata();
          assert.equal(metadata.format, 'png');
          assert.equal(metadata.hasAlpha, false);
          assert.equal(metadata.width, 3840);
          assert.equal(metadata.height, 1646);
          assert.ok((await sharp(bytes).raw().toBuffer()).equals(await sharp(original).raw().toBuffer()));
        }
        await config.beforeUpload?.();
        if (config.uploadFailure) return failure('processing failed', { [isSearch ? 'videoId' : 'imageId']: isSearch ? 'new-video' : 'new-image', uploaded: true, ready: false });
        return success({ [isSearch ? 'videoId' : 'imageId']: isSearch ? 'new-video' : 'new-image', uploaded: true, ready: true, width: isSearch ? 1920 : 3840, height: config.wrongHeight ? 99 : isSearch ? 1280 : 1646 });
      }
      if (args[2] === 'list') return success({ data: fields.get(flag('--localization-id')) ?? [] });
      if (args[2] === 'delete') {
        const id = flag('--id');
        for (const [key, values] of fields) fields.set(key, values.filter(p => p.id !== id));
        return config.lostDeleteResponse ? failure('connection lost') : success({ id, deleted: true });
      }
      if (args[2] === 'create') {
        const locale = flag('--localization-id'), kind = args.includes('--video-id') ? 'video' : 'image', imageId = flag(`--${kind}-id`);
        if (config.rejectNew && imageId.startsWith('new-')) return failure('Apple rejected assignment');
        const current = fields.get(locale) ?? [];
        if (current.some(item => item.attributes.placementType === flag('--placement-type'))) return failure('slot occupied');
        const id = `${imageId}-${locale}`;
        fields.set(locale, [...current, placement(id, imageId, flag('--placement-type'), kind)]);
        return config.lostCreateResponse && imageId.startsWith('new-')
          ? failure('connection lost') : success({ id, created: true });
      }
      throw new Error(`Unexpected CLI call: ${args.join(' ')}`);
    },
  });
  const writes = () => calls.filter(args => !args.includes('--help')
    && (args.includes('upload') || args.includes('create') || args.includes('delete')));
  return { uploader, fields, calls, writes };
}

test('invalid locale, placement, JPEG, and dimensions fail before any store command', async t => {
  const f = fixture(t);
  for (const bad of [
    { locale: '../en' }, { locale: 'fil' }, { placement: '__proto__' },
    { data: 'invalid base64' }, { data: search },
  ]) {
    await assert.rejects(f.uploader.upload({ ...options, ...bad }));
  }
  assert.equal(f.calls.length, 0);
  assert.equal(validateCreativeImage('search', 'en', search).length, Buffer.from(search, 'base64').length);
});

test('destination checks are read-only and a changed version prevents upload', async t => {
  const f = fixture(t, { changeVersionAt: 2 });
  const status = await f.uploader.status();
  assert.equal(status.versionId, 'version-1');
  assert.equal(status.ok, true);
  assert.equal(f.writes().length, 0);
  await assert.rejects(f.uploader.upload(options), /editable version changed/);
  assert.equal(f.writes().length, 0);
});

test('English uploads one opaque PNG with identical pixels and assigns all four store locales', async t => {
  const f = fixture(t);
  const result = await f.uploader.upload({ ...options, locale: 'en' });
  assert.deepEqual(result.uploaded, ['en-US', 'en-GB', 'en-AU', 'en-CA']);
  assert.deepEqual(result.errors, []);
  assert.equal(f.writes().filter(args => args.includes('upload')).length, 1);
  assert.equal(f.writes().filter(args => args.includes('create')).length, 4);
  for (const values of f.fields.values()) assert.equal(values[0].relationships.image.data.id, 'new-image');
});

test('Search Results is assigned separately and leaves the existing Header intact', async t => {
  const old = placement('header-placement', 'header-image');
  const f = fixture(t, { fields: [['loc-ms', [old]]] });
  const result = await f.uploader.upload({ ...options, placement: 'search', data: 'encoded-video', mediaType: 'video' });
  assert.deepEqual(result.uploaded, ['ms']);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(f.fields.get('loc-ms')[0], old);
  assert.equal(result.videoId, 'new-video');
  assert.equal(f.fields.get('loc-ms')[1].relationships.video.data.id, 'new-video');
  assert.equal(f.fields.get('loc-ms')[1].attributes.placementType, 'APP_STORE_SEARCH_RESULTS_ASSET');
  assert.equal(f.writes().filter(args => args.includes('delete')).length, 0);
});

test('an occupied field requires explicit replacement before any upload', async t => {
  const old = placement('old-placement', 'old-image');
  const f = fixture(t, { fields: [['loc-ms', [old]]] });
  await assert.rejects(f.uploader.upload(options), /Replace existing asset/);
  assert.deepEqual(f.fields.get('loc-ms'), [old]);
  assert.equal(f.writes().length, 0);
});

test('a failed localization lookup stops before uploading any artwork', async t => {
  const f = fixture(t, { lookupFailure: true });
  await assert.rejects(f.uploader.upload(options), /could not inspect localization/);
  assert.equal(f.writes().length, 0);
});

test('a failed video replacement restores the previous video assignment', async t => {
  const old = placement('old-placement', 'old-video', 'APP_STORE_SEARCH_RESULTS_ASSET', 'video');
  const f = fixture(t, { rejectNew: true, fields: [['loc-ms', [old]]] });
  const result = await f.uploader.upload({ ...options, placement: 'search', mediaType: 'video', data: 'encoded-video', replace: true });
  assert.deepEqual(result.uploaded, []);
  assert.match(result.errors[0], /previous asset was restored/);
  assert.equal(f.fields.get('loc-ms')[0].relationships.video.data.id, 'old-video');
});

test('failed processing preserves the image receipt and never removes an existing field', async t => {
  const old = placement('old-placement', 'old-image');
  const f = fixture(t, { uploadFailure: true, fields: [['loc-ms', [old]]] });
  await assert.rejects(f.uploader.upload({ ...options, replace: true }), error => {
    assert.equal(error.receipt.imageId, 'new-image');
    return /processing/.test(error.message);
  });
  assert.deepEqual(f.fields.get('loc-ms'), [old]);
  assert.equal(f.writes().filter(args => args.includes('delete')).length, 0);
});

test('a version changed during processing leaves existing fields untouched', async t => {
  const old = placement('old-placement', 'old-image');
  const f = fixture(t, { changeVersionAt: 2, fields: [['loc-ms', [old]]] });
  await assert.rejects(f.uploader.upload({ ...options, replace: true }), /version changed during processing/);
  assert.deepEqual(f.fields.get('loc-ms'), [old]);
  assert.equal(f.writes().filter(args => args.includes('delete')).length, 0);
});

test('failed replacement restores the previous image and reports failure', async t => {
  const f = fixture(t, { rejectNew: true, fields: [['loc-ms', [placement('old-placement', 'old-image')]]] });
  const result = await f.uploader.upload({ ...options, replace: true });
  assert.deepEqual(result.uploaded, []);
  assert.match(result.errors[0], /previous asset was restored/);
  assert.equal(f.fields.get('loc-ms')[0].relationships.image.data.id, 'old-image');
  assert.equal(f.writes().filter(args => args.includes('delete')).length, 1);
});

test('uncertain placement and deletion responses are reconciled before retrying writes', async t => {
  const f = fixture(t, {
    lostCreateResponse: true, lostDeleteResponse: true,
    fields: [['loc-ms', [placement('old-placement', 'old-image')]]],
  });
  const result = await f.uploader.upload({ ...options, replace: true });
  assert.deepEqual(result.uploaded, ['ms']);
  assert.deepEqual(result.errors, []);
  assert.equal(f.writes().filter(args => args.includes('create')).length, 1);
});

test('wrong processed dimensions never get assigned', async t => {
  const f = fixture(t, { wrongHeight: true });
  await assert.rejects(f.uploader.upload(options), /processing/);
  assert.equal(f.writes().filter(args => args.includes('create')).length, 0);
});

test('concurrent requests for the same fields do not duplicate uploads', async t => {
  let release, began;
  const started = new Promise(resolve => { began = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { beforeUpload: async () => { began(); await gate; } });
  const first = f.uploader.upload(options);
  await started;
  await assert.rejects(f.uploader.upload(options), /Another upload/);
  release();
  assert.deepEqual((await first).uploaded, ['ms']);
  assert.equal(f.writes().filter(args => args.includes('upload')).length, 1);
});


test('Search can replace an old image with a video and reconcile a lost response', async t => {
  const old = placement('old-placement', 'old-image', 'APP_STORE_SEARCH_RESULTS_ASSET');
  const f = fixture(t, { lostCreateResponse: true, fields: [['loc-ms', [old]]] });
  const result = await f.uploader.upload({ ...options, placement: 'search', mediaType: 'video', data: 'encoded-video', replace: true });
  assert.deepEqual(result.errors, []);
  assert.equal(f.fields.get('loc-ms')[0].relationships.video.data.id, 'new-video');
  assert.equal(f.writes().filter(args => args.includes('create')).length, 1);
});

test('English Search uploads a single video and assigns all four English locales', async t => {
  const f = fixture(t);
  const result = await f.uploader.upload({ ...options, locale: 'en', placement: 'search', mediaType: 'video', data: 'encoded-video' });
  assert.deepEqual(result.uploaded, ['en-US', 'en-GB', 'en-AU', 'en-CA']);
  assert.equal(f.writes().filter(args => args.includes('upload')).length, 1);
  for (const fields of f.fields.values()) assert.equal(fields[0].relationships.video.data.id, 'new-video');
});
