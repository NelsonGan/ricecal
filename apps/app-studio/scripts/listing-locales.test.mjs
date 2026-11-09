import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {
  IOS_LOCALE_MAP, ANDROID_LOCALE_MAP,
  IOS_METADATA_LOCALE_MAP, ANDROID_METADATA_LOCALE_MAP,
} from '../src/data/storeLocales.mjs';

const source = fs.readFileSync(new URL('../src/data/appDescriptions.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { APP_DESCRIPTIONS, DESCRIPTION_LOCALE_CODES } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('every screenshot language also uploads listing text', () => {
  for (const [screenshots, metadata] of [
    [IOS_LOCALE_MAP, IOS_METADATA_LOCALE_MAP],
    [ANDROID_LOCALE_MAP, ANDROID_METADATA_LOCALE_MAP],
  ]) {
    for (const [locale, storeLocales] of Object.entries(screenshots)) {
      const sourceLocale = locale === 'zh-Hant' ? 'zh' : locale;
      for (const storeLocale of storeLocales) {
        assert.ok(metadata[sourceLocale]?.includes(storeLocale), `${locale} omits ${storeLocale} listing text`);
      }
    }
  }
});

test('every metadata language is selectable and has a complete release note', () => {
  const locales = new Set([
    ...Object.keys(IOS_METADATA_LOCALE_MAP),
    ...Object.keys(ANDROID_METADATA_LOCALE_MAP),
  ]);
  const bulletCount = APP_DESCRIPTIONS.en.whatsNew.split('\n').filter(line => line.startsWith('- ')).length;
  assert.deepEqual(new Set(DESCRIPTION_LOCALE_CODES), locales);
  assert.deepEqual(new Set(Object.keys(APP_DESCRIPTIONS)), locales);
  for (const locale of locales) {
    const { description, whatsNew } = APP_DESCRIPTIONS[locale];
    assert.ok(description.trim(), `${locale} has no description`);
    assert.ok(whatsNew?.trim(), `${locale} has no release note`);
    assert.ok(whatsNew.length < 500, `${locale} exceeds the release note limit`);
    const lines = whatsNew.split('\n');
    const bullets = lines.filter(line => line.startsWith('- '));
    assert.equal(bullets.length, bulletCount, `${locale} loses a release note bullet`);
    assert.equal(lines.at(-2), '', `${locale} lacks a closing line separator`);
    assert.ok(lines.at(-1).trim(), `${locale} has no closing line`);
    assert.ok(!/[，,、،]/u.test(bullets.join(' ')), `${locale} has a comma in a bullet`);
    assert.ok(!/[—–]/u.test(whatsNew), `${locale} has a long dash in the release note`);
  }
});
