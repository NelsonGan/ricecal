import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { IOS_LOCALE_MAP, ANDROID_LOCALE_MAP } from '../src/data/storeLocales.mjs';

const catalog = JSON.parse(await readFile(new URL('../public/assets/app-store/food-camera/catalog.json', import.meta.url), 'utf8'));
const APP_STORE_COPY = catalog.locales;

test('every store language has two authored lines for Search Results', () => {
  const locales = new Set([...Object.keys(IOS_LOCALE_MAP), ...Object.keys(ANDROID_LOCALE_MAP)]);
  assert.deepEqual(new Set(Object.keys(APP_STORE_COPY)), locales);
  for (const locale of locales) {
    const lines = APP_STORE_COPY[locale].search.split('\n');
    assert.equal(lines.length, 2, `${locale}/search loses its authored line break`);
    assert.ok(lines.every(line => line.trim()), `${locale}/search has an empty line`);
  }
});

test('the creative backgrounds match their recorded provenance and are opaque RGB', async () => {
  const root = new URL('../public/assets/app-store/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('artwork-provenance.json', root), 'utf8'));
  for (const artwork of [provenance, provenance.headerVariant,
    provenance.currentRevision.search, provenance.currentRevision.header]) {
    const bytes = await readFile(new URL(artwork.asset, root));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], artwork.dimensions);
    assert.equal(bytes[25], 2, 'creative backgrounds must be RGB without an alpha channel');
    assert.equal(artwork.mode, 'RGB');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artwork.sha256);
    assert.ok(artwork.prompt.trim(), 'each background needs its edit prompt');
  }
  assert.equal(provenance.headerVariant.sourceAsset, provenance.asset);
  assert.equal(provenance.headerVariant.sourceSha256, provenance.sha256);
  assert.ok(provenance.referenceConcept.prompt.trim(), 'the selected direction needs its generation prompt');
});


test('each locale has one canonical food with a recorded generation prompt and intact image', async () => {
  const foods = new Set();
  for (const [locale, copy] of Object.entries(catalog.locales)) {
    const food = catalog.foods[copy.foodId];
    assert.ok(food, `${locale} has no canonical food`);
    assert.ok(copy.country && food.prompt && food.tool === 'Built-in image_gen');
    assert.ok(!copy.search.includes('RiceCal'));
    foods.add(copy.foodId);
  }
  assert.equal(catalog.locales.en.search, 'Count calories\nthe asian way');
  assert.equal(catalog.locales.en.foodId, 'nasi-lemak');
  assert.equal(catalog.locales.ms.foodId, 'nasi-lemak');
  assert.equal(foods.size, 25);
  for (const id of foods) {
    const food = catalog.foods[id];
    const bytes = await readFile(new URL(`../public${food.image}`, import.meta.url));
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], food.dimensions);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), food.sha256);
  }
});
