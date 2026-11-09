import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { ANDROID_IMAGE_TYPES, IOS_DEVICE_TYPE } from '../src/data/storeLocales.mjs';

const root = new URL('../public/assets/screenshots-watch/en/', import.meta.url);

test('the watch set goes to the 46 mm App Store slot and nowhere on Play', () => {
  assert.equal(IOS_DEVICE_TYPE.watch, 'WATCH_SERIES_10');
  assert.equal(ANDROID_IMAGE_TYPES.watch, undefined);
});

test('every watch capture is the recorded file at 416 × 496', async () => {
  const record = JSON.parse(await readFile(new URL('../capture.json', root), 'utf8'));
  const source = await readFile(new URL('../src/data/watchScreens.ts', import.meta.url), 'utf8');
  const listed = [...source.matchAll(/id: '([^']+)'/g)].map(m => m[1]);
  const entries = await readdir(root);
  // `asc` uploads every file in the folder and refuses one it cannot read as an image.
  assert.deepEqual(entries.filter(f => !f.endsWith('.png')), [], 'only PNGs may sit beside the captures');
  const files = entries.map(f => f.slice(0, -4)).sort();

  assert.deepEqual(listed, files, 'watchScreens.ts and the folder disagree');
  assert.deepEqual(record.captures.map(c => c.screen), files);
  assert.match(record.appSourceCommit, /^[a-f0-9]{40}$/);
  assert.ok(listed.length <= 10, 'App Store Connect takes at most 10 screenshots per slot');

  for (const capture of record.captures) {
    const bytes = await readFile(new URL(`${capture.screen}.png`, root));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 416, `${capture.screen} width`);
    assert.equal(bytes.readUInt32BE(20), 496, `${capture.screen} height`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), capture.sha256,
      `${capture.screen} differs from its recorded capture`);
  }
});
