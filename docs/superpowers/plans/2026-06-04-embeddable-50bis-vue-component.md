# Embeddable 50 Bis Vue Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@lanna/form-50bis`, a chromeless Vue 3 component that lets a host app interactively fill a 50 Bis withholding-tax certificate, exchanging data through the project's JSON Schema and printing the certificate in isolation.

**Architecture:** Approach C — add an "embedded mode" to the existing `public/lib/form-engine.js` (scope its DOM queries to an injected `root`, inject baked `layout`/`strings`, skip token/GitHub/IndexedDB/Studio). A new in-repo package `packages/form-50bis/` bundles the engine + pure libs + baked assets behind a Vue SFC. A pure `schemaAdapter` maps the JSON Schema ⇄ the form's dotted field names (already 1:1 after the rename). Single embedded instance per page in v1 (engine uses a module-level singleton `state`).

**Tech Stack:** Vanilla JS engine (CommonJS-loaded for tests via `public/lib/package.json` `{"type":"commonjs"}`), Vue 3.5 (already in `node_modules`, peer dep of the package), Vite library mode (bin already present), Node test runner (`node --test`), Playwright MCP for the browser smoke.

---

## File Structure

**Modified (engine — backward compatible; standalone app passes `root=document`, `embedded=false`):**
- `public/lib/form-engine.js` — add `ROOT`/`EMBEDDED` module vars + `qs`/`qsa`/`classRoot` helpers; replace `document.*` queries with them; embedded branch in `init()`; `onChange` hook; expose `_restore`. ~30 query sites + init.

**New package `packages/form-50bis/`:**
- `package.json` — name `@lanna/form-50bis`, `vue` peer dep, Vite build, `exports`.
- `vite.config.js` — library mode (ESM), externalize `vue`.
- `package.json` (nested) stays type:module for the package; tests use `.cjs`.
- `scripts/build-assets.cjs` — generate scoped CSS + extracted markup + copy assets from `public/forms/50bis/` into `src/generated/`.
- `src/schemaAdapter.js` — pure `toFields(data)` / `toData(fields)`.
- `src/print.js` — `printIsolated(rootEl, cssText)` off-screen-iframe print.
- `src/Form50Bis.vue` — the SFC (props/events/exposed methods).
- `src/index.js` — package entry (loads libs+engine in order, exports component).
- `src/generated/markup.js` — exported HTML string (overlay + background), generated.
- `src/generated/form.scoped.css` — scoped stylesheet, generated.
- `src/generated/strings.json`, `layout.json`, `assets/background.svg`, `assets/fonts/*.woff2` — generated/copied.
- `src/types.d.ts` — `Form50BisInput` type.
- `test/schemaAdapter.test.cjs` — round-trip unit tests.
- `test/smoke.mjs` — Playwright integration (run via the MCP harness or `node`).
- `examples/host/App.vue` — minimal usage example (docs).
- `README.md` — usage.

**Reused as-is (imported by the package):** `public/lib/baht-text.js`, `public/lib/buddhist-date.js`, `docs/50bis-input.schema.json`.

---

## Task 1: `schemaAdapter` — pure data ⇄ fields mapping

**Files:**
- Create: `packages/form-50bis/src/schemaAdapter.js`
- Test: `packages/form-50bis/test/schemaAdapter.test.cjs`

The form fields use dotted names equal to the schema leaf paths, EXCEPT three encodings the adapter must handle: (a) `payer.taxId`/`payee.taxId` 13-digit string ↔ segments `.1..5` with sizes `[1,4,5,2,1]`; `legacyTaxId` 10-digit ↔ `.1..4` sizes `[1,4,4,1]`; (b) `withholdingReturn.formType` enum ↔ one-hot checkbox `withholdingReturn.formType.<value>` = `'1'`; `taxPaymentCondition.condition` enum ↔ `taxPaymentCondition.<value>` = `'1'`; (c) `income` array index → `income.<i>.<field>`. Amounts are numbers in the schema, strings in fields.

- [ ] **Step 1: Write the failing test**

