const test = require('node:test');
const assert = require('node:assert');
const BD = require('../public/lib/buddhist-date.js');

test('beToCe / ceToBe round trip', () => {
  assert.strictEqual(BD.beToCe(2568), 2025);
  assert.strictEqual(BD.ceToBe(2025), 2568);
});

test('guessUnit: >=2400 is BE else CE', () => {
  assert.strictEqual(BD.guessUnit(2568), 'BE');
  assert.strictEqual(BD.guessUnit(2025), 'CE');
});

test('normalizeToBE accepts either unit, returns BE', () => {
  assert.strictEqual(BD.normalizeToBE('2025'), 2568);
  assert.strictEqual(BD.normalizeToBE('2568'), 2568);
  assert.strictEqual(BD.normalizeToBE('abc'), null);
});

test('parseDMY strict format', () => {
  assert.deepStrictEqual(BD.parseDMY('01/02/2568'), { d: 1, m: 2, y: 2568 });
  assert.strictEqual(BD.parseDMY('1/2/2568'), null);
  assert.strictEqual(BD.parseDMY('2568-02-01'), null);
  assert.strictEqual(BD.parseDMY('99/99/2568'), null);
});

test('displayYear converts only for en', () => {
  assert.strictEqual(BD.displayYear('2568', 'en'), '2025');
  assert.strictEqual(BD.displayYear('2568', 'th'), '2568');
  assert.strictEqual(BD.displayYear('', 'en'), '');
});

test('storeYear is inverse of displayYear', () => {
  assert.strictEqual(BD.storeYear('2025', 'en'), '2568');
  assert.strictEqual(BD.storeYear('2568', 'th'), '2568');
});

test('displayDMY converts year only for strict dmy, leaves freeform', () => {
  assert.strictEqual(BD.displayDMY('01/02/2568', 'en'), '01/02/2025');
  assert.strictEqual(BD.displayDMY('01/02/2568', 'th'), '01/02/2568');
  assert.strictEqual(BD.displayDMY('Feb 2568', 'en'), 'Feb 2568');
});

test('storeDMY is inverse for strict dmy', () => {
  assert.strictEqual(BD.storeDMY('01/02/2025', 'en'), '01/02/2568');
  assert.strictEqual(BD.storeDMY('Feb 2025', 'en'), 'Feb 2025');
});
