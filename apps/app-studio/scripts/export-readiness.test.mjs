import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/utils/export.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function captureFixture(fonts, images = [], renderError) {
  const renders = [];
  const attributes = new Map();
  const element = { isConnected: true, querySelectorAll: () => images, style: { backgroundColor: '#123F31' },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, document: { fonts: { ready: fonts } },
    require: name => {
      if (name === 'html-to-image') return {
        toJpeg: async (_, options) => {
          renders.push({ element, captureStill: element.getAttribute('data-capture-still'), background: options.backgroundColor });
          if (renderError) throw renderError;
          return 'data:image/jpeg;base64,complete';
        },
        toPng: async () => { renders.push(element); return 'data:image/png;base64,complete'; },
      };
      if (name.endsWith('appStoreAssets')) return { APP_STORE_ASSETS: { header: { width: 3840, height: 1646 } } };
      return {};
    },
  });
  return { capture: () => exports.captureScene(element, 'header'), element, renders };
}

test('a view removed while fonts load never reaches image rendering', async () => {
  const fonts = deferred();
  const f = captureFixture(fonts.promise);
  const pending = f.capture();
  f.element.isConnected = false;
  fonts.resolve();
  await assert.rejects(pending, /view changed during export/);
  assert.equal(f.renders.length, 0);
});

test('a view removed while its image decodes never reaches image rendering', async () => {
  const decoding = deferred(), started = deferred();
  const f = captureFixture(Promise.resolve(), [{ decode: () => { started.resolve(); return decoding.promise; } }]);
  const pending = f.capture();
  await started.promise;
  f.element.isConnected = false;
  decoding.resolve();
  await assert.rejects(pending, /view changed during export/);
  assert.equal(f.renders.length, 0);
});

test('a connected view waits for image decoding before rendering', async () => {
  const decoding = deferred(), started = deferred();
  const f = captureFixture(Promise.resolve(), [{ decode: () => { started.resolve(); return decoding.promise; } }]);
  const pending = f.capture();
  await started.promise;
  assert.equal(f.renders.length, 0);
  decoding.resolve();
  assert.equal(await pending, 'data:image/jpeg;base64,complete');
  assert.equal(f.renders.length, 1);
  assert.equal(f.renders[0].captureStill, 'true');
  assert.equal(f.renders[0].background, '#123F31');
  assert.equal(f.element.getAttribute('data-capture-still'), null);
});

test('a failed capture restores the preview animation state', async () => {
  const f = captureFixture(Promise.resolve(), [], new Error('rasterization failed'));
  f.element.setAttribute('data-capture-still', 'false');
  await assert.rejects(f.capture(), /rasterization failed/);
  assert.equal(f.renders[0].captureStill, 'true');
  assert.equal(f.element.getAttribute('data-capture-still'), 'false');
});
