import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/data/storeUpload.mjs', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function fixture(listResponse, listError = null) {
  const calls = [];
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: name => name === 'child_process' ? {
      execFile: (_bin, args, _options, callback) => {
        calls.push(args);
        if (args[1] === 'list') callback(listError, JSON.stringify(listResponse), listError ? 'Apple unavailable' : '');
        else callback(null, JSON.stringify({ data: { id: 'new-localization' } }), '');
      },
    } : {},
  });
  return { lookup: options => exports.iosLocalizationId('version-1', 'ms', options), calls };
}

test('a failed localization lookup stops before creating or staging a store field', async () => {
  for (const options of [{ create: false }, { create: true }]) {
    const f = fixture({ data: [] }, new Error('Apple unavailable'));
    await assert.rejects(f.lookup(options), /inspect localization ms/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][1], 'list');
  }
});

test('an unreadable localization list cannot be treated as an empty list', async () => {
  for (const response of [{}, { data: null }]) {
    const f = fixture(response);
    await assert.rejects(f.lookup({ create: true }), /inspect localization ms/);
    assert.equal(f.calls.length, 1);
  }
});

test('a confirmed empty list stays read-only until creation is requested', async () => {
  const readonly = fixture({ data: [] });
  assert.equal((await readonly.lookup({ create: false })).wouldCreate, true);
  assert.equal(readonly.calls.length, 1);
  const creating = fixture({ data: [] });
  assert.equal((await creating.lookup({ create: true })).id, 'new-localization');
  assert.equal(creating.calls.length, 2);
});
