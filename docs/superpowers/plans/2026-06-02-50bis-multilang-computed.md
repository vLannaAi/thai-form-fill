# 50 Bis — Multilanguage Layout + Computed Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make language a structural dimension of the 50 Bis form (strings + per-language CSS layout) and add auto-calculated income totals plus a Thai/English amount-in-words field.

**Architecture:** A new pure `lib/baht-text.js` converts numbers to Thai/English baht text. `lib/form-engine.js` gains a `recompute()` pass (sums + words) hooked into the existing `input`, load, and `setLang` paths. Paragraph positions move from inline `style=` into `form.css` so `body.lang-en` overrides can win the cascade. The generator (`build_interactive.py`) emits position-free paragraphs, `data-compute`/`readonly` attributes on the three computed fields, and the new script tag.

**Tech Stack:** Vanilla ES5-style JS (UMD factory pattern, no build), Node's built-in test runner (`node --test`), Python 3 generator, Playwright (MCP) for in-browser verification.

**Spec:** `docs/superpowers/specs/2026-06-02-50bis-multilang-computed-design.md`

**Conventions to follow (read before starting):**
- JS modules use the UMD factory in `lib/buddhist-date.js` (exposes both `module.exports` and `root.<Name>`). Match it.
- Tests use `node:test` + `node:assert` and `require('../lib/<file>.js')`. See `test/buddhist-date.test.js`.
- The form is served over http for manual checks: `python3 -m http.server 8765` from repo root, then `http://localhost:8765/forms/50bis/index.html`. `fetch` of `strings.json` is blocked on `file://`.
- After editing `forms/50bis/build_interactive.py`, regenerate with `cd forms/50bis && python3 build_interactive.py`.
- `index.html` must still contain **zero Thai** (`grep -c '[฀-๿]' forms/50bis/index.html` → 0). A format-on-save prettifier may reflow `index.html`/`strings.json`; treat generator output as canonical and compare content, not whitespace.
- Field name scheme: income rows are `pay0..pay13` / `tax0..tax13`; totals `pay_total` / `tax_total`; words `total_words`.

---

### Task 1: `lib/baht-text.js` — number → Thai/English baht text

**Files:**
- Create: `lib/baht-text.js`
- Test: `test/baht-text.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/baht-text.test.js`:

```js
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
  assert.strictEqual(B.thai(1.005), 'หนึ่งบาทหนึ่งสตางค์'); // 1.005 -> 1.01? see note
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

test('guards: non-finite / NaN -> empty string', () => {
  assert.strictEqual(B.thai('abc'), '');
  assert.strictEqual(B.english(Infinity), '');
});
```

