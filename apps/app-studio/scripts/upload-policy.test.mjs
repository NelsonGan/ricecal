import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCommitAndroidEdit, requireSuccessfulUpload } from '../src/utils/uploadPolicy.mjs';

test('only a complete successful upload commits the store edit', () => {
  assert.equal(shouldCommitAndroidEdit(false, 0, 26), true);
  assert.equal(shouldCommitAndroidEdit(false, 1, 25), false);
  assert.equal(shouldCommitAndroidEdit(false, 26, 0), false);
  assert.equal(shouldCommitAndroidEdit(true, 0, 26), false);
  assert.equal(shouldCommitAndroidEdit(false, 0, 0), false);
});

test('per-listing errors in HTTP 200 responses count as failed uploads', () => {
  assert.throws(() => requireSuccessfulUpload({ uploaded: ['en-US'], errors: ['en-GB failed'] }), /en-GB failed/);
  assert.throws(() => requireSuccessfulUpload({ uploaded: [], errors: [] }), /No images/);
  assert.deepEqual(requireSuccessfulUpload({ uploaded: ['zh-TW', 'zh-HK'] }), { uploaded: ['zh-TW', 'zh-HK'] });
  assert.deepEqual(requireSuccessfulUpload({ skipped: true }), { skipped: true });
});