```js
// packages/form-50bis/test/schemaAdapter.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { toFields, toData } = require('../src/schemaAdapter.js');

const sample = {
  certificate: { bookNumber: '1', number: '123' },
  payer: { taxId: '0105556012345', name: 'Lanna Tech Co., Ltd.', address: '123 Rd' },
  payee: { taxId: '1100987654321', legacyTaxId: '1234567890', name: 'Mr. Somchai', address: '456 Moo 7' },
  withholdingReturn: { formType: 'pnd1a', sequenceNumber: '1' },
  income: [{ datePaid: '31 Dec 2026', amountPaid: 600000, taxWithheld: 30000 }],
  funds: { socialSecurity: 9000 },
  taxPaymentCondition: { condition: 'withheldFromPayment' },
  issueDate: { day: '31', month: 'December', yearBE: '2569' },
};

test('toFields: TIN segmented, enums one-hot, income indexed, amounts stringified', () => {
  const f = toFields(sample);
  assert.strictEqual(f['payer.taxId.1'], '0');
  assert.strictEqual(f['payer.taxId.2'], '1055');
  assert.strictEqual(f['payer.taxId.3'], '56012');
  assert.strictEqual(f['payer.taxId.4'], '34');
  assert.strictEqual(f['payer.taxId.5'], '5');
  assert.strictEqual(f['payee.legacyTaxId.4'], '0');
  assert.strictEqual(f['withholdingReturn.formType.pnd1a'], '1');
  assert.strictEqual(f['taxPaymentCondition.withheldFromPayment'], '1');
  assert.strictEqual(f['income.0.amountPaid'], '600000');
  assert.strictEqual(f['payer.name'], 'Lanna Tech Co., Ltd.');
  assert.strictEqual(f['issueDate.yearBE'], '2569');
});

test('round-trip: toData(toFields(x)) preserves the populated data', () => {
  const back = toData(toFields(sample));
  assert.strictEqual(back.payer.taxId, '0105556012345');
  assert.strictEqual(back.payee.legacyTaxId, '1234567890');
  assert.strictEqual(back.withholdingReturn.formType, 'pnd1a');
  assert.strictEqual(back.taxPaymentCondition.condition, 'withheldFromPayment');
  assert.strictEqual(back.income[0].amountPaid, 600000);
  assert.strictEqual(back.certificate.bookNumber, '1');
  assert.strictEqual(back.issueDate.month, 'December');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test packages/form-50bis/test/schemaAdapter.test.cjs`
Expected: FAIL — `Cannot find module '../src/schemaAdapter.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// packages/form-50bis/src/schemaAdapter.js
// Pure mapping between the JSON-Schema input shape and the form's dotted field names.
// No DOM, no Vue — unit-testable in Node.
const TIN_SIZES = [1, 4, 5, 2, 1];        // payer/payee.taxId  (13 digits)
const LEGACY_SIZES = [1, 4, 4, 1];        // payer/payee.legacyTaxId (10 digits)
const FORM_TYPES = ['pnd1a', 'pnd1aSpecial', 'pnd2', 'pnd3', 'pnd2a', 'pnd3a', 'pnd53'];
const CONDITIONS = ['withheldFromPayment', 'paidByPayerRecurring', 'paidByPayerOnce', 'other'];
const INCOME_ROWS = 14;

function splitDigits(value, sizes, prefix, out) {
  var s = String(value || '');
  for (var i = 0, pos = 0; i < sizes.length; i++) { out[prefix + (i + 1)] = s.substr(pos, sizes[i]); pos += sizes[i]; }
}
function joinDigits(fields, sizes, prefix) {
  var s = '';
  for (var i = 0; i < sizes.length; i++) s += (fields[prefix + (i + 1)] || '');
  return s;
}
function numToStr(v) { return v == null || v === '' ? '' : String(v); }
function strToNum(v) { if (v == null || String(v).trim() === '') return undefined; var n = Number(String(v).replace(/[, ]/g, '')); return isNaN(n) ? undefined : n; }

function toFields(data) {
  data = data || {};
  var f = {};
  var c = data.certificate || {};
  if (c.bookNumber != null) f['certificate.bookNumber'] = String(c.bookNumber);
  if (c.number != null) f['certificate.number'] = String(c.number);

  ['payer', 'payee'].forEach(function (party) {
    var p = data[party] || {};
    if (p.taxId != null) splitDigits(p.taxId, TIN_SIZES, party + '.taxId.', f);
    if (p.legacyTaxId != null) splitDigits(p.legacyTaxId, LEGACY_SIZES, party + '.legacyTaxId.', f);
    if (p.name != null) f[party + '.name'] = String(p.name);
    if (p.address != null) f[party + '.address'] = String(p.address);
  });

  var wr = data.withholdingReturn || {};
  if (wr.sequenceNumber != null) f['withholdingReturn.sequenceNumber'] = String(wr.sequenceNumber);
  if (wr.formType) f['withholdingReturn.formType.' + wr.formType] = '1';

  (data.income || []).forEach(function (row, i) {
    if (!row) return;
    if (row.datePaid != null) f['income.' + i + '.datePaid'] = String(row.datePaid);
    if (row.amountPaid != null) f['income.' + i + '.amountPaid'] = numToStr(row.amountPaid);
    if (row.taxWithheld != null) f['income.' + i + '.taxWithheld'] = numToStr(row.taxWithheld);
    if (row.specify != null) f['income.' + i + '.specify'] = String(row.specify);
  });

  var fu = data.funds || {};
  if (fu.governmentPension != null) f['funds.governmentPension'] = numToStr(fu.governmentPension);
  if (fu.socialSecurity != null) f['funds.socialSecurity'] = numToStr(fu.socialSecurity);
  if (fu.provident != null) f['funds.provident'] = numToStr(fu.provident);

  var tc = data.taxPaymentCondition || {};
  if (tc.condition) f['taxPaymentCondition.' + tc.condition] = '1';
  if (tc.otherDetail != null) f['taxPaymentCondition.otherDetail'] = String(tc.otherDetail);

  var d = data.issueDate || {};
  if (d.day != null) f['issueDate.day'] = String(d.day);
  if (d.month != null) f['issueDate.month'] = String(d.month);
  if (d.yearBE != null) f['issueDate.yearBE'] = String(d.yearBE);
  return f;
}

function toData(fields) {
  fields = fields || {};
  var get = function (k) { return fields[k]; };
  var data = {
    certificate: { bookNumber: get('certificate.bookNumber') || '', number: get('certificate.number') || '' },
    payer: {}, payee: {},
    withholdingReturn: {},
    income: [],
    funds: {},
    taxPaymentCondition: {},
    issueDate: { day: get('issueDate.day') || '', month: get('issueDate.month') || '', yearBE: get('issueDate.yearBE') || '' },
  };
  ['payer', 'payee'].forEach(function (party) {
    data[party] = {
      taxId: joinDigits(fields, TIN_SIZES, party + '.taxId.'),
      legacyTaxId: joinDigits(fields, LEGACY_SIZES, party + '.legacyTaxId.'),
      name: get(party + '.name') || '',
      address: get(party + '.address') || '',
    };
  });
  data.withholdingReturn.sequenceNumber = get('withholdingReturn.sequenceNumber') || '';
  data.withholdingReturn.formType = FORM_TYPES.find(function (t) { return get('withholdingReturn.formType.' + t) === '1'; }) || undefined;
  for (var i = 0; i < INCOME_ROWS; i++) {
    data.income.push({
      datePaid: get('income.' + i + '.datePaid') || '',
      amountPaid: strToNum(get('income.' + i + '.amountPaid')),
      taxWithheld: strToNum(get('income.' + i + '.taxWithheld')),
      specify: get('income.' + i + '.specify'),
    });
  }
  data.funds = {
    governmentPension: strToNum(get('funds.governmentPension')),
    socialSecurity: strToNum(get('funds.socialSecurity')),
    provident: strToNum(get('funds.provident')),
  };
  data.taxPaymentCondition.condition = CONDITIONS.find(function (cc) { return get('taxPaymentCondition.' + cc) === '1'; }) || undefined;
  data.taxPaymentCondition.otherDetail = get('taxPaymentCondition.otherDetail') || '';
  return data;
}

module.exports = { toFields: toFields, toData: toData, FORM_TYPES: FORM_TYPES, CONDITIONS: CONDITIONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test packages/form-50bis/test/schemaAdapter.test.cjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/form-50bis/src/schemaAdapter.js packages/form-50bis/test/schemaAdapter.test.cjs
git commit -m "feat(form-50bis): schema<->fields adapter with round-trip tests"
```