> Note on `B.thai(1.005)`: `toFixed(2)` rounds 1.005 → "1.00" or "1.01" depending on float; this assertion is intentionally written to the **toFixed result**. After implementing, if `(1.005).toFixed(2)` is "1.00" on the runtime, change the expected value to `'หนึ่งบาทถ้วน'` to match actual `toFixed` behavior — do NOT special-case rounding in code. (toFixed is the single source of rounding truth.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/baht-text.test.js`
Expected: FAIL — `Cannot find module '../lib/baht-text.js'`.

- [ ] **Step 3: Implement `lib/baht-text.js`**

Create `lib/baht-text.js`:

```js
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BahtText = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var TH_N = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  var TH_U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  // Read a 1..6 digit chunk. hasHigher=true when a higher million-group precedes,
  // so a trailing 1 becomes เอ็ด (e.g. 1,000,001 -> ...ล้านเอ็ด).
  function thaiGroup(s, hasHigher) {
    var len = s.length, out = '';
    for (var i = 0; i < len; i++) {
      var d = +s.charAt(i), pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0) out += (d === 1 && (len > 1 || hasHigher)) ? 'เอ็ด' : TH_N[d];
      else if (pos === 1) out += d === 1 ? 'สิบ' : (d === 2 ? 'ยี่สิบ' : TH_N[d] + 'สิบ');
      else out += TH_N[d] + TH_U[pos];
    }
    return out;
  }

  function thaiInt(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!isFinite(n)) return '';
    if (n === 0) return 'ศูนย์';
    var chunks = [];
    while (n > 0) { chunks.push(n % 1000000); n = Math.floor(n / 1000000); }
    var out = '';
    for (var i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i] === 0) continue;
      var hasHigher = false;
      for (var j = i + 1; j < chunks.length; j++) { if (chunks[j] > 0) { hasHigher = true; break; } }
      out += thaiGroup(String(chunks[i]), hasHigher);
      for (var k = 0; k < i; k++) out += 'ล้าน';
    }
    return out;
  }

  function thai(amount) {
    var a = parseFloat(amount);
    if (!isFinite(a)) return '';
    var parts = Math.abs(a).toFixed(2).split('.');
    var baht = parseInt(parts[0], 10), satang = parseInt(parts[1], 10);
    var txt = (a < 0 ? 'ลบ' : '');
    if (baht > 0) txt += thaiInt(baht) + 'บาท';
    else if (satang === 0) txt += 'ศูนย์บาท';
    if (satang > 0) txt += thaiInt(satang) + 'สตางค์';
    else if (baht > 0 || satang === 0) txt += 'ถ้วน';
    return txt;
  }

  var EN_ONES = ['zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  var EN_TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  var EN_SCALE = ['', 'thousand', 'million', 'billion', 'trillion'];

  function enBelow1000(x) {
    var s = '';
    if (x >= 100) { s += EN_ONES[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' '; }
    if (x >= 20) { s += EN_TENS[Math.floor(x / 10)]; if (x % 10) s += '-' + EN_ONES[x % 10]; }
    else if (x > 0) s += EN_ONES[x];
    return s;
  }

  function englishInt(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!isFinite(n)) return '';
    if (n === 0) return 'zero';
    var chunks = [];
    while (n > 0) { chunks.push(n % 1000); n = Math.floor(n / 1000); }
    var parts = [];
    for (var i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i] === 0) continue;
      parts.push(enBelow1000(chunks[i]) + (EN_SCALE[i] ? ' ' + EN_SCALE[i] : ''));
    }
    return parts.join(' ');
  }

  function english(amount) {
    var a = parseFloat(amount);
    if (!isFinite(a)) return '';
    var parts = Math.abs(a).toFixed(2).split('.');
    var baht = parseInt(parts[0], 10), satang = parseInt(parts[1], 10);
    var txt = (a < 0 ? 'minus ' : '') + englishInt(baht) + ' baht';
    if (satang > 0) txt += ' ' + englishInt(satang) + ' satang';
    return txt;
  }

  return { thai: thai, english: english, thaiInt: thaiInt, englishInt: englishInt };
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/baht-text.test.js`
Expected: PASS (all tests). If the `B.thai(1.005)` assertion fails because `(1.005).toFixed(2) === '1.00'` on this runtime, edit that one expected value to `'หนึ่งบาทถ้วน'` and re-run — that reflects true toFixed rounding, not a code bug.

- [ ] **Step 5: Run the whole suite**

Run: `node --test test/`
Expected: PASS (buddhist-date, image-tool, baht-text).

- [ ] **Step 6: Commit**

```bash
git add lib/baht-text.js test/baht-text.test.js
git commit -m "feat: add lib/baht-text.js — number to Thai/English baht text"
```

---

### Task 2: Move paragraph positions from inline style into `form.css`

This is a behavior-preserving refactor: Thai rendering must stay identical (English overrides come in Task 3). It is the prerequisite that lets `body.lang-en` win the cascade (inline styles outrank class/attribute selectors).

**Files:**
- Modify: `forms/50bis/strings.json` (paragraphs drop `x/y/w/sz`)
- Modify: `forms/50bis/build_interactive.py` (emit paragraphs with no inline style)
- Modify: `forms/50bis/form.css` (add 6 base position rules)
- Regenerate: `forms/50bis/index.html`

- [ ] **Step 1: Record the current paragraph geometry**

Run: `cd forms/50bis && python3 -c "import json;[print(i,p['x'],p['y'],p['w'],p.get('sz',12)) for i,p in enumerate(json.load(open('strings.json'))['paragraphs'])]"`
Expected output (these are the base Thai values to put in CSS):
```
0 100 553 560 12
1 128 728 540 12
2 128 771 560 12
3 62 857 410 12
4 53 359 214 9
5 60 1094 300 12
```
If your output differs, use YOUR output's numbers in Step 4.

- [ ] **Step 2: Strip positions from `strings.json` paragraphs**

In `forms/50bis/strings.json`, each `paragraphs` entry currently looks like:
```json
    {"hide": [39, 40, 41], "x": 100, "y": 553, "w": 560,
     "th": "(1) ...", "en": "(1) ..."},
