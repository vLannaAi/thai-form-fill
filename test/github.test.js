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

function lsWith(token) {
  const s = lsStub();
  if (token) s.setItem('tff:ghtoken', token);
  return s;
}

test('_loadLayout: reads the layout live from the Contents API with the token', async () => {
  global.localStorage = lsWith('ghp_x');
  FormEngine._state.repo = { owner: 'o', name: 'r', branch: 'main' };
  FormEngine._state.formId = '50bis';
  let seen;
  global.fetch = (url, opts) => {
    seen = { url, opts };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ 'field.x': { x: 1, y: 2 } }) });
  };
  await FormEngine._loadLayout();
  assert.match(seen.url, /^https:\/\/api\.github\.com\/repos\/o\/r\/contents\/public\/forms\/50bis\/layout\.json\?ref=main$/);
  assert.strictEqual(seen.opts.headers.Authorization, 'Bearer ghp_x');
  assert.strictEqual(seen.opts.headers.Accept, 'application/vnd.github.raw');
  assert.deepStrictEqual(FormEngine._state.layout, { 'field.x': { x: 1, y: 2 } });
  delete global.fetch; delete global.localStorage;
});

test('_loadLayout: rejects on a failed read (no fallback) so the caller can re-gate', async () => {
  global.localStorage = lsWith('ghp_x');
  FormEngine._state.repo = { owner: 'o', name: 'r', branch: 'main' };
  FormEngine._state.formId = '50bis';
  let calls = 0;
  global.fetch = () => { calls++; return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) }); };
  await assert.rejects(() => FormEngine._loadLayout(), /GitHub read 401/);
  assert.strictEqual(calls, 1, 'no second (deployed) fetch — there is no fallback');
  delete global.fetch; delete global.localStorage;
});
