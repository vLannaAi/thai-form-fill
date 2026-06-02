const test = require('node:test');
const assert = require('node:assert');
const B = require('../lib/baht-text.js');

test('thaiInt: digit, teen, twenty, et (เอ็ด) rules', () => {
  assert.strictEqual(B.thaiInt(0), 'ศูนย์');
  assert.strictEqual(B.thaiInt(1), 'หนึ่ง');
  assert.strictEqual(B.thaiInt(11), 'สิบเอ็ด');
  assert.strictEqual(B.thaiInt(20), 'ยี่สิบ');
  assert.strictEqual(B.thaiInt(21), 'ยี่สิบเอ็ด');
  assert.strictEqual(B.thaiInt(100), 'หนึ่งร้อย');
  assert.strictEqual(B.thaiInt(101), 'หนึ่งร้อยเอ็ด');
});

test('thaiInt: million chunking and เอ็ด after ล้าน', () => {
  assert.strictEqual(B.thaiInt(1000000), 'หนึ่งล้าน');
  assert.strictEqual(B.thaiInt(1000001), 'หนึ่งล้านเอ็ด');
  assert.strictEqual(B.thaiInt(1234567), 'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ด');
});

test('thai: baht + satang, ถ้วน for whole amounts', () => {
  assert.strictEqual(B.thai(100), 'หนึ่งร้อยบาทถ้วน');
  assert.strictEqual(B.thai(1250.5), 'หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์');
  assert.strictEqual(B.thai(0), 'ศูนย์บาทถ้วน');
  assert.strictEqual(B.thai(0.25), 'ยี่สิบห้าสตางค์'); // no baht word when baht == 0
});

test('thai: rounds satang to 2 places', () => {
  assert.strictEqual(B.thai(1.005), 'หนึ่งบาทถ้วน'); // (1.005).toFixed(2) === '1.00' on this runtime
});

test('englishInt: ones, teens, tens-hyphen, scales', () => {
  assert.strictEqual(B.englishInt(0), 'zero');
  assert.strictEqual(B.englishInt(21), 'twenty-one');
  assert.strictEqual(B.englishInt(100), 'one hundred');
  assert.strictEqual(B.englishInt(1250), 'one thousand two hundred fifty');
  assert.strictEqual(B.englishInt(1000000), 'one million');
});

test('english: baht + satang', () => {
  assert.strictEqual(B.english(1250.5), 'one thousand two hundred fifty baht fifty satang');
  assert.strictEqual(B.english(100), 'one hundred baht');
  assert.strictEqual(B.english(0), 'zero baht');
});

test('negative amounts get a sign; sub-baht rounds without spurious sign', () => {
  assert.strictEqual(B.thai(-100), 'ลบหนึ่งร้อยบาทถ้วน');
  assert.strictEqual(B.english(-100), 'minus one hundred baht');
  assert.strictEqual(B.thai(-0.004), 'ศูนย์บาทถ้วน');   // rounds to 0 -> no ลบ
  assert.strictEqual(B.english(-0.004), 'zero baht');   // rounds to 0 -> no minus
});

test('satang-only amounts: thai and english both omit the baht word', () => {
  assert.strictEqual(B.thai(0.01), 'หนึ่งสตางค์');
  assert.strictEqual(B.english(0.25), 'twenty-five satang');
});

test('guards: non-finite / NaN -> empty string', () => {
  assert.strictEqual(B.thai('abc'), '');
  assert.strictEqual(B.english(Infinity), '');
});