```
Edit every paragraph entry to remove the `x`, `y`, `w`, and `sz` keys, keeping only `hide`, `th`, `en`:
```json
    {"hide": [39, 40, 41],
     "th": "(1) ...", "en": "(1) ..."},
```
Do this for all 6 entries (entry index 4 also has `"sz": 9` — remove it too).

Also update the `_comment` field: change the `'paragraphs' = ...` sentence to end with: `... rebuilt as one wrapping block; their position/size now live in form.css ([data-i18n=\"paragraphs.<n>\"] rules), not here.`

Validate: `cd forms/50bis && python3 -c "import json; d=json.load(open('strings.json')); print('paras', len(d['paragraphs']), 'keys', sorted(d['paragraphs'][0].keys()))"`
Expected: `paras 6 keys ['en', 'hide', 'th']`

- [ ] **Step 3: Make the generator emit position-free paragraphs**

In `forms/50bis/build_interactive.py`, find the paragraph-overlay block:
```python
# Empty paragraph blocks for the text overlay (engine fills text live; coords stay here).
para_html = []
for n, p in enumerate(PARAS):
    sz = p.get("sz", 12)
    para_html.append(
      '<div class="tx" data-i18n="paragraphs.%d" style="left:%dpx;top:%dpx;width:%dpx;font-size:%dpx;"></div>'
      % (n, p["x"], p["y"], p["w"], sz))
TXT = '<div id="txt">' + ''.join(para_html) + '</div>'
```
Replace it with (positions now live in form.css, so no inline style):
```python
# Empty paragraph blocks for the text overlay. Text is filled live by the engine;
# position/size live in form.css ([data-i18n="paragraphs.N"]) so body.lang-en can override.
para_html = []
for n, p in enumerate(PARAS):
    para_html.append('<div class="tx" data-i18n="paragraphs.%d"></div>' % n)
TXT = '<div id="txt">' + ''.join(para_html) + '</div>'
```

- [ ] **Step 4: Add the 6 base position rules to `form.css`**

In `forms/50bis/form.css`, find the paragraph block:
```css
#txt .tx {
  position: absolute;
  color: #000;
  line-height: 1.32;
  white-space: normal;
  font-family: 'Sarabun', 'Angsana New', sans-serif;
}
```
Immediately AFTER that rule, add the per-paragraph base geometry (Thai), using the numbers from Step 1:
```css
/* Base (Thai) geometry for each rebuilt paragraph. body.lang-en overrides below. */
[data-i18n="paragraphs.0"] { left: 100px; top: 553px;  width: 560px; font-size: 12px; }
[data-i18n="paragraphs.1"] { left: 128px; top: 728px;  width: 540px; font-size: 12px; }
[data-i18n="paragraphs.2"] { left: 128px; top: 771px;  width: 560px; font-size: 12px; }
[data-i18n="paragraphs.3"] { left: 62px;  top: 857px;  width: 410px; font-size: 12px; }
[data-i18n="paragraphs.4"] { left: 53px;  top: 359px;  width: 214px; font-size: 9px;  }
[data-i18n="paragraphs.5"] { left: 60px;  top: 1094px; width: 300px; font-size: 12px; }
```

- [ ] **Step 5: Regenerate and verify no inline paragraph styles + zero Thai**

Run:
```bash
cd forms/50bis && python3 build_interactive.py
grep -c 'class="tx" data-i18n="paragraphs' index.html   # expect 6
grep -c 'class="tx"[^>]*style=' index.html               # expect 0 (no inline para styles)
grep -c '[฀-๿]' index.html || true                       # expect 0
```
Expected: `6`, `0`, `0`.

- [ ] **Step 6: Verify Thai paragraph positions are unchanged in-browser**

Start server from repo root (if not running): `python3 -m http.server 8765` (background).
Use Playwright MCP: navigate to `http://localhost:8765/forms/50bis/index.html`, then evaluate:
```js
() => new Promise(r => setTimeout(() => {
  const p0 = document.querySelector('[data-i18n="paragraphs.0"]');
  const cs = getComputedStyle(p0);
  r({ left: cs.left, top: cs.top, width: cs.width, fontSize: cs.fontSize, text: !!p0.textContent });
}, 600))
```
Expected: `left:"100px", top:"553px", width:"560px", fontSize:"12px", text:true` (paragraph still positioned identically and filled with Thai text).

- [ ] **Step 7: Commit**

```bash
git add forms/50bis/strings.json forms/50bis/build_interactive.py forms/50bis/form.css forms/50bis/index.html
git commit -m "refactor: move paragraph positions from inline style to form.css (per-language override prerequisite)"
```

---

### Task 3: English paragraph layout overrides (`body.lang-en`)

Tune the English paragraph geometry so the longer English wording fits without overlap/overflow. Values are tuned visually; the steps below give a starting point and a verification loop.

**Files:**
- Modify: `forms/50bis/form.css` (add `body.lang-en [data-i18n="paragraphs.N"]` rules)

- [ ] **Step 1: Add English override rules (starting values)**

In `forms/50bis/form.css`, immediately AFTER the 6 base paragraph rules from Task 2, add:
```css
/* English paragraph overrides — wider/repositioned for longer English wording.
   Tuned against the rendered page (see Step 2). */
body.lang-en [data-i18n="paragraphs.0"] { width: 600px; font-size: 11px; }
body.lang-en [data-i18n="paragraphs.1"] { width: 560px; font-size: 11px; }
body.lang-en [data-i18n="paragraphs.2"] { width: 580px; font-size: 11px; }
body.lang-en [data-i18n="paragraphs.3"] { width: 430px; font-size: 11px; }
body.lang-en [data-i18n="paragraphs.4"] { width: 230px; font-size: 8px;  }
body.lang-en [data-i18n="paragraphs.5"] { width: 320px; font-size: 11px; }
```

- [ ] **Step 2: Verify English layout in-browser and adjust**

With the server running, Playwright MCP: navigate to the form, then:
```js
() => new Promise(r => setTimeout(() => {
  document.getElementById('langBtn').click();           // switch to EN
  setTimeout(() => {
    const out = {};
    [0,1,2,3,4,5].forEach(i => {
      const el = document.querySelector(`[data-i18n="paragraphs.${i}"]`);
      const cs = getComputedStyle(el);
      out['p'+i] = { fontSize: cs.fontSize, width: cs.width,
                     scrollH: el.scrollHeight, clientH: el.clientHeight,
                     text: el.textContent.slice(0,30) };
    });
    r(out);
  }, 400);
}, 600))
```
Take a screenshot too. Check that each English paragraph: (a) shows English text, (b) does not visibly overlap the next form row, (c) is not clipped. If a paragraph overlaps the row below or runs long, reduce its `font-size` by 0.5px or narrow/move it (add `top`/`left` to its `body.lang-en` rule) and re-run. Iterate until clean. (No hard pixel target — the success criterion is "reads cleanly, no overlap, no clipping" against the screenshot.)

- [ ] **Step 3: Fix any English single-line label overflow**

While in EN (from Step 2), screenshot and scan the single-line labels (the `.t`
divs) for any English text that overflows its slot or collides with a neighbor —
the long ones are most at risk: `labels.66`, `labels.104`, `labels.105`,
`labels.118`. For each that overflows, add a targeted override in `form.css`
(after the paragraph overrides). Example shape (only add the ones actually needed,
with values tuned to the screenshot):
```css
/* English single-line labels that need to shrink to fit their slot */
body.lang-en [data-i18n="labels.66"]  { font-size: 11px; }
body.lang-en [data-i18n="labels.105"] { font-size: 10px; }
```
Re-run the EN screenshot until no label overflows or collides. If no label
overflows, add no rules and note that in the commit.

- [ ] **Step 4: Confirm Thai is still unaffected**

Reload (TH default) and screenshot. Thai labels and paragraphs must look exactly as before Task 3 (the `body.lang-en` rules only apply in English).

- [ ] **Step 5: Commit**

```bash
git add forms/50bis/form.css
git commit -m "feat: per-language layout — English paragraph + label overrides via body.lang-en"
```

---

### Task 4: Mark computed fields in the generator + load `baht-text.js`

Add the declarative attributes the engine will read, make the three fields read-only, and include the new script. No engine logic yet (fields stay empty/readonly until Task 5) — harmless.

**Files:**
- Modify: `forms/50bis/build_interactive.py`
- Regenerate: `forms/50bis/index.html`

- [ ] **Step 1: Add `data-compute` + `readonly` to the three computed fields**

In `forms/50bis/build_interactive.py`, find the totals/words `F(...)` calls:
```python
# Totals
F('pay_total',600,972,120,18,'tf money',extra='inputmode="decimal"')
F('tax_total',726,972,110,18,'tf money',extra='inputmode="decimal"')
F('total_words',272,1002,402,18)
```
Replace with (read-only, declaratively computed):
```python
# Totals (auto-computed, read-only): sum the income columns
F('pay_total',600,972,120,18,'tf money',extra='readonly data-compute="sum:pay"')
F('tax_total',726,972,110,18,'tf money',extra='readonly data-compute="sum:tax"')
# Amount-in-words (auto-computed from tax_total, language-aware, read-only)
F('total_words',272,1002,402,18,extra='readonly data-compute="words:tax_total"')
```

- [ ] **Step 2: Add the `baht-text.js` script tag (before `form-engine.js`)**

In `forms/50bis/build_interactive.py`, find the `SCRIPTS` string:
```python
SCRIPTS = '''<script src="../../lib/buddhist-date.js"></script>
<script src="../../lib/image-tool.js"></script>
<script src="../../lib/storage.js"></script>
<script src="../../lib/form-engine.js"></script>
<script>FormEngine.init({ formId: '50bis', lang: 'th', strings: 'strings.json' });</script>
'''
```
Replace with (baht-text loaded before the engine that uses it):
```python
SCRIPTS = '''<script src="../../lib/buddhist-date.js"></script>
<script src="../../lib/image-tool.js"></script>
<script src="../../lib/storage.js"></script>
<script src="../../lib/baht-text.js"></script>
<script src="../../lib/form-engine.js"></script>
<script>FormEngine.init({ formId: '50bis', lang: 'th', strings: 'strings.json' });</script>
'''
```

- [ ] **Step 3: Regenerate and verify the attributes/script are present**

Run:
```bash
cd forms/50bis && python3 build_interactive.py
grep -o 'data-compute="[^"]*"' index.html              # expect 3 lines: sum:pay, sum:tax, words:tax_total
grep -c 'baht-text.js' index.html                       # expect 1
grep -c 'readonly' index.html                           # expect >= 3
grep -c '[฀-๿]' index.html || true                      # expect 0
```
Expected: the three `data-compute` values, `1`, `>=3`, `0`.

- [ ] **Step 4: Commit**

```bash
git add forms/50bis/build_interactive.py forms/50bis/index.html
git commit -m "feat: mark pay_total/tax_total/total_words as computed+readonly; load baht-text.js"
```

---

### Task 5: Engine `recompute()` — totals + amount-in-words

**Files:**
- Modify: `lib/form-engine.js`

- [ ] **Step 1: Add the `BahtText` reference**

In `lib/form-engine.js`, at the top of the IIFE:
```js
(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;
```
Add a line so it reads:
```js
(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;
  var Baht = root.BahtText;
```

- [ ] **Step 2: Add `num`, `fmt`, and `recompute` (before `setLang`)**

In `lib/form-engine.js`, locate the comment line `// POC language helpers, kept.` (just above `applyLangText`). Immediately BEFORE that line, insert:
```js
  // ---- computed fields (declared via data-compute on the inputs) ----
  function num(v) { var x = parseFloat(String(v).replace(/[, ]/g, '')); return isNaN(x) ? 0 : x; }
  function fmt(x) { return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // sum:<prefix>  -> total of inputs named <prefix>0..<prefix>N (e.g. pay0..pay13)
  // words:<name>  -> language-aware baht text of the field named <name>
  function recompute() {
    document.querySelectorAll('.page input[data-compute^="sum:"]').forEach(function (el) {
      var prefix = el.getAttribute('data-compute').slice(4);
      var re = new RegExp('^' + prefix + '\\d+$');
      var total = 0, any = false;
      fields().forEach(function (r) {
        if (!re.test(r.name)) return;
        var v = r.value.trim();
        if (v !== '') { any = true; total += num(v); }
      });
      el.value = any ? fmt(total) : '';
    });
    document.querySelectorAll('.page input[data-compute^="words:"]').forEach(function (el) {
      var srcName = el.getAttribute('data-compute').slice(6);
      var ref = document.querySelector('.page input[name="' + srcName + '"]');
      if (!ref || ref.value.trim() === '' || !Baht) { el.value = ''; return; }
      el.value = state.lang === 'en' ? Baht.english(num(ref.value)) : Baht.thai(num(ref.value));
    });
  }
```

- [ ] **Step 3: Call `recompute()` on input/change**

In `lib/form-engine.js`, find this line inside `init`:
```js
    fields().forEach(function (el) { el.addEventListener('input', scheduleSave); el.addEventListener('change', scheduleSave); });
```
Replace with:
```js
    fields().forEach(function (el) {
      el.addEventListener('input', function () { recompute(); scheduleSave(); });
      el.addEventListener('change', function () { recompute(); scheduleSave(); });
    });
```

- [ ] **Step 4: Recompute after restore and on language switch**

In `lib/form-engine.js`, find in `init`:
```js
      restore(map);
      setLang(opts.lang || ui.lang || 'th'); // explicit opts.lang lets each page force its language
```
Replace with:
```js
      restore(map);
      recompute();
      setLang(opts.lang || ui.lang || 'th'); // explicit opts.lang lets each page force its language
```
Then find, near the end of `setLang`:
```js
    applyLangText(en);
    if (en) requestAnimationFrame(fitEnglish);
    scheduleSave();
```
Replace with:
```js
    applyLangText(en);
    recompute(); // amount-in-words is language-specific; totals reformat
    if (en) requestAnimationFrame(fitEnglish);
    scheduleSave();
```

- [ ] **Step 5: Export `recompute` for in-browser checks**

In `lib/form-engine.js`, find the export object:
```js
  root.FormEngine = {
    init: init, flush: persist, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _setLang: setLang, _fields: fields
  };
```
Replace with:
```js
  root.FormEngine = {
    init: init, flush: persist, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _setLang: setLang, _fields: fields, _recompute: recompute, _num: num, _fmt: fmt
  };
```

- [ ] **Step 6: Add a unit test for the parse/format helpers**

The engine module is `require`-able in Node (its IIFE only defines functions and sets `root.FormEngine`; `document` is touched only inside `init`, never at load). Create `test/compute.test.js`:

```js
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
```

Run: `node --test test/compute.test.js`
Expected: PASS. (If `require` returns `{}` because the module set a different `root`, confirm the IIFE ends with `})(typeof self !== 'undefined' ? self : this);` — in Node `this` is `module.exports`, so `root.FormEngine` lands on the export.)

- [ ] **Step 7: Verify totals + words in-browser (Thai)**

With the server running, Playwright MCP: navigate to `http://localhost:8765/forms/50bis/index.html`, then:
```js
() => new Promise(r => setTimeout(() => {
  function set(name, v){ const el=document.querySelector(`input[name="${name}"]`); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); }
  set('pay0','1000'); set('pay1','250.50');
  set('tax0','30'); set('tax1','7.55');
  setTimeout(() => r({
    pay_total: document.querySelector('input[name="pay_total"]').value,
    tax_total: document.querySelector('input[name="tax_total"]').value,
    total_words: document.querySelector('input[name="total_words"]').value,
    lang: window.FormEngine._state.lang
  }), 200);
}, 600))
```
Expected: `pay_total:"1,250.50"`, `tax_total:"37.55"`, `total_words:"สามสิบเจ็ดบาทห้าสิบห้าสตางค์"`, `lang:"th"`.

- [ ] **Step 8: Verify words switch to English on toggle**

Playwright MCP (same page, continue):
```js
() => new Promise(r => setTimeout(() => {
  document.getElementById('langBtn').click(); // -> EN
  setTimeout(() => r({
    lang: window.FormEngine._state.lang,
    tax_total: document.querySelector('input[name="tax_total"]').value,
    total_words: document.querySelector('input[name="total_words"]').value
  }), 300);
}, 100))
```
Expected: `lang:"en"`, `tax_total:"37.55"`, `total_words:"thirty-seven baht fifty-five satang"`.

- [ ] **Step 9: Run the JS test suite (no regressions)**

Run: `node --test test/`
Expected: PASS (baht-text, compute, buddhist-date, image-tool).

- [ ] **Step 10: Commit**

```bash
git add lib/form-engine.js test/compute.test.js
git commit -m "feat: engine recompute() — auto totals + language-aware amount-in-words"
```

---

### Task 6: Computed-field styling, print check, and docs

**Files:**
- Modify: `forms/50bis/form.css`
- Modify: `README.md`

- [ ] **Step 1: Add a subtle read-only/computed style**

In `forms/50bis/form.css`, find the input-overlay block, specifically:
```css
#ov input.money { text-align: right; }
```
Immediately AFTER it, add:
```css
/* Computed (read-only) fields: subtle tint so users see they're auto-filled. */
#ov input[readonly] { background: rgba(19, 115, 51, .07); cursor: default; }
```
Then find the print block:
```css
@media print {
  .toolbar { display: none; }
  #ov input { color: #000; }
  body.show-fields #ov input { outline: 0; background: transparent; }
}
```
Replace with (so the computed tint never prints):
```css
@media print {
  .toolbar { display: none; }
  #ov input { color: #000; }
  #ov input[readonly] { background: transparent; }
  body.show-fields #ov input { outline: 0; background: transparent; }
}
```

- [ ] **Step 2: Verify the tint shows on screen and the print check**

With the server running, Playwright MCP: navigate to the form, then:
```js
() => new Promise(r => setTimeout(() => {
  const t = document.querySelector('input[name="tax_total"]');
  const screen = getComputedStyle(t).backgroundColor;
  r({ screen }); // expect a greenish rgba, not transparent
}, 600))
```
Expected: `screen` is a non-transparent greenish color (e.g. `rgba(19, 115, 51, 0.07)`).
Then take a screenshot in print emulation if available, or visually confirm in Step 4 of the manual run that read-only fields read as black with no tint when printed.

- [ ] **Step 3: Update the README feature list**

In `README.md`, find the bullet list near the top:
```markdown
- Bilingual Thai/English. Buddhist↔Gregorian year conversion.
- Upload, make-transparent (white→transparent), and resize your stamp and signature.
- Print or Save as PDF.
```
Replace with:
```markdown
- Bilingual Thai/English — switching language swaps both the text and a
  per-language layout (font, position, size). Buddhist↔Gregorian year conversion.
- Auto-calculated income totals; total tax rendered as Thai/English words.
- Upload, make-transparent (white→transparent), and resize your stamp and signature.
- Print or Save as PDF.
```

- [ ] **Step 4: Final full verification**

Run:
```bash
node --test test/                                   # all green
cd forms/50bis && python3 build_interactive.py      # regen
grep -c '[฀-๿]' index.html || true                  # 0
cd ../.. && git status --short                       # only intended files
```
Expected: tests pass, zero Thai in `index.html`. Do one manual pass in the browser: fill a couple of income rows → totals + Thai words appear; toggle EN → words become English and paragraphs reflow cleanly; open the browser print preview → toolbar hidden, fields black, no computed tint, stamp/signature print.

- [ ] **Step 5: Commit**

```bash
git add forms/50bis/form.css forms/50bis/index.html README.md
git commit -m "feat: computed-field styling + print handling; docs update"
```

---

## Notes for the implementer

- **Don't reintroduce Thai into `index.html`.** All visible text comes from `strings.json` at runtime; the grep check is the gate.
- **Computed fields are derived.** They're saved like any field (harmless), but `recompute()` overwrites them on load/lang-switch, so stale stored values can never surface.
- **Income row count is 14** (`pay0..pay13`, `tax0..tax13`); the `sum:` prefix regex handles any count, so no constant to keep in sync.
- **toFixed is the rounding authority.** Don't hand-roll rounding in `baht-text.js`; if a test's expected value disagrees with `(x).toFixed(2)`, the test value is what changes.
- **Tuning paragraphs (Task 3)** has no exact pixel target — the bar is "reads cleanly, no overlap, no clipping" judged from the screenshot. Iterate font-size/width/top in the `body.lang-en` rules.