---

## Task 2: Engine embedded mode — root scoping + injected layout/strings + onChange

**Files:**
- Modify: `public/lib/form-engine.js`

Add module-level `ROOT`/`EMBEDDED`/`onChange` and helpers; route DOM queries through them; add an embedded branch to `init()`; expose `_restore`. Keep the standalone path identical (defaults `ROOT=document`, `EMBEDDED=false`).

- [ ] **Step 1: Add scoping helpers (top of IIFE, after `state`)**

Insert after the `var state = {...}` block (around line 8):

```js
  // Embedded mode: scope all DOM access to a root element so the form can live inside a host app.
  // Standalone app passes nothing -> ROOT=document, EMBEDDED=false (unchanged behavior).
  var ROOT = (typeof document !== 'undefined') ? document : null;
  var EMBEDDED = false;
  function qs(sel) { return ROOT.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(ROOT.querySelectorAll(sel)); }
  function byId(id) { return ROOT.querySelector('#' + id); }
  function classRoot() { return EMBEDDED ? ROOT : document.body; } // lang-en / show-fields toggles
```

- [ ] **Step 2: Replace document queries with helpers**

In `public/lib/form-engine.js`, make these exact replacements (every occurrence):
- `document.querySelectorAll(` → `qsa(` for the array-returning sites at the original lines: `fields()` (`.page input`), `applyStrings` (`[data-i18n]`), `selectable()`, `recompute()` (both `data-compute` sites), `applyLangText` (`[data-th][data-en]`), `fitEnglish` (`.enlbl`), `fillSample`/`finishLoad` money passes, `resetAll` (`.slot`, `.slot-size`), `renderNumBadges` label/paragraph/input loops, `renderGrid`. (`qsa` returns a real array, so drop the `Array.prototype.slice.call(...)` wrapper where present.)
- `document.querySelector(` → `qs(` for: `pfRect`, `elForKey` (both), `showTokenGate` (`.token-gate`), `recompute` words `ref`, `byName` in `defaultIssueDate`, `fillSample` setter, `wireTin` segment lookup, the `renderNumBadges`/`renderGrid` `.pf` lookups.
- `document.getElementById('X')` → `byId('X')` for: `num-badges`, `studio-grid`, `langBtn`, `storeWarn`, `console`.
- `document.body.classList` → `classRoot().classList` in `setLang` (`lang-en` toggle), `bindConsole` (`toggleFields`), `finishLoad` (`show-fields` add), and `collect()` (`document.body.classList.contains('show-fields')` → `classRoot().classList.contains('show-fields')`).
- Guard standalone-only globals in embedded mode: in `setLang`, wrap `document.documentElement.lang = lang;` and `document.dispatchEvent(new Event('form-relayout'));` as `if (!EMBEDDED) { document.documentElement.lang = lang; document.dispatchEvent(new Event('form-relayout')); }`.

