import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { stageLocale } from '../src/data/storeUpload.mjs';

const png = { filename: '01-today.png', data: Buffer.from('png').toString('base64') };

function tempRoot() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'stage-locale-'));
  const root = path.join(base, 'ios', 'phone');
  fs.mkdirSync(root, { recursive: true });
  // A file beside the staging root stands in for everything an escape could
  // delete or overwrite.
  fs.writeFileSync(path.join(base, 'keep.txt'), 'keep');
  return { base, root };
}

test('stages a locale under its root', () => {
  const { root } = tempRoot();
  for (const locale of ['en', 'zh-Hant', 'en-US', 'es-419', 'sr-Latn-RS']) {
    const dir = stageLocale(root, locale, [png]);
    assert.equal(dir, path.join(root, locale));
    assert.deepEqual(fs.readdirSync(dir), ['01-today.png']);
  }
});

test('a locale that climbs out of the staging root is refused before anything is deleted', () => {
  const { base, root } = tempRoot();
  for (const locale of ['..', '../..', '../../keep.txt', '/tmp', 'en/../..', 'en/x', '', '.']) {
    assert.throws(() => stageLocale(root, locale, [png]), /Refusing to stage locale/);
  }
  assert.equal(fs.readFileSync(path.join(base, 'keep.txt'), 'utf8'), 'keep');
});

test('a filename with a directory part, or that is not a PNG, is refused', () => {
  const { base, root } = tempRoot();
  for (const filename of ['../../keep.txt', '../x.png', 'a/b.png', '.zshrc', 'x.plist', '', '/etc/x.png']) {
    assert.throws(() => stageLocale(root, 'en', [{ filename, data: '' }]), /Refusing to stage file/);
  }
  assert.equal(fs.existsSync(path.join(root, 'en')), false, 'nothing staged when one name is bad');
  assert.equal(fs.readFileSync(path.join(base, 'keep.txt'), 'utf8'), 'keep');
});
