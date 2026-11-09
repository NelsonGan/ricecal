import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { IOS_LOCALE_MAP, ANDROID_LOCALE_MAP, IOS_METADATA_LOCALE_MAP, ANDROID_METADATA_LOCALE_MAP } from '../src/data/storeLocales.mjs';

const locales = ['en', 'zh-Hans', 'zh-Hant', 'ms', 'id', 'th', 'vi', 'fil', 'ja', 'ko', 'hi', 'ta', 'bn'];
const screens = ['01-today', '02-workout', '03-dish', '04-trends', '05-feed', '06-recipes'];
const routes = {
  '01-today': '/today',
  '02-workout': '/workout/active',
  '03-dish': '/log/food/entry',
  '04-trends': '/trends',
  '05-feed': '/feed',
  '06-recipes': '/settings/foods',
};
// The iPhone set and the iPhone Duo set, open on its side, are captured
// separately from the same fixtures and food images.
const sets = [
  // The current iPhone set predates RiceCal's fixed simulators; a recapture
  // comes from RiceCal iPhone 18 Pro.
  { folder: 'screenshots-iphone', devices: ['RiceCal Screenshots', 'RiceCal iPhone 18 Pro'], width: 1320, height: 2868 },
  { folder: 'screenshots-iphone-duo', devices: ['RiceCal iPhone Duo'], width: 2853, height: 2007 },
];
const hashes = new Set();
const manifests = [];
for (const set of sets) {
  const root = new URL(`../public/assets/${set.folder}/`, import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('capture.json', root), 'utf8'));
  assert.equal(metadata.backend, 'local Supabase');
  assert.equal(metadata.foodImages, 'AI-generated');
  assert.equal(metadata.captures.length, locales.length * screens.length);
  const manifestBytes = await readFile(new URL('photo-provenance.json', root));
  manifests.push(manifestBytes);
  const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
  assert.equal(new Set(metadata.captures.map(r => r.date)).size, 1, 'Capture every language on the same fixture date');
  assert.equal(new Set(metadata.captures.map(r => r.appSourceCommit)).size, 1, 'Capture one app revision across every language');
  assert.equal(new Set(metadata.captures.map(r => r.appVersion)).size, 1, 'Capture one app version across every language');
  assert.equal(new Set(metadata.captures.map(r => r.fixtureSha256)).size, 1, 'Use the same fixtures across every language');
  for (const locale of locales) {
    for (const screen of screens) {
      const name = `${set.folder}/${locale}/${screen}`;
      const records = metadata.captures.filter((r) => r.locale === locale && r.screen === screen);
      assert.equal(records.length, 1, `${name} needs one capture record`);
      assert.equal(records[0].route, routes[screen]);
      assert.equal(records[0].routeVerified, true, `${name} has no verified navigation state`);
      assert.match(records[0].appSourceCommit, /^[a-f0-9]{40}$/);
      assert.match(records[0].fixtureSha256, /^[a-f0-9]{64}$/);
      assert.match(records[0].appVersion, /^\d+\.\d+\.\d+$/);
      assert(set.devices.includes(records[0].device), `${name} was captured on ${records[0].device}`);
      const bytes = await readFile(new URL(`${locale}/${screen}.png`, root));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16), set.width);
      assert.equal(bytes.readUInt32BE(20), set.height);
      assert.equal(records[0].width, set.width);
      assert.equal(records[0].height, set.height);
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(records[0].sha256, hash, `${name} differs from its recorded capture`);
      assert.equal(records[0].photoManifestSha256, manifestHash, `${name} food provenance changed`);
      assert(!hashes.has(hash), `${name} repeats another capture`);
      hashes.add(hash);
      assert.equal(records[0].market, ['en', 'zh-Hans', 'zh-Hant', 'ms'].includes(locale) ? 'MY' : {id:'ID',th:'TH',vi:'VN',fil:'PH',ja:'JP',ko:'KR',hi:'IN',ta:'IN_TA',bn:'BD'}[locale]);
    }
  }
}
assert(manifests.every((bytes) => bytes.equals(manifests[0])), 'The iPhone and iPhone Duo sets show different food images');
const manifestBytes = manifests[0];
const photos = JSON.parse(manifestBytes);
assert.equal(photos.length, 60);
assert.equal(new Set(photos.map((photo) => photo.filename)).size, 60);
for (const photo of photos) {
  assert.equal(photo.origin, 'AI-generated');
  assert.equal(photo.generator, 'OpenAI image_gen');
  assert(photo.prompt && photo.batch && photo.dish && photo.market);
  assert(photo.crop.width > 0 && photo.crop.width === photo.crop.height);
  assert.match(photo.sha256, /^[a-f0-9]{64}$/);
}
for (const mapping of [IOS_LOCALE_MAP, ANDROID_LOCALE_MAP]) {
  const targets = Object.values(mapping).flat();
  assert.equal(new Set(targets).size, targets.length, 'Two languages overwrite the same store locale');
}
assert.deepEqual(IOS_LOCALE_MAP.zh, ['zh-Hans']);
assert.deepEqual(IOS_LOCALE_MAP['zh-Hant'], ['zh-Hant']);
assert.deepEqual(IOS_LOCALE_MAP.ta, ['ta-IN']);
assert.deepEqual(IOS_LOCALE_MAP.bn, ['bn-BD']);
assert.deepEqual(ANDROID_LOCALE_MAP.ta, ['ta-IN']);
assert.deepEqual(ANDROID_LOCALE_MAP.bn, ['bn-BD']);
assert.deepEqual(IOS_METADATA_LOCALE_MAP.zh, ['zh-Hans', 'zh-Hant']);
assert.deepEqual(ANDROID_METADATA_LOCALE_MAP.zh, ['zh-CN', 'zh-TW', 'zh-HK']);
console.log(`Verified ${hashes.size} distinct app captures (iPhone and iPhone Duo) in ${locales.length} languages, generated photo provenance and store mappings.`);
