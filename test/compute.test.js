const test = require('node:test');
const assert = require('node:assert');
const { FormEngine } = require('../lib/form-engine.js');

test('_num: strips commas/spaces, NaN -> 0', () => {
  assert.strictEqual(FormEngine._num('1,234.50'), 1234.5);
  assert.strictEqual(FormEngine._num(' 1 000 '), 1000);
  assert.strictEqual(FormEngine._num(''), 0);
  assert.strictEqual(FormEngine._num('abc'), 0);
});

test('_fmt: thousands separators + 2 decimals', () => {
  assert.strictEqual(FormEngine._fmt(1250.5), '1,250.50');
  assert.strictEqual(FormEngine._fmt(37.55), '37.55');
  assert.strictEqual(FormEngine._fmt(0), '0.00');
  assert.strictEqual(FormEngine._fmt(1000000), '1,000,000.00');
});
