# Thai Form Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static, browser-only Thai bureaucracy form filler whose first form is the 50 Bis withholding-tax certificate, with a shared engine that persists fields and stamp/signature images locally and supports Thai/English + Buddhist↔Gregorian years.

**Architecture:** Static files served over http(s) — no build step, no framework, classic `<script>` tags. A shared `lib/` (storage, image tool, date utils, engine) is reused by per-form folders under `forms/`. Form metadata lives on the DOM via `data-*` attributes. Pure logic (date conversion, image transparency) is isolated into UMD modules unit-tested with Node's built-in `node:test`; DOM/IndexedDB/canvas integration is verified in a real browser.

**Tech Stack:** Vanilla HTML/CSS/JS, IndexedDB, Canvas 2D, `node:test` (dev only), `python3 -m http.server` (dev serving).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `index.html` | Landing page / form picker |
| `lib/engine.css` | Shared console + field + slot styles |
| `lib/buddhist-date.js` | Pure BE↔CE + strict d/m/y logic (UMD: browser global `BuddhistDate` + Node export) |
| `lib/image-tool.js` | Pure `makeTransparent` core + DOM crop/transparency dialog (UMD for the pure part) |
| `lib/storage.js` | IndexedDB wrapper: field maps + image blobs |
| `lib/form-engine.js` | Orchestration: load/restore, debounced autosave, language, year display, clear actions, slot wiring |
| `forms/50bis/index.html` | 50 Bis form markup (refactored POC) |
| `test/buddhist-date.test.js` | Unit tests for date logic |
| `test/image-tool.test.js` | Unit tests for transparency core |
| `docs/50bis_form_bilingual.html` | Original POC (reference, untouched) |

Conventions for every UMD module (browser + Node):

```js
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NAME = api;
})(typeof self !== 'undefined' ? self : this, function () {
  /* ... */
  return { /* public api */ };
});
```

---

## Task 1: Repo scaffold + Buddhist date module (TDD)

**Files:**
- Create: `lib/buddhist-date.js`
- Test: `test/buddhist-date.test.js`
- Create: `forms/50bis/` and `lib/` directories (implicitly via file creation)

- [ ] **Step 1: Write the failing test**

Create `test/buddhist-date.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const BD = require('../lib/buddhist-date.js');

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/buddhist-date.test.js`
Expected: FAIL — `Cannot find module '../lib/buddhist-date.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/buddhist-date.js`:

```js
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuddhistDate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var OFFSET = 543;

  function beToCe(y) { return y - OFFSET; }
  function ceToBe(y) { return y + OFFSET; }

  function guessUnit(y) { return Number(y) >= 2400 ? 'BE' : 'CE'; }

  function normalizeToBE(y) {
    y = parseInt(y, 10);
    if (isNaN(y)) return null;
    return guessUnit(y) === 'BE' ? y : ceToBe(y);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDMY(str) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str).trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return { d: d, m: mo, y: y };
  }

  // Stored value is always BE. Display CE only when lang === 'en'.
  function displayYear(storedBE, lang) {
    var y = parseInt(storedBE, 10);
    if (isNaN(y)) return storedBE;
    return lang === 'en' ? String(beToCe(y)) : String(y);
  }

  function storeYear(displayed, lang) {
    var y = parseInt(displayed, 10);
    if (isNaN(y)) return displayed;
    return lang === 'en' ? String(ceToBe(y)) : String(y);
  }

  function displayDMY(storedStr, lang) {
    var p = parseDMY(storedStr);
    if (!p) return storedStr;
    var y = lang === 'en' ? beToCe(p.y) : p.y;
    return pad(p.d) + '/' + pad(p.m) + '/' + y;
  }

  function storeDMY(displayedStr, lang) {
    var p = parseDMY(displayedStr);
    if (!p) return displayedStr;
    var y = lang === 'en' ? ceToBe(p.y) : p.y;
    return pad(p.d) + '/' + pad(p.m) + '/' + y;
  }

  return {
    beToCe: beToCe, ceToBe: ceToBe, guessUnit: guessUnit,
    normalizeToBE: normalizeToBE, parseDMY: parseDMY, pad: pad,
    displayYear: displayYear, storeYear: storeYear,
    displayDMY: displayDMY, storeDMY: storeDMY
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/buddhist-date.test.js`
Expected: PASS — all subtests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/buddhist-date.js test/buddhist-date.test.js
git commit -m "feat: Buddhist<->Gregorian year + strict d/m/y date logic"
```

---

## Task 2: Image transparency core (TDD)

**Files:**
- Create: `lib/image-tool.js` (pure core only in this task)
- Test: `test/image-tool.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/image-tool.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/image-tool.test.js`
Expected: FAIL — `Cannot find module '../lib/image-tool.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/image-tool.js` (pure core + UMD; the DOM dialog is added in Task 7, guarded by `typeof document`):

