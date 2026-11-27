import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ANDROID_IMAGE_TYPES, IOS_DEVICE_TYPE } from '../src/data/storeLocales.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the iPhone Duo set goes to its App Store slot and nowhere on Play', () => {
  assert.equal(IOS_DEVICE_TYPE.duo, 'IPHONE_DUO');
  assert.equal(ANDROID_IMAGE_TYPES.duo, undefined);
});

test('the iPhone Duo scenes export at the open display size, from their own captures', async () => {
  const exporter = await read('../src/utils/export.ts');
  assert.match(exporter, /DUO_EXPORT_WIDTH = 2853;/);
  assert.match(exporter, /DUO_EXPORT_HEIGHT = 2007;/);
  const scenes = await read('../src/scenes/duoSceneData.tsx');
  const shots = [...scenes.matchAll(/screenshot: `\$\{p\}\/([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(shots, ['01-today.png', '02-workout.png', '03-dish.png', '05-feed.png', '06-recipes.png', '04-trends.png']);
  assert.match(scenes, /folder = 'screenshots-iphone-duo'/);
  // The Duo gallery takes that default; only the iPad passes its own folder.
  const page = await read('../src/app/page.tsx');
  assert.match(page, /getDuoScenes\(locale\);/);
  // The gallery's order matches the iPhone set's, scene for scene, except the
  // iPhone's brand panel: it is drawn for a portrait canvas and the Duo has none.
  const phone = await read('../src/scenes/sceneData.tsx');
  const names = (source) => [...source.matchAll(/^\s+id: '\d+-([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(names(scenes), names(phone).filter((name) => name !== 'panel'));
});

test('the upload modal offers iPhone Duo to the App Store only', async () => {
  const modal = await read('../src/components/UploadModal.tsx');
  assert.match(modal, /device === 'watch' \|\| device === 'duo'\) return \['ios'\]/);
});