Leave `document.createElement(...)`, `document.body.appendChild(g)` (token gate, standalone-only), and `document.fonts` as-is (created/global, only run in standalone or harmless).

- [ ] **Step 3: Add the embedded branch + onChange + `_restore` export**

Replace the current `init(opts)` body up to `bindConsole();` (lines ~424-434) with:

```js
  function init(opts) {
    state.formId = opts.formId;
    ROOT = opts.root || (typeof document !== 'undefined' ? document : null);
    EMBEDDED = !!opts.embedded;
    state.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    if (EMBEDDED) {
      // Baked layout + strings, no token/GitHub/IndexedDB/Studio.
      state.layout = opts.layout || {};
      if (opts.strings) applyStrings(opts.strings);
      wireFields();
      restore(opts.data || {});
      recompute();
      qsa('.page input.money').forEach(formatMoney);
      setLang(opts.lang || 'th');
      var go = function () { fitEnglish(); captureLayoutBaselines(); applyLayout(); };
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
      return;
    }

    state.repo = opts.repo;
    if (!getToken() || !state.repo) { showTokenGate(); return; }
    bindConsole();
    wireFields();
    wireTin('payer.taxId.', [1, 4, 5, 2, 1]);
    wireTin('payee.taxId.', [1, 4, 5, 2, 1]);
    wireTin('payer.legacyTaxId.', [1, 4, 4, 1]);
    wireTin('payee.legacyTaxId.', [1, 4, 4, 1]);
    loadLayout().then(function () { finishLoad(opts); }, function () {
      clearToken();
      showTokenGate('Token invalid, expired, or lacks access to this repo — try another.');
    });
  }
```

Extract the field-listener loop (currently inline in `init`) and the TIN wiring into a `wireFields()` function so both branches share it. Add after `init`:

```js
  function wireFields() {
    fields().forEach(function (el) {
      el.addEventListener('focus', function () { unformatMoney(el); });
      el.addEventListener('input', function () { recompute(); afterEdit(); });
      el.addEventListener('change', function () { formatMoney(el); recompute(); afterEdit(); });
      el.addEventListener('blur', function () { formatMoney(el); recompute(); afterEdit(); });
    });
    if (EMBEDDED) {
      wireTin('payer.taxId.', [1, 4, 5, 2, 1]);
      wireTin('payee.taxId.', [1, 4, 5, 2, 1]);
      wireTin('payer.legacyTaxId.', [1, 4, 4, 1]);
      wireTin('payee.legacyTaxId.', [1, 4, 4, 1]);
    }
  }
  // Standalone persists to IndexedDB; embedded notifies the host via onChange.
  function afterEdit() { if (EMBEDDED) { if (state.onChange) state.onChange(collect()); } else { scheduleSave(); } }
```