```js
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ImageTool = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Zero the alpha channel of any pixel whose R,G,B are all >= threshold.
  function makeTransparent(imageData, threshold) {
    var d = imageData.data, t = threshold;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] >= t && d[i + 1] >= t && d[i + 2] >= t) d[i + 3] = 0;
    }
    return imageData;
  }

  return { makeTransparent: makeTransparent };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/image-tool.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/image-tool.js test/image-tool.test.js
git commit -m "feat: image transparency core (white->transparent)"
```

---

## Task 3: IndexedDB storage wrapper

**Files:**
- Create: `lib/storage.js`

Verified in-browser (IndexedDB has no Node runtime here). No `node:test`.

- [ ] **Step 1: Write the implementation**

Create `lib/storage.js`:

```js
(function (root) {
  var DB_NAME = 'thai-form-fill';
  var DB_VERSION = 1;

  function openDB() {
    return new Promise(function (resolve) {
      var ok = typeof indexedDB !== 'undefined';
      if (!ok) return resolve(stub());
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('fields')) db.createObjectStore('fields');
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = function () { resolve(wrap(req.result)); };
      req.onerror = function () { resolve(stub()); };
    });
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }
  function asPromise(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function wrap(db) {
    return {
      available: true,
      loadFields: function (formId) {
        return asPromise(tx(db, 'fields', 'readonly').get(formId)).then(function (v) { return v || {}; });
      },
      saveFields: function (formId, map) {
        return asPromise(tx(db, 'fields', 'readwrite').put(map, formId));
      },
      loadImage: function (formId, slot) {
        return asPromise(tx(db, 'images', 'readonly').get(formId + ':' + slot));
      },
      saveImage: function (formId, slot, blob, meta) {
        var rec = { blob: blob, w: meta.w, h: meta.h };
        return asPromise(tx(db, 'images', 'readwrite').put(rec, formId + ':' + slot));
      },
      deleteImage: function (formId, slot) {
        return asPromise(tx(db, 'images', 'readwrite').delete(formId + ':' + slot));
      },
      clearForm: function (formId, opts) {
        var p = asPromise(tx(db, 'fields', 'readwrite').delete(formId));
        if (opts && opts.keepImages) return p;
        return p.then(function () {
          return Promise.all([
            asPromise(tx(db, 'images', 'readwrite').delete(formId + ':signature')),
            asPromise(tx(db, 'images', 'readwrite').delete(formId + ':stamp'))
          ]);
        });
      }
    };
  }

  // No-op stub when IndexedDB is unavailable. Engine shows a banner.
  function stub() {
    var noop = function () { return Promise.resolve(); };
    return {
      available: false,
      loadFields: function () { return Promise.resolve({}); },
      saveFields: noop, loadImage: function () { return Promise.resolve(null); },
      saveImage: noop, deleteImage: noop, clearForm: noop
    };
  }

  root.Storage = { openDB: openDB };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: Smoke-verify in browser**

Create nothing extra; verify via console once a form exists (deferred check). For now confirm the file parses:

Run: `node -e "global.self={}; require('./lib/storage.js'); console.log(typeof self.Storage.openDB)"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add lib/storage.js
git commit -m "feat: IndexedDB storage wrapper with no-op fallback"
```

---

## Task 4: Refactor 50 Bis form markup

**Files:**
- Create: `forms/50bis/index.html` (copy of POC, then edited)

- [ ] **Step 1: Copy the POC as the starting point**

```bash
cp docs/50bis_form_bilingual.html forms/50bis/index.html
```

- [ ] **Step 2: Replace the toolbar (lines ~38-46) with the edit console**

Replace the entire `<div class="toolbar">…</div>` block with:

```html
<div class="toolbar" id="console">
  <strong data-th="50 ทวิ — แบบกรอกสองภาษา" data-en="50 Bis — Bilingual Fillable">50 ทวิ — แบบกรอกสองภาษา</strong>
  <button class="lang" id="langBtn" data-act="lang">EN</button>
  <button class="sec" data-act="toggleFields"><span data-th="แสดง/ซ่อนช่องกรอก" data-en="Show/Hide fields">แสดง/ซ่อนช่องกรอก</span></button>
  <button class="sec" data-act="img" data-slot="signature"><span data-th="ลายเซ็น" data-en="Signature">ลายเซ็น</span></button>
  <button class="sec" data-act="img" data-slot="stamp"><span data-th="ตราประทับ" data-en="Stamp">ตราประทับ</span></button>
  <button class="sec" data-act="clearSubmit"><span data-th="ล้างข้อมูลที่ยื่น" data-en="Clear submission">ล้างข้อมูลที่ยื่น</span></button>
  <button class="sec" data-act="resetAll"><span data-th="ล้างทั้งหมด" data-en="Reset all">ล้างทั้งหมด</span></button>
  <button data-act="print"><span data-th="พิมพ์ / บันทึก PDF" data-en="Print / Save PDF">พิมพ์ / บันทึก PDF</span></button>
  <span class="sp"></span>
  <span id="storeWarn" style="display:none;color:#fbbc04" data-th="บันทึกอัตโนมัติใช้งานไม่ได้" data-en="Autosave unavailable">บันทึกอัตโนมัติใช้งานไม่ได้</span>
