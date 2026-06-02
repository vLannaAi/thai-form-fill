const test = require('node:test');
const assert = require('node:assert');
const Studio = require('../lib/studio.js');

test('rawToEff / effToRaw round-trip through a scale', () => {
  assert.strictEqual(Studio.rawToEff(32, 0.375), 12);
  assert.strictEqual(Studio.effToRaw(12, 0.375), 32);
  assert.strictEqual(Studio.rawToEff(13, 1), 13);
  assert.strictEqual(Studio.effToRaw(13, 1), 13);
});

test('effToRaw guards a zero/invalid scale', () => {
  assert.strictEqual(Studio.effToRaw(12, 0), 12);
  assert.strictEqual(Studio.effToRaw(12, NaN), 12);
});

test('rawToEff defaults scale=1 for falsy scale', () => {
  assert.strictEqual(Studio.rawToEff(32, 0), 32);
  assert.strictEqual(Studio.rawToEff(32, undefined), 32);
});