Then change the standalone listener block that previously called `scheduleSave()` directly so it routes through `afterEdit()` (the standalone `wireFields` adds the same listeners; `scheduleSave` still runs via `afterEdit`'s else branch). Add `_restore: restore` and `_afterEdit: afterEdit` to the `root.FormEngine = {…}` export object.

- [ ] **Step 4: Run the standalone regression suite**

Run: `node --test test/`
Expected: PASS — all 34 existing tests still green (engine still loads; `_layoutKey` etc. unchanged).

- [ ] **Step 5: Smoke the standalone form locally (no behavior change)**

Run: `curl -s http://localhost:3000/lib/form-engine.js | grep -c "function wireFields"` → expect `1`.
Then reload the live/dev standalone 50bis form and confirm it still renders + sample-fills (manual). Expected: unchanged.

- [ ] **Step 6: Commit**

```bash
git add public/lib/form-engine.js
git commit -m "feat(engine): embedded mode (root scoping, injected layout/strings, onChange)"
```

---

## Task 3: Build-assets script — scoped CSS, extracted markup, copied assets, self-hosted fonts

**Files:**
- Create: `packages/form-50bis/scripts/build-assets.cjs`
- Generates into: `packages/form-50bis/src/generated/`

Scope every selector under `.tff-50bis`, rewrite `body.lang-en`/`body.show-fields` → `.tff-50bis.lang-en`/`.tff-50bis.show-fields`, replace the Google-Fonts `@import` with bundled `@font-face`, and rewrite `assets/...` URLs to the packaged copy. Extract the overlay+background markup (`#ov` block and the `.pc` background block) from `index.html` into an exported string.

- [ ] **Step 1: Write the build script**

```js
// packages/form-50bis/scripts/build-assets.cjs
const fs = require('fs');
const path = require('path');
const FORM = path.resolve(__dirname, '../../../public/forms/50bis');
const LIB = path.resolve(__dirname, '../../../public/lib');
const OUT = path.resolve(__dirname, '../src/generated');
fs.mkdirSync(path.join(OUT, 'assets/fonts'), { recursive: true });

// 1) scoped CSS: prefix selectors, rewrite body.* and the engine.css too.
function scope(css) {
  // drop the Google Fonts @import (fonts are self-hosted; @font-face appended below)
  css = css.replace(/@import url\([^)]*fonts\.googleapis[^)]*\);?/g, '');
  // body.lang-en / body.show-fields -> .tff-50bis variants
  css = css.replace(/\bbody\.lang-en\b/g, '.tff-50bis.lang-en')
           .replace(/\bbody\.show-fields\b/g, '.tff-50bis.show-fields')
           .replace(/\bbody\b(?=\s*\{)/g, '.tff-50bis');
  // prefix top-level selectors that start with #ov/#txt/.pf/.page/.t/.pc/.slot etc.
  // Simple, robust approach: prefix every selector in every rule with `.tff-50bis `.
  return css.replace(/(^|\})\s*([^{}@]+)\{/g, function (m, brace, sel) {
    if (/^\s*@/.test(sel)) return m; // at-rules untouched here
    var scoped = sel.split(',').map(function (s) {
      s = s.trim(); if (!s) return s;
      return '.tff-50bis ' + s;
    }).join(', ');
    return brace + '\n.tff-50bis-rule ' .slice(0,0) + scoped + ' {'; // keep formatting simple
  });
}
var formCss = fs.readFileSync(path.join(FORM, 'form.css'), 'utf8');
var engineCss = fs.readFileSync(path.join(LIB, 'engine.css'), 'utf8');
var fontFace = [
  "@font-face{font-family:'JetBrains Mono';font-weight:400;src:url('./assets/fonts/jetbrains-400.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'JetBrains Mono';font-weight:700;src:url('./assets/fonts/jetbrains-700.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'Sarabun';font-weight:400;src:url('./assets/fonts/sarabun-400.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'Sarabun';font-weight:600;src:url('./assets/fonts/sarabun-600.woff2') format('woff2');font-display:swap;}",
].join('\n');
var scoped = fontFace + '\n' + scope(formCss) + '\n' + scope(engineCss);
scoped = scoped.replace(/url\(\s*['"]?assets\//g, "url('./assets/"); // background.svg etc.
fs.writeFileSync(path.join(OUT, 'form.scoped.css'), scoped);

// 2) extract markup: the #ov overlay + its sibling .pc background block live in #pf1.
var html = fs.readFileSync(path.join(FORM, 'index.html'), 'utf8');
var m = html.match(/<div id="pf1"[\s\S]*?<\/div>\s*<div class="pi"[\s\S]*?<\/div>\s*<\/div>/);
if (!m) throw new Error('could not locate #pf1 block in index.html');
var markup = m[0].replace(/src="assets\//g, "src=\"\" data-asset=\"assets/"); // assets resolved at runtime
fs.writeFileSync(path.join(OUT, 'markup.js'),
  'export const MARKUP = ' + JSON.stringify(m[0]) + ';\n');

// 3) copy data assets
fs.copyFileSync(path.join(FORM, 'strings.json'), path.join(OUT, 'strings.json'));
fs.copyFileSync(path.join(FORM, 'layout.json'), path.join(OUT, 'layout.json'));
fs.copyFileSync(path.join(FORM, 'assets/background.svg'), path.join(OUT, 'assets/background.svg'));

console.log('build-assets: wrote form.scoped.css, markup.js, strings.json, layout.json, background.svg');
console.log('NOTE: place the 4 woff2 files in src/generated/assets/fonts/ (jetbrains-400/700, sarabun-400/600).');
```

> The `scope()` regex prefixes every rule selector with `.tff-50bis `. Review the generated `form.scoped.css` once by eye; if any `@media`/`@font-face` inner block double-prefixes, adjust the regex to skip rules inside at-rule braces. (The standalone `@media print` rules become `.tff-50bis ...` inside `@media print` — correct.)

- [ ] **Step 2: Run it**

Run: `node packages/form-50bis/scripts/build-assets.cjs`
Expected: writes files; prints the woff2 reminder.

- [ ] **Step 3: Add the four woff2 font files**

Download the woff2 for JetBrains Mono (400, 700) and Sarabun (400, 600) and save as `packages/form-50bis/src/generated/assets/fonts/jetbrains-400.woff2`, `jetbrains-700.woff2`, `sarabun-400.woff2`, `sarabun-600.woff2`. (Source: the same Google Fonts the standalone uses; fetch the woff2 the CSS2 API serves. Document the exact URLs in the package README.)

Run: `ls packages/form-50bis/src/generated/assets/fonts/` → expect 4 `.woff2` files.

- [ ] **Step 4: Verify scoped CSS sanity**

Run: `grep -c "\.tff-50bis" packages/form-50bis/src/generated/form.scoped.css` → expect a large count (every rule).
Run: `grep -c "fonts.googleapis" packages/form-50bis/src/generated/form.scoped.css` → expect `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/form-50bis/scripts/build-assets.cjs packages/form-50bis/src/generated
git commit -m "build(form-50bis): scoped CSS + extracted markup + bundled assets/fonts"
```

---

## Task 4: `print.js` — isolated print via off-screen iframe

**Files:**
- Create: `packages/form-50bis/src/print.js`

- [ ] **Step 1: Implement**

```js
// packages/form-50bis/src/print.js
// Print ONLY the certificate by cloning the form root + its CSS into an off-screen iframe
// and printing that. Isolates from host page chrome and host print stylesheets.
export function printIsolated(rootEl, cssText) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + cssText +
            '</style></head><body class="tff-50bis"></body></html>');
  doc.close();
  // move a deep clone of the form into the iframe body
  doc.body.appendChild(doc.importNode(rootEl, true));
  const win = iframe.contentWindow;
  const cleanup = () => { setTimeout(() => iframe.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  // give fonts a tick, then print
  const run = () => { win.focus(); win.print(); };
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(run); else setTimeout(run, 150);
  // fallback cleanup if afterprint never fires
  setTimeout(cleanup, 60000);
}
```

- [ ] **Step 2: (Verified later via the Playwright smoke in Task 7.)**

No standalone unit test (needs a browser); the Task 7 smoke asserts the iframe is created and contains the certificate. Mark this step done after Task 7 passes.

- [ ] **Step 3: Commit**

```bash
git add packages/form-50bis/src/print.js
git commit -m "feat(form-50bis): isolated iframe print helper"
```

---

## Task 5: `Form50Bis.vue` + package entry + types

**Files:**
- Create: `packages/form-50bis/src/Form50Bis.vue`
- Create: `packages/form-50bis/src/index.js`
- Create: `packages/form-50bis/src/types.d.ts`

- [ ] **Step 1: Write the SFC**

```vue
<!-- packages/form-50bis/src/Form50Bis.vue -->
<template>
  <div ref="rootEl" class="tff-50bis"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { toFields, toData } from './schemaAdapter.js';
import { printIsolated } from './print.js';
import { MARKUP } from './generated/markup.js';
import layout from './generated/layout.json';
import strings from './generated/strings.json';
import cssText from './generated/form.scoped.css?inline';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  language: { type: String, default: 'th' },        // 'th' | 'en'
  signature: { type: String, default: '' },          // data URL
  stamp: { type: String, default: '' },              // data URL
  showFieldOutlines: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'change']);

const rootEl = ref(null);
let FE = null;          // FormEngine (loaded lazily so libs attach to window first)
let debounce = null;
let suppress = false;   // ignore self-induced modelValue echoes

function resolveAssets(el) {
  el.querySelectorAll('img.bf').forEach((img) => { img.src = new URL('./generated/assets/background.svg', import.meta.url).href; });
}
function totalsFromFields(fields) {
  return { amountPaid: fields['totals.amountPaid'] || '', taxWithheld: fields['totals.taxWithheld'] || '', taxInWords: fields['totals.taxInWords'] || '' };
}

onMounted(async () => {
  rootEl.value.innerHTML = MARKUP;
  resolveAssets(rootEl.value);
  rootEl.value.classList.toggle('show-fields', props.showFieldOutlines);
  ({ FormEngine: FE } = await import('./engine-bundle.js')); // libs + engine, see index.js note
  FE.init({
    root: rootEl.value, embedded: true, formId: '50bis',
    layout, strings, lang: props.language,
    data: toFields(props.modelValue),
    onChange(fields) {
      suppress = true;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        emit('update:modelValue', toData(fields));
        emit('change', { data: toData(fields), totals: totalsFromFields(fields) });
        suppress = false;
      }, 300);
    },
  });
});

watch(() => props.modelValue, (v) => {
  if (suppress || !FE) return;
  FE._restore(toFields(v)); FE._recompute();
}, { deep: true });
watch(() => props.language, (l) => { if (FE) FE._setLang(l); });
watch(() => props.showFieldOutlines, (b) => { rootEl.value && rootEl.value.classList.toggle('show-fields', b); });

onBeforeUnmount(() => { clearTimeout(debounce); });

defineExpose({
  print() { printIsolated(rootEl.value, cssText); },
  getResult() { const f = FE ? FE._collect() : {}; return { data: toData(f), totals: totalsFromFields(f) }; },
  setLanguage(l) { FE && FE._setLang(l); },
});
</script>

<style>
/* The scoped form stylesheet is injected via ?inline import + a runtime <style> in index.js. */
</style>
```

- [ ] **Step 2: Write the package entry + engine bundle glue**

```js
// packages/form-50bis/src/engine-bundle.js
// Load order matters: the UMD libs attach to window (root.BahtText/BuddhistDate),
// THEN form-engine reads them at its own load time.
import '../../../public/lib/baht-text.js';
import '../../../public/lib/buddhist-date.js';
import '../../../public/lib/form-engine.js';
export const FormEngine = (typeof window !== 'undefined' ? window : globalThis).FormEngine;
```

```js
// packages/form-50bis/src/index.js
import { defineAsyncComponent } from 'vue';
import cssText from './generated/form.scoped.css?inline';
import Form50Bis from './Form50Bis.vue';

// Inject the scoped stylesheet once when the module loads in a browser.
if (typeof document !== 'undefined' && !document.getElementById('tff-50bis-styles')) {
  const s = document.createElement('style');
  s.id = 'tff-50bis-styles';
  s.textContent = cssText;
  document.head.appendChild(s);
}
export { Form50Bis };
export default Form50Bis;
```

> The libs are CommonJS (UMD). Vite handles CJS interop; if the dev build complains, add `@rollup/plugin-commonjs` or pre-wrap the three libs. Confirm in Task 6’s build.

- [ ] **Step 3: Write the types**

```ts
// packages/form-50bis/src/types.d.ts
export interface IncomeRow { datePaid?: string; amountPaid?: number; taxWithheld?: number; specify?: string; }
export interface Form50BisInput {
  certificate?: { bookNumber?: string; number?: string };
  payer: { taxId: string; legacyTaxId?: string; name: string; address: string };
  payee: { taxId?: string; legacyTaxId?: string; name: string; address: string };
  withholdingReturn: { formType: 'pnd1a'|'pnd1aSpecial'|'pnd2'|'pnd3'|'pnd2a'|'pnd3a'|'pnd53'; sequenceNumber?: string };
  income: IncomeRow[];
  funds?: { governmentPension?: number; socialSecurity?: number; provident?: number };
  taxPaymentCondition: { condition: 'withheldFromPayment'|'paidByPayerRecurring'|'paidByPayerOnce'|'other'; otherDetail?: string };
  issueDate: { day: string; month: string; yearBE: string };
}
```

- [ ] **Step 4: Expose `_recompute`/`_setLang`/`_collect`/`_restore`**

Confirm `public/lib/form-engine.js` exports include `_recompute`, `_setLang`, `_collect`, `_restore` (add `_restore` if missing — see Task 2 Step 3). These are the surface the SFC uses.

Run: `node -e "const {FormEngine}=require('./public/lib/form-engine.js'); console.log(['_recompute','_setLang','_collect','_restore'].every(k=>k in FormEngine))"`
Expected: `true`.

- [ ] **Step 5: Commit**

```bash
git add packages/form-50bis/src/Form50Bis.vue packages/form-50bis/src/index.js packages/form-50bis/src/engine-bundle.js packages/form-50bis/src/types.d.ts public/lib/form-engine.js
git commit -m "feat(form-50bis): Vue SFC, package entry, types"
```

---

## Task 6: Package manifest + Vite library build

**Files:**
- Create: `packages/form-50bis/package.json`
- Create: `packages/form-50bis/vite.config.js`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@lanna/form-50bis",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/form-50bis.umd.cjs",
  "module": "./dist/form-50bis.js",
  "types": "./src/types.d.ts",
  "exports": {
    ".": { "types": "./src/types.d.ts", "import": "./dist/form-50bis.js", "require": "./dist/form-50bis.umd.cjs" }
  },
  "files": ["dist", "src/types.d.ts"],
  "scripts": {
    "prebuild": "node scripts/build-assets.cjs",
    "build": "vite build",
    "test": "node --test test/schemaAdapter.test.cjs"
  },
  "peerDependencies": { "vue": "^3.4.0" },
  "devDependencies": { "@vitejs/plugin-vue": "^5.0.0", "vite": "^5.0.0" }
}
```

- [ ] **Step 2: Write vite.config.js**

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: resolve(__dirname, 'src/index.js'), name: 'Form50Bis', fileName: 'form-50bis' },
    rollupOptions: { external: ['vue'], output: { globals: { vue: 'Vue' } } },
    assetsInlineLimit: 0, // keep fonts/svg as files
  },
});
```

