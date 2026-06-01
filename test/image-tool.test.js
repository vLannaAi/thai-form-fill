const test = require('node:test');
const assert = require('node:assert');
const IT = require('../lib/image-tool.js');

function px(r, g, b, a) { return [r, g, b, a]; }

test('makeTransparent zeroes alpha for near-white pixels above threshold', () => {
  // two pixels: white (255,255,255) and black (0,0,0)
  const data = new Uint8ClampedArray([...px(255,255,255,255), ...px(0,0,0,255)]);
  const imageData = { data, width: 2, height: 1 };
  IT.makeTransparent(imageData, 240);
  assert.strictEqual(imageData.data[3], 0);   // white -> transparent
  assert.strictEqual(imageData.data[7], 255); // black -> opaque
});

test('makeTransparent threshold boundary is inclusive', () => {
  const data = new Uint8ClampedArray([...px(240,240,240,255)]);
  const imageData = { data, width: 1, height: 1 };
  IT.makeTransparent(imageData, 240);
  assert.strictEqual(imageData.data[3], 0);
});

test('makeTransparent leaves a colored pixel opaque', () => {
  const data = new Uint8ClampedArray([...px(250,10,10,255)]);
  const imageData = { data, width: 1, height: 1 };
  IT.makeTransparent(imageData, 240);
  assert.strictEqual(imageData.data[3], 255);
});