</div>
```

- [ ] **Step 3: Add `data-role="owner"` to the owner fields**

Add the attribute `data-role="owner"` to these inputs (find by `id`): `f_add1`, `f_book_no`, `f_run_no`, `f_id1`, `f_name1`, `f_tin1`, `f_chk8`, `f_chk9`, `f_chk10`, `f_chk11`, `f_spec4`.

Example (the rest follow the same pattern):

```html
<input type="text" id="f_name1" name="name1" class="tf" data-role="owner" autocomplete="off" data-th="ชื่อผู้จ่าย" data-en="Payer name" title="ชื่อผู้จ่าย" style="left:70.1px;top:125.8px;width:341.1px;height:21.0px;font-size:15.5px;text-align:left;">
```

- [ ] **Step 4: Tag the year/date fields**

Add `data-type="be-year"` to `f_year_pay`. Add `data-type="dmy"` to every `f_date*` input (`f_date1`…`f_date13`, `f_date14_0`, `f_date14_1`).

Example:

```html
<input type="text" id="f_year_pay" name="year_pay" class="tf" data-type="be-year" autocomplete="off" data-th="ปี" data-en="Year" title="ปี" style="left:558.1px;top:982.0px;width:53.0px;height:18.7px;font-size:13.8px;text-align:left;">
```

- [ ] **Step 5: Add the two image slots**

Immediately after the closing `</div>` of `.enlayer` (the line `   </div>` at POC line 133) and before the inputs, add:

```html
<img class="slot" id="slot_signature" data-slot="signature" alt="" style="left:470px;top:962px;width:150px;height:34px;display:none;">
<img class="slot" id="slot_stamp" data-slot="stamp" alt="" style="left:655px;top:968px;width:62px;height:62px;display:none;">
```

- [ ] **Step 6: Remove the old script + standalone clear, add lib includes**

Delete the entire `<script>…</script>` block (POC lines 216-247) including `clearAll()`. Replace with:

```html
<script src="../../lib/buddhist-date.js"></script>
<script src="../../lib/image-tool.js"></script>
<script src="../../lib/storage.js"></script>
<script src="../../lib/form-engine.js"></script>
<script>FormEngine.init({ formId: '50bis' });</script>
```

- [ ] **Step 7: Link the shared stylesheet**

In `<head>`, after the existing `<style>` block, add:

```html
<link rel="stylesheet" href="../../lib/engine.css">
```

- [ ] **Step 8: Verify the file still opens**

```bash
python3 -m http.server 8000 >/dev/null 2>&1 &
SERVER=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/forms/50bis/index.html
kill $SERVER
```

Expected: `200`. (Engine functions don't exist yet — that's Task 5.)

- [ ] **Step 9: Commit**

```bash
git add forms/50bis/index.html
git commit -m "feat: refactor 50bis markup — console, data-role/type, image slots, lib includes"
```

---

## Task 5: Form engine — load, autosave, language, year display

**Files:**
- Create: `lib/form-engine.js`
- Create: `lib/engine.css`

- [ ] **Step 1: Write engine.css**

Create `lib/engine.css`:

```css
.slot { position: absolute; z-index: 8; object-fit: contain; pointer-events: none; }
.slot.sizing { outline: 1px dashed #1a73e8; pointer-events: auto; }
.slot-size { position: absolute; z-index: 30; background: #323639; padding: 4px 8px;
  border-radius: 6px; display: flex; gap: 6px; align-items: center; }
.dlg-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 200;
  display: flex; align-items: center; justify-content: center; }