- [ ] **Step 3: Install package devDeps and build**

Run: `cd packages/form-50bis && npm install`
Run: `cd packages/form-50bis && npm run build`
Expected: `dist/form-50bis.js` (+ assets) produced with no errors. If the CJS libs fail to bundle, add `@rollup/plugin-commonjs` to `vite.config.js` and re-run.

- [ ] **Step 4: Commit**

```bash
git add packages/form-50bis/package.json packages/form-50bis/vite.config.js packages/form-50bis/package-lock.json
git commit -m "build(form-50bis): vite library build + manifest"
```

---

## Task 7: Browser integration smoke (Playwright)

**Files:**
- Create: `packages/form-50bis/examples/host/index.html`
- Create: `packages/form-50bis/test/smoke.mjs`

- [ ] **Step 1: Minimal host harness**

```html
<!-- packages/form-50bis/examples/host/index.html -->
<!doctype html><html><head><meta charset="utf-8"></head>
<body>
<div id="app"></div>
<script type="module">
  import { createApp, h, ref } from 'vue';
  import Form50Bis from '../../src/index.js';
  const data = ref({
    payer: { taxId: '0105556012345', name: 'Lanna Tech Co., Ltd.', address: '123 Rd' },
    payee: { taxId: '1100987654321', name: 'Mr. Somchai', address: '456 Moo 7' },
    withholdingReturn: { formType: 'pnd1a', sequenceNumber: '1' },
    income: [{ datePaid: '31 Dec 2026', amountPaid: 600000, taxWithheld: 30000 }],
    taxPaymentCondition: { condition: 'withheldFromPayment' },
    issueDate: { day: '31', month: 'December', yearBE: '2569' },
  });
  const form = ref(null);
  createApp({ render: () => h(Form50Bis, { ref: form, modelValue: data.value, language: 'en',
    'onUpdate:modelValue': v => { window.__lastData = v; } }) }).mount('#app');
  window.__getResult = () => form.value.getResult();
  window.__print = () => form.value.print();
</script>
</body></html>
```

