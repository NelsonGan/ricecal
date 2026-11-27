import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APP_NAME, SUBTITLES, KEYWORDS, PLAY_SHORT_DESCRIPTIONS,
  IOS_STORE_OVERRIDES, ANDROID_STORE_OVERRIDES,
} from '../src/data/listingCopy.mjs';
import { IOS_METADATA_LOCALE_MAP, ANDROID_METADATA_LOCALE_MAP } from '../src/data/storeLocales.mjs';
import { copyForStoreLocale } from '../src/data/storeUpload.mjs';

const LONG_DASH = /[—–]/u;
const HAN = /\p{Script=Han}/u;

/** The copy each App Store locale ends up with, overrides included. */
function iosCopy(storeLocale) {
  const language = Object.keys(IOS_METADATA_LOCALE_MAP)
    .find(l => IOS_METADATA_LOCALE_MAP[l].includes(storeLocale));
  return {
    name: APP_NAME,
    subtitle: SUBTITLES[language],
    keywords: KEYWORDS[language],
    ...(IOS_STORE_OVERRIDES[storeLocale] ?? {}),
  };
}

test('every listing string fits its store field', () => {
  assert.ok(APP_NAME.length <= 30);
  for (const [locale, subtitle] of Object.entries(SUBTITLES)) {
    assert.ok(subtitle.length <= 30, `${locale} subtitle is ${subtitle.length} characters`);
  }
  const keywordFields = [
    ...Object.entries(KEYWORDS),
    ...Object.entries(IOS_STORE_OVERRIDES).filter(([, o]) => o.keywords).map(([l, o]) => [l, o.keywords]),
  ];
  for (const [locale, keywords] of keywordFields) {
    assert.ok(keywords.length <= 100, `${locale} keywords are ${keywords.length} characters`);
    assert.ok(!/,\s|\s,/.test(keywords), `${locale} keywords have a space beside a comma`);
    const words = keywords.split(',');
    assert.equal(new Set(words).size, words.length, `${locale} repeats a keyword`);
  }
  for (const [locale, short] of Object.entries(PLAY_SHORT_DESCRIPTIONS)) {
    assert.ok(short.length <= 80, `${locale} short description is ${short.length} characters`);
  }
  for (const [locale, o] of Object.entries({ ...IOS_STORE_OVERRIDES, ...ANDROID_STORE_OVERRIDES })) {
    if (o.subtitle) assert.ok(o.subtitle.length <= 30, `${locale} subtitle override`);
    if (o.name) assert.ok(o.name.length <= 30, `${locale} name override`);
    if (o.shortDescription) assert.ok(o.shortDescription.length <= 80, `${locale} short description override`);
  }
});

test('no listing string a user reads has a long dash', () => {
  const strings = [
    APP_NAME, ...Object.values(SUBTITLES), ...Object.values(PLAY_SHORT_DESCRIPTIONS),
    ...Object.values({ ...IOS_STORE_OVERRIDES, ...ANDROID_STORE_OVERRIDES }).flatMap(o => Object.values(o)),
  ];
  for (const s of strings) assert.ok(!LONG_DASH.test(s), s);
});

test('overrides name store locales that are actually uploaded', () => {
  const ios = new Set(Object.values(IOS_METADATA_LOCALE_MAP).flat());
  const android = new Set(Object.values(ANDROID_METADATA_LOCALE_MAP).flat());
  for (const l of Object.keys(IOS_STORE_OVERRIDES)) assert.ok(ios.has(l), `no App Store locale ${l}`);
  for (const l of Object.keys(ANDROID_STORE_OVERRIDES)) assert.ok(android.has(l), `no Play locale ${l}`);
});

/**
 * Apple searches the name, subtitle and keywords as one pool, so a keyword
 * already in the name or subtitle wastes characters. Checked for the listings
 * Malaysia, Singapore, Hong Kong, Taiwan and the US search; the other
 * languages predate the rule and still repeat words.
 */
test('Southeast Asian listings do not spend keywords on the name or subtitle', () => {
  for (const storeLocale of ['en-US', 'en-GB', 'ms', 'zh-Hans', 'zh-Hant']) {
    const { name, subtitle, keywords } = iosCopy(storeLocale);
    const taken = `${name} ${subtitle}`.toLowerCase();
    const takenWords = new Set(taken.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    for (const keyword of keywords.split(',')) {
      const clash = HAN.test(keyword) ? taken.includes(keyword) : takenWords.has(keyword);
      assert.ok(!clash, `${storeLocale} keyword "${keyword}" is already in the name or subtitle`);
    }
  }
});

test('Traditional Chinese listings are not written in Simplified characters', () => {
  // Characters whose Traditional form differs, all of which this copy uses.
  const simplifiedOnly = /[热与记录营养减体谱亚识计马条码训练饭经质湾]/u;
  const traditional = [
    IOS_STORE_OVERRIDES['zh-Hant'].subtitle,
    IOS_STORE_OVERRIDES['zh-Hant'].keywords,
    ...['zh-TW', 'zh-HK'].flatMap(l => Object.values(ANDROID_STORE_OVERRIDES[l])),
  ];
  for (const s of traditional) {
    const found = s.match(simplifiedOnly);
    assert.equal(found, null, `"${s}" has Simplified ${found?.[0]}`);
  }
});

test('a store locale override replaces only the fields it names', () => {
  const copy = {
    keywords: 'shared', subtitle: 'Shared subtitle',
    storeLocales: { 'en-GB': { keywords: 'regional' } },
  };
  assert.deepEqual(copyForStoreLocale(copy, 'en-GB'), { keywords: 'regional', subtitle: 'Shared subtitle' });
  assert.deepEqual(copyForStoreLocale(copy, 'en-US'), { keywords: 'shared', subtitle: 'Shared subtitle' });
  assert.deepEqual(copyForStoreLocale({ keywords: 'shared' }, 'en-GB'), { keywords: 'shared' });
});