.dlg { background: #fff; border-radius: 10px; padding: 16px; max-width: 92vw;
  max-height: 92vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.dlg canvas { max-width: 80vw; touch-action: none; background:
  repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 50%/16px 16px; }
.dlg .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
@media print { .slot-size, .dlg-backdrop { display: none !important; } }
```

- [ ] **Step 2: Write the engine (load + autosave + language + year)**

Create `lib/form-engine.js`:

```js
(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;

  var state = { formId: null, db: null, lang: 'th', saveTimer: null };

  function fields() {
    return Array.prototype.slice.call(document.querySelectorAll('.page input'));
  }
  function val(el) { return el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; }
  function setVal(el, v) {
    if (el.type === 'checkbox') el.checked = v === '1' || v === true;
    else el.value = v == null ? '' : v;
  }

  // Field stored value is canonical (BE for years). Convert for display by current lang.
  function toDisplay(el, stored) {
    if (el.getAttribute('data-type') === 'be-year') return BD.displayYear(stored, state.lang);
    if (el.getAttribute('data-type') === 'dmy') return BD.displayDMY(stored, state.lang);
    return stored;
  }
  function toStored(el, shown) {
    if (el.getAttribute('data-type') === 'be-year') return BD.storeYear(shown, state.lang);
    if (el.getAttribute('data-type') === 'dmy') return BD.storeDMY(shown, state.lang);
    return shown;
  }

  function collect() {
    var map = { _ui: { lang: state.lang, showFields: document.body.classList.contains('show-fields') } };
    fields().forEach(function (el) { map[el.name] = toStored(el, val(el)); });
    return map;
  }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.db.saveFields(state.formId, collect());
    }, 300);
  }

  function restore(map) {
    fields().forEach(function (el) {
      if (Object.prototype.hasOwnProperty.call(map, el.name)) setVal(el, toDisplay(el, map[el.name]));
    });
  }

  // POC language helpers, kept.
  function applyLangText(en) {
    document.querySelectorAll('[data-th][data-en]').forEach(function (el) {
      if (el.tagName === 'INPUT') el.title = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
      else el.textContent = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
    });
  }
  function fitEnglish() {
    document.querySelectorAll('.enlbl').forEach(function (el) {
      var span = el.firstElementChild; if (!span) return;
      var fs = parseFloat(el.getAttribute('data-fs')) || 12; span.style.fontSize = fs + 'px';
      var guard = 0;
      while (span.scrollWidth > el.clientWidth && fs > 5 && guard < 60) { fs -= 0.5; span.style.fontSize = fs + 'px'; guard++; }
    });
  }

  function setLang(lang) {
    // Re-display year/date fields under the new lang (storage stays canonical BE).
    var prev = state.lang;
    if (prev !== lang) {
      fields().forEach(function (el) {
        var t = el.getAttribute('data-type');
        if (t === 'be-year' || t === 'dmy') {
          var stored = toStored(el, val(el)); // current shown -> canonical (using prev lang)
          state.lang = lang;
          setVal(el, toDisplay(el, stored));  // canonical -> new lang
          state.lang = prev;
        }
      });
    }
    state.lang = lang;
    var en = lang === 'en';
    document.body.classList.toggle('lang-en', en);
    document.documentElement.lang = lang;
    var btn = document.getElementById('langBtn'); if (btn) btn.textContent = en ? 'ไทย' : 'EN';
    applyLangText(en);
    if (en) requestAnimationFrame(fitEnglish);
    scheduleSave();
  }

  function init(opts) {
    state.formId = opts.formId;
    bindConsole();
    fields().forEach(function (el) { el.addEventListener('input', scheduleSave); el.addEventListener('change', scheduleSave); });
    Storage.openDB().then(function (db) {
      state.db = db;
      if (!db.available) { var w = document.getElementById('storeWarn'); if (w) w.style.display = ''; }
      return db.loadFields(state.formId);
    }).then(function (map) {
      var ui = map._ui || {};
      if (ui.showFields) document.body.classList.add('show-fields');
      restore(map);
      setLang(ui.lang || 'th');
      if (root.ImageTool && root.ImageTool.restoreSlots) root.ImageTool.restoreSlots(state);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitEnglish);
    });
  }

  // Console actions filled in across Tasks 5-7.
  function bindConsole() {
    var c = document.getElementById('console'); if (!c) return;
    c.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]'); if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'lang') setLang(state.lang === 'en' ? 'th' : 'en');
      else if (act === 'toggleFields') { document.body.classList.toggle('show-fields'); scheduleSave(); }
      else if (act === 'print') window.print();
      else if (act === 'clearSubmit') clearSubmit();
      else if (act === 'resetAll') resetAll();
      else if (act === 'img' && root.ImageTool) root.ImageTool.open(state, btn.getAttribute('data-slot'));
    });
  }

  // Defined in Task 6.
  function clearSubmit() {}
  function resetAll() {}

  root.FormEngine = {
    init: init, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _setLang: setLang, _fields: fields,
    _setClearImpl: function (cs, ra) { clearSubmit = cs; resetAll = ra; }
  };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 3: Browser-verify autosave + year display**

