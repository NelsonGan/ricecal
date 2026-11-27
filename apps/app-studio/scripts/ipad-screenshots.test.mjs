import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { IOS_DEVICE_TYPE } from '../src/data/storeLocales.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the iPad scenes are the iPhone Duo gallery around native iPad captures', async () => {
  const scenes = await read('../src/scenes/ipadSceneData.tsx');
  assert.match(scenes, /getDuoScenes\(locale, 'screenshots-ipad'\)/);
  // No phone captures standing in for a tablet any more.
  assert.doesNotMatch(scenes, /screenshots-iphone/);
  const exporter = await read('../src/utils/export.ts');
  assert.match(exporter, /IPAD_EXPORT_WIDTH = 2732;/);
  assert.match(exporter, /IPAD_EXPORT_HEIGHT = 2048;/);
  assert.equal(IOS_DEVICE_TYPE.ipad, 'IPAD_PRO_3GEN_129');
});

test('the iPad frame keeps the captures at their own aspect', async () => {
  const frame = await read('../src/components/IPadScreenshotScene.tsx');
  assert.match(frame, /SCREEN_W \* \(2064 \/ 2752\)/);
  const capture = JSON.parse(await read('../public/assets/screenshots-ipad/capture.json'));
  for (const record of capture.captures) {
    assert.equal(record.width, 2752);
    assert.equal(record.height, 2064);
  }
});
