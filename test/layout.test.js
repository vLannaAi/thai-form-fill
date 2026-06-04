const test = require('node:test');
const assert = require('node:assert');
const { FormEngine } = require('../public/lib/form-engine.js');

test('_layoutKey: data-i18n wins, else field.<name>', () => {
  assert.strictEqual(FormEngine._layoutKey({ dataset: { i18n: 'labels.0' } }), 'labels.0');
  assert.strictEqual(FormEngine._layoutKey({ dataset: { i18n: 'paragraphs.2' } }), 'paragraphs.2');
  assert.strictEqual(FormEngine._layoutKey({ dataset: {}, name: 'payer.name' }), 'field.payer.name');
});

test('_scaleOf: vertical scale from a matrix, else 1', () => {
  assert.strictEqual(FormEngine._scaleOf('matrix(0.375, 0, 0, 0.375, 0, 0)'), 0.375);
  assert.strictEqual(FormEngine._scaleOf('matrix(1, 0, 0, 1, 0, 0)'), 1);
  assert.strictEqual(FormEngine._scaleOf('none'), 1);
  assert.strictEqual(FormEngine._scaleOf(''), 1);
});

test('_composeTransform: prepends translate, keeps base unless none', () => {
  assert.strictEqual(FormEngine._composeTransform('matrix(0.375, 0, 0, 0.375, 0, 0)', 5, -3),
    'translate(5px, -3px) matrix(0.375, 0, 0, 0.375, 0, 0)');
  assert.strictEqual(FormEngine._composeTransform('none', 5, -3), 'translate(5px, -3px)');
  assert.strictEqual(FormEngine._composeTransform('', 0, 0), 'translate(0px, 0px)');
});