- [ ] **Step 2: Smoke via the Playwright MCP harness**

Serve the example over Vite dev (`cd packages/form-50bis && npx vite --port 5300`) and drive a browser (reuse the `browser_run_code_unsafe` harness pattern from this session):
- Navigate to `http://localhost:5300/examples/host/index.html`.
- Assert `#app .tff-50bis input[name="payer.name"]` has value `Lanna Tech Co., Ltd.`.
- Assert `input[name="payer.taxId.3"]` value is `56012` (TIN split worked).
- Assert `input[name="totals.taxWithheld"]` shows `30,000.00` (recompute ran).
- Type into `payer.name`, blur, then read `window.__lastData.payer.name` — assert it updated (round-trip out).
- Call `window.__print()`, then assert an `iframe` exists whose body contains `.tff-50bis .page` (print isolation).

Record expected: all assertions pass; capture a screenshot for visual confirmation of overlay alignment.

- [ ] **Step 3: Commit**

```bash
git add packages/form-50bis/examples packages/form-50bis/test/smoke.mjs
git commit -m "test(form-50bis): browser integration smoke + host example"
```

---

## Task 8: README + spec correction

**Files:**
- Create: `packages/form-50bis/README.md`
- Modify: `docs/superpowers/specs/2026-06-04-embeddable-50bis-vue-component-design.md`