```bash
python3 -m http.server 8000 >/dev/null 2>&1 &
SERVER=$!; sleep 1
```

Then with Playwright (or manually): navigate to `http://localhost:8000/forms/50bis/index.html`.
1. Type `2568` into the Year field (`#f_year_pay`), type `Payer Co` into `#f_name1`.
2. Reload — both values restored.
3. Click **EN** — Year shows `2025`. Click **ไทย** — Year shows `2568` (no drift).

Stop server: `kill $SERVER`.
Expected: all three checks pass.

- [ ] **Step 4: Commit**

```bash
git add lib/form-engine.js lib/engine.css
git commit -m "feat: form engine — autosave, restore, language toggle, BE/CE year display"
```

---

## Task 6: Clear submission / Reset all

**Files:**
- Modify: `lib/form-engine.js` (append clear implementations + wire them)

- [ ] **Step 1: Add the clear implementations**

In `lib/form-engine.js`, replace the placeholder lines

```js
  // Defined in Task 6.
  function clearSubmit() {}
  function resetAll() {}
```

with:

```js
  function isOwner(el) { return el.getAttribute('data-role') === 'owner'; }

  function clearSubmit() {
    var msg = state.lang === 'en' ? 'Clear submission data? Owner info and stamp/signature are kept.'
                                  : 'ล้างข้อมูลที่ยื่น? ข้อมูลเจ้าของและตรา/ลายเซ็นจะถูกเก็บไว้';
    if (!confirm(msg)) return;
    fields().forEach(function (el) { if (!isOwner(el)) setVal(el, ''); });
    scheduleSave();
  }

  function resetAll() {
    var msg = state.lang === 'en' ? 'Reset EVERYTHING including stamp and signature?'
                                  : 'ล้างข้อมูลทั้งหมด รวมทั้งตราและลายเซ็น?';
    if (!confirm(msg)) return;
    fields().forEach(function (el) { setVal(el, ''); });
    document.querySelectorAll('.slot').forEach(function (img) { img.style.display = 'none'; img.removeAttribute('src'); });
    state.db.clearForm(state.formId, { keepImages: false });
    scheduleSave();
  }
```

