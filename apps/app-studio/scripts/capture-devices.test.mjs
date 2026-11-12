import assert from 'node:assert/strict';
import test from 'node:test';
import { capturedOnAllowedDevice } from './capture-devices.mjs';

const retired = ['RiceCal Screenshots', 'RiceCal iPhone 18 Pro'];

test('a capture from a Simlock pool lease passes', () => {
  assert.equal(capturedOnAllowedDevice(retired, 'simlock-3fe51147-7001-43b3-aee0-6b83cf3ad419'), true);
});

test('a capture from a retired fixed simulator still passes', () => {
  assert.equal(capturedOnAllowedDevice(retired, 'RiceCal Screenshots'), true);
  assert.equal(capturedOnAllowedDevice(retired, 'RiceCal iPhone 18 Pro'), true);
});

test('any other simulator is refused', () => {
  for (const device of [
    'iPhone 18 Pro',
    'RiceCal iPhone Duo',
    'simlock-',
    'simlock-3fe51147',
    'simlock-3FE51147-7001-43B3-AEE0-6B83CF3AD419',
    'x simlock-3fe51147-7001-43b3-aee0-6b83cf3ad419',
    undefined,
  ]) {
    assert.equal(capturedOnAllowedDevice(retired, device), false, String(device));
  }
});