- [ ] **Step 1: README** — usage (`npm i @lanna/form-50bis vue`), `<Form50Bis v-model="data" :language>`, `ref.print()/getResult()`, the sizing/scale wrapper (fixed canvas ~860×1190px; host scales via `transform: scale()`), font note, and the **single-instance-per-page** limitation.

```md
# @lanna/form-50bis
Embeddable Vue 3 component for the Thai 50 Bis withholding-tax certificate.
... (usage, props/events/methods table, sizing wrapper, limitations) ...
```

- [ ] **Step 2: Correct the spec** — change the "multiple instances per page" claim to: single instance per page in v1 (module-level singleton `state` in `form-engine.js`); multi-instance is future work requiring a factory refactor.

- [ ] **Step 3: Commit**

```bash
git add packages/form-50bis/README.md docs/superpowers/specs/2026-06-04-embeddable-50bis-vue-component-design.md
git commit -m "docs(form-50bis): README + spec single-instance correction"
```

---

## Self-Review

**Spec coverage:** interactive editing → Task 5 v-model + onChange; baked layout/no token/Studio → Task 2 embedded branch; Vue npm component → Tasks 5–6; chromeless API (props/events/`print`/`getResult`/`setLanguage`) → Task 5; schema adapter → Task 1; CSS scoping + self-hosted fonts → Task 3; iframe print → Task 4; build/testing → Tasks 6–7; risk (root-scoping, standalone green) → Task 2 Steps 4–5. Signature/stamp props → declared in Task 5 props; **gap:** rendering signature/stamp into the slots is not yet wired — add to Task 5 Step 1 (`watch(signature/stamp)` → set the `img.slot[data-slot]` `src` + `display`). (Added here as a note so the implementer wires it.)

**Placeholder scan:** none — every code step has complete code; the woff2 files (Task 3 Step 3) and the README body (Task 8) are content-fetch/prose steps, not code placeholders.

**Type consistency:** `toFields`/`toData` names consistent across Tasks 1/5; engine internals `_restore`/`_recompute`/`_setLang`/`_collect` consistent across Tasks 2/5; `printIsolated(rootEl, cssText)` consistent Tasks 4/5; `MARKUP` export consistent Tasks 3/5.

**Signature/stamp wiring (fold into Task 5 Step 1):**
```js
watch(() => props.signature, (s) => setSlot('signature', s), { immediate: false });
watch(() => props.stamp, (s) => setSlot('stamp', s), { immediate: false });
function setSlot(slot, src) {
  const img = rootEl.value && rootEl.value.querySelector('img.slot[data-slot="' + slot + '"]');
  if (!img) return; img.src = src || ''; img.style.display = src ? '' : 'none';
}
```