- [ ] **Step 2: Browser-verify clear semantics**

Serve (`python3 -m http.server 8000`) and load the form.
1. Fill `#f_name1` (owner) = `Owner`, `#f_book_no` (owner) = `B1`, `#f_name2` (submission) = `Payee`, `#f_pay1_0` = `100`.
2. Click **Clear submission** → confirm. Expect: `#f_name1`=`Owner`, `#f_book_no`=`B1` kept; `#f_name2`, `#f_pay1_0` empty.
3. Reload → same state persists.
4. Click **Reset all** → confirm. Expect: all fields empty; reload → still empty.

Expected: all checks pass.

- [ ] **Step 3: Commit**

```bash
git add lib/form-engine.js
git commit -m "feat: clear-submission (keep owner) and reset-all actions"
```

---

## Task 7: Image tool dialog + slot placement + persistence

**Files:**
- Modify: `lib/image-tool.js` (append DOM dialog, guarded by `typeof document`)

- [ ] **Step 1: Append the dialog controller**

In `lib/image-tool.js`, change the `factory` return and add the DOM layer. Replace:

```js
  return { makeTransparent: makeTransparent };
```

with:

```js
  // ---- DOM layer (browser only) ----
  function hasDoc() { return typeof document !== 'undefined'; }
  var MAXDIM = 2000;

  function loadFile(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('not an image'));
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  function fitDown(w, h) {
    var s = Math.min(1, MAXDIM / Math.max(w, h));
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }

  function open(state, slot) {
    if (!hasDoc()) return;
    var back = document.createElement('div'); back.className = 'dlg-backdrop';
    back.innerHTML =
      '<div class="dlg">' +
      '<div class="row"><input type="file" accept="image/*" id="it_file"></div>' +
      '<canvas id="it_canvas" width="320" height="160"></canvas>' +
      '<div class="row"><label>Transparency <input id="it_th" type="range" min="150" max="255" value="235"></label> ' +
      '<span id="it_thv">235</span></div>' +
      '<div class="row"><button id="it_apply">Apply</button> <button id="it_cancel">Cancel</button></div>' +
      '</div>';
    document.body.appendChild(back);

    var canvas = back.querySelector('#it_canvas');
    var ctx = canvas.getContext('2d');
    var thEl = back.querySelector('#it_th');
    var thv = back.querySelector('#it_thv');
    var srcImg = null;

    function render() {
      if (!srcImg) return;
      var f = fitDown(srcImg.naturalWidth, srcImg.naturalHeight);
      canvas.width = f.w; canvas.height = f.h;
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.drawImage(srcImg, 0, 0, f.w, f.h);
      var id = ctx.getImageData(0, 0, f.w, f.h);
      makeTransparent(id, parseInt(thEl.value, 10));
      ctx.putImageData(id, 0, 0);
    }

    back.querySelector('#it_file').addEventListener('change', function (e) {
      loadFile(e.target.files[0]).then(function (img) { srcImg = img; render(); }).catch(function () { alert('Please choose an image file.'); });
    });
    thEl.addEventListener('input', function () { thv.textContent = thEl.value; render(); });
    back.querySelector('#it_cancel').addEventListener('click', function () { back.remove(); });
    back.querySelector('#it_apply').addEventListener('click', function () {
      if (!srcImg) { back.remove(); return; }
      canvas.toBlob(function (blob) {
        var meta = { w: canvas.width, h: canvas.height };
        state.db.saveImage(state.formId, slot, blob, meta);
        place(slot, blob, defaultSize(slot));
        back.remove();
      }, 'image/png');
    });
  }

  function defaultSize(slot) {
    var img = document.getElementById('slot_' + slot);
    return { w: parseFloat(img.style.width) || 120, h: parseFloat(img.style.height) || 40 };
  }

  function place(slot, blob, size) {
    var img = document.getElementById('slot_' + slot);
    if (!img) return;
    if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    if (size && size.w) img.style.width = size.w + 'px';
    if (size && size.h) img.style.height = size.h + 'px';
    img.style.display = '';
    addSizer(slot);
  }

  // Simple size control: a small +/- box near the slot.
  function addSizer(slot) {
    var img = document.getElementById('slot_' + slot);
    var existing = document.getElementById('sizer_' + slot);
    if (existing) existing.remove();
    var box = document.createElement('div');
    box.className = 'slot-size'; box.id = 'sizer_' + slot;
    box.style.left = (parseFloat(img.style.left) + parseFloat(img.style.width) + 4) + 'px';
    box.style.top = img.style.top;
    box.innerHTML = '<button data-d="-">−</button><button data-d="+">+</button>';
    img.parentNode.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-d') === '+' ? 1.1 : 0.9;
      var w = parseFloat(img.style.width) * k, h = parseFloat(img.style.height) * k;
      img.style.width = w + 'px'; img.style.height = h + 'px';
      box.style.left = (parseFloat(img.style.left) + w + 4) + 'px';
      persistSize(slot, w, h);
    });
  }

  function persistSize(slot, w, h) {
    var st = root.FormEngine && root.FormEngine._state;
    if (!st || !st.db) return;
    st.db.loadImage(st.formId, slot).then(function (rec) {
      if (rec && rec.blob) st.db.saveImage(st.formId, slot, rec.blob, { w: w, h: h });
    });
  }

  function restoreSlots(state) {
    ['signature', 'stamp'].forEach(function (slot) {
      state.db.loadImage(state.formId, slot).then(function (rec) {
        if (rec && rec.blob) place(slot, rec.blob, { w: rec.w, h: rec.h });
      });
    });
  }

  return { makeTransparent: makeTransparent, open: open, place: place, restoreSlots: restoreSlots };
```

