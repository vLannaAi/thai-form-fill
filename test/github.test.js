const test = require('node:test');
const assert = require('node:assert');
const { FormEngine } = require('../public/lib/form-engine.js');

function lsStub() {
  return {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
}

test('_b64utf8: round-trips ASCII and Thai through base64', () => {
  const a = '{"field.name1":{"x":1,"y":2}}\n';
  assert.strictEqual(Buffer.from(FormEngine._b64utf8(a), 'base64').toString('utf8'), a);
  const t = 'ชื่อ ณ ที่จ่าย';
  assert.strictEqual(Buffer.from(FormEngine._b64utf8(t), 'base64').toString('utf8'), t);
});

test('_contentsUrl: builds the Contents API path from repo + formId', () => {
  const url = FormEngine._contentsUrl({ owner: 'vLannaAI', name: 'thai-form-fill', branch: 'main' }, '50bis');
  assert.strictEqual(url,
    'https://api.github.com/repos/vLannaAI/thai-form-fill/contents/public/forms/50bis/layout.json');
});

test('_needsRetry: only a 409 (stale sha) triggers the LWW retry', () => {
  assert.strictEqual(FormEngine._needsRetry(409), true);
  assert.strictEqual(FormEngine._needsRetry(200), false);
  assert.strictEqual(FormEngine._needsRetry(422), false);
});

test('token storage: set / get / clear via localStorage', () => {
  global.localStorage = lsStub();
  assert.strictEqual(FormEngine._getToken(), '');
  FormEngine._setToken('ghp_abc');
  assert.strictEqual(FormEngine._getToken(), 'ghp_abc');
  FormEngine._clearToken();
  assert.strictEqual(FormEngine._getToken(), '');
  delete global.localStorage;
});