- [ ] **Step 2: Re-run the pure unit tests (must still pass)**

Run: `node --test test/image-tool.test.js`
Expected: PASS — the DOM additions are guarded and don't run under Node.

- [ ] **Step 3: Browser-verify the full image flow**

Serve and load the form.
1. Click **Signature** → dialog opens. Choose an image with a white background.
2. Drag the **Transparency** slider — white area becomes checkerboard (transparent) in the preview.
3. Click **Apply** — the image appears in the signature slot on the form.
4. Use **+ / −** to resize. Reload — the image is still placed at the saved size.
5. Repeat for **Stamp**.
6. **Reset all** → both images disappear and stay gone after reload.

Expected: all checks pass.

- [ ] **Step 4: Commit**

```bash
git add lib/image-tool.js
git commit -m "feat: image dialog (upload/transparency), slot placement, size persistence"
```

---

## Task 8: Landing page (form picker)

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write the landing page**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Thai Form Fill — แบบฟอร์มราชการกรอกออนไลน์</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
<style>
  body{font-family:'Sarabun',sans-serif;margin:0;background:#f4f5f7;color:#202124;}
  header{background:#137333;color:#fff;padding:28px 20px;}
  header h1{margin:0;font-size:22px;} header p{margin:6px 0 0;opacity:.9;}
  main{max-width:760px;margin:24px auto;padding:0 16px;}
  .card{display:block;background:#fff;border:1px solid #dadce0;border-radius:10px;
    padding:18px;text-decoration:none;color:inherit;margin-bottom:14px;}
  .card:hover{border-color:#1a73e8;box-shadow:0 1px 6px rgba(0,0,0,.12);}
  .card h2{margin:0 0 4px;font-size:18px;} .card p{margin:0;color:#5f6368;font-size:14px;}
  footer{max-width:760px;margin:24px auto;padding:0 16px;color:#5f6368;font-size:13px;}
</style>
</head>
<body>
  <header>
    <h1>Thai Form Fill</h1>
    <p data-th="กรอกแบบฟอร์มราชการในเบราว์เซอร์ ข้อมูลเก็บในเครื่องของคุณเท่านั้น"
       data-en="Fill Thai government forms in your browser. Your data stays on your device.">
       กรอกแบบฟอร์มราชการในเบราว์เซอร์ ข้อมูลเก็บในเครื่องของคุณเท่านั้น</p>
  </header>
  <main>
    <a class="card" href="forms/50bis/index.html">
      <h2>50 ทวิ — Withholding Tax Certificate (50 Bis)</h2>
      <p>หนังสือรับรองการหักภาษี ณ ที่จ่าย · bilingual · stamp &amp; signature · auto-save</p>
    </a>
  </main>
  <footer>
    Open-source public utility · no accounts · no server · all data local (IndexedDB).
  </footer>
</body>
</html>
```

- [ ] **Step 2: Verify it serves and links work**

```bash
python3 -m http.server 8000 >/dev/null 2>&1 &
SERVER=$!; sleep 1
curl -s -o /dev/null -w "root %{http_code}\n" http://localhost:8000/index.html
curl -s -o /dev/null -w "form %{http_code}\n" http://localhost:8000/forms/50bis/index.html
kill $SERVER
```

Expected: `root 200` and `form 200`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: landing page / form picker"
```

---

## Task 9: Print output + full regression checklist + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:

```markdown
# Thai Form Fill

Open-source, browser-only filler for Thai bureaucratic forms. First form: the
50 Bis withholding-tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย).

- No accounts, no server. All data — including stamp & signature images — stays
  in your browser via IndexedDB.
- Bilingual Thai/English. Buddhist↔Gregorian year conversion.
- Upload + crop + make-transparent your stamp and signature.
- Print or Save as PDF.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Serve over http(s) (e.g. GitHub Pages). Opening as a raw `file://` is not
supported because browsers restrict IndexedDB on file origins.

## Add a new form

Create `forms/<name>/index.html`, overlay inputs on the form scan, tag fields
with `data-role="owner"` and `data-type="be-year"|"dmy"`, add `data-slot` images,
include the `lib/*.js` scripts, and call `FormEngine.init({ formId: '<name>' })`.

## Tests

```bash
node --test test/
```
```

- [ ] **Step 2: Run the full unit suite**

Run: `node --test test/`
Expected: PASS — all tests in `test/buddhist-date.test.js` and `test/image-tool.test.js`.

- [ ] **Step 3: Browser regression checklist**

Serve and load `http://localhost:8000/forms/50bis/index.html`. Verify each:
1. Autosave round-trip: type values, reload → restored.
2. Clear submission keeps owner block + images, clears payee/amounts/dates.
3. Reset all wipes everything incl. images.
4. Language toggle: year shows BE in TH / CE in EN, both directions, no double-conversion; English mask still fits.
5. Strict `dd/mm/yyyy` date (e.g. in `#f_date1`) shows converted year in EN; freeform text untouched.
6. Image: upload → transparent → apply → resize → persists across reload.
7. **Print preview** (Ctrl/Cmd+P): console hidden, field outlines hidden, inputs + slot images render in black on the form.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README + regression checklist"
```

---

## Self-Review Notes

- **Spec coverage:** run model (Task 8 README + serving), repo layout (Tasks 1-8), storage (Task 3), image tool (Tasks 2,7), date logic (Task 1), console (Task 4), owner/submission split (Tasks 4,6), slots (Tasks 4,7), print (Task 9), testing (Tasks 1,2,9) — all mapped.
- **Print rule:** the POC already has `@media print` hiding `.toolbar` and rendering inputs in black; `engine.css` extends it to hide sizer/dialog. `.slot` images print by default (no print:none). Verified in Task 9 step 3.
- **Type consistency:** `state` shape (`formId, db, lang`), storage API names (`loadFields/saveFields/loadImage/saveImage/deleteImage/clearForm`), and slot ids (`slot_signature`, `slot_stamp`) are consistent across Tasks 3-7.
- **Clear-submit wiring:** `bindConsole` calls `clearSubmit`/`resetAll` defined later in the same file (Task 6 replaces the stubs in place — same function names, no late binding needed). The `_setClearImpl` hook is retained for tests but not required at runtime.
