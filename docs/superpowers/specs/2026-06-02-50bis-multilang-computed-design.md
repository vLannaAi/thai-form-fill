# 50 Bis — Structural Multilanguage + Computed Fields — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Builds on:** `forms/50bis/` (runtime-i18n form), `lib/` shared engine

## Goal

Make language a structural dimension of the 50 Bis form (text **and** layout swap
together), and add two computed conveniences the form itself calls for:
auto-calculated column totals and an amount-in-words field.

## Scope

**In:**
1. Language architecture — switching language swaps `strings[lang]` **and** a
   per-language CSS layout (`body.lang-en` overrides), so English renders to fit
   instead of being cramped into the Thai layout.
2. Auto-calculate totals — income columns sum into the total fields, live.
3. Amount-in-words (Thai + English) — the total tax renders as words, language-aware.

**Out (deferred to later specs):** field validation (Tax-ID checksum),
import/export of form data, mobile/responsive, accessibility pass.

## Architecture

The form is already a text-free template (`index.html`) whose strings load at
runtime from `strings.json` via `lib/form-engine.js`. Three additions, all
riding events the engine already has:

- **`input` event** → recompute totals and amount-in-words.
- **language switch (`setLang`)** → re-render amount-in-words (language-specific),
  reformat numbers, and let pure CSS reflow the text layer via `body.lang-en`.

No new framework, no third-party dependencies, all client-side. Persistence is
unchanged; computed fields are derived (recomputed on load), not trusted from
storage.

---

## Component 1 — Language architecture (per-language text layout)

**Principle:** `language = strings[lang] + body.lang-en style overrides`. The
toggle already flips `body.lang-en` and re-renders strings; we make *layout*
respond too.

**Why a change is needed:** inline `style="left:…"` has higher specificity than
any class/attribute selector, so `body.lang-en .tx{…}` would silently lose to an
inline base position. The base positions of elements that differ by language must
therefore live in CSS.

**What moves:**

- **Paragraphs** (the 6 rebuilt multi-line blocks) — the layer that is cramped in
  English today.
  - `strings.json` paragraph entries **drop `x/y/w/sz`**, keeping only `hide` +
    `th/en`. `strings.json` becomes pure text + structure.
  - `build_interactive.py` emits `<div class="tx" data-i18n="paragraphs.N"></div>`
    with **no inline style**.
  - `form.css` carries the Thai base geometry and the English overrides:
    ```css
    /* Thai base = current strings.json x/y/w/sz (Thai rendering unchanged) */
    [data-i18n="paragraphs.0"]{left:100px;top:553px;width:560px;font-size:12px;}
    /* English override — example shape; exact px tuned visually at implementation */
    body.lang-en [data-i18n="paragraphs.0"]{top:548px;width:600px;font-size:11px;}
    ```
    Each of the 6 paragraphs gets a base rule; English overrides are added only
    where the English wording needs different geometry, and the exact pixel values
    are tuned against the rendered page during implementation (Playwright check).

- **Labels** (`.t` divs) — already positioned by pdf2htmlEX CSS classes (not
  inline). No structural change. English labels that overflow get targeted
  overrides added during tuning:
  `body.lang-en [data-i18n="labels.66"]{font-size:11px;}`.

- **Inputs** (71 fields) — **unchanged**, stay inline. Their geometry is
  language-neutral (numbers, dates, names).

**Toggle flow (unchanged mechanism, extended effect):**
`setLang(lang)` → set `state.lang` → toggle `body.lang-en` → `applyLangText`
(strings) → **`recompute()`** (reformat numbers, re-render words) → CSS reflows
the text layer automatically.

---

## Component 2 — Auto-calculate totals

- **Inputs:** `pay0…pay13`, `tax0…tax13` (14 income rows).
- **Outputs:** `pay_total` = Σ pay rows; `tax_total` = Σ tax rows.
- **Parse:** strip thousands separators and spaces, parse float; non-numeric →
  treated as 0. Empty when all rows empty → total shows empty (not `0.00`).
- **Display:** formatted `#,##0.00` (e.g. `1,234.56`). Row inputs are left as the
  user types them (no reformat-on-type); only the two totals are formatted.
- **Read-only:** totals carry `readonly` and a subtle "computed" style. You fill
  rows; totals follow. This matches the form's semantics (a total *is* the sum).
- **Declarative marking:** `data-compute="sum:pay"` and `data-compute="sum:tax"`
  on the total inputs; the engine reads these (no hard-coded field lists).

---

## Component 3 — Amount-in-words (Thai + English)

- **New shared module `lib/baht-text.js`** — pure functions, no DOM:
  - `bahtText(amount)` → Thai baht text.
  - `bahtTextEn(amount)` → English baht text.
  - Examples:
    - `1250.50` → TH `หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์`,
      EN `one thousand two hundred fifty baht fifty satang`
    - `100` → TH `หนึ่งร้อยบาทถ้วน`, EN `one hundred baht`
    - `21` → TH `ยี่สิบเอ็ดบาทถ้วน`
  - Thai rules: `เอ็ด` for trailing 1 in a group ≥ 11, `ยี่สิบ` for 20-prefix,
    `ล้าน` chunking for ≥ 1,000,000; whole amounts → suffix `ถ้วน`; satang from the
    two decimal places (rounded). English: standard scale words, `baht`/`satang`.
- **Wiring:** `total_words` field carries `data-compute="words:tax_total"`. The
  engine fills it from `tax_total` (the field is literally "total tax withheld and
  remitted, in words"). **Read-only**, language-dependent → re-rendered on toggle.

---

## Data flow

```
user types in pay{n}/tax{n}
        │ input event
        ▼
recompute():
   sum pay rows  → format → pay_total.value
   sum tax rows  → format → tax_total.value
   bahtText(tax_total, lang) → total_words.value
        ▲
        │ also called after restore() on load,
        │ and inside setLang() on language switch
language toggle ─────────────────────────────────┘
   (also: body.lang-en flips → CSS reflows text layer)
```

## Engine changes (`lib/form-engine.js`)

- Add `recompute()`:
  - For each `[data-compute^="sum:"]`, sum the `<prefix>N` inputs, format, set value.
  - For each `[data-compute^="words:"]`, read the referenced field's numeric value,
    call `baht-text` for the current language, set value.
- Call `recompute()` from: the existing `input`/`change` listener path; after
  `restore(map)` on load; and at the end of `setLang()`.
- Computed fields are `readonly`; their stored values are overwritten by
  `recompute()` so storage drift cannot surface stale numbers.
- New `<script src="../../lib/baht-text.js">` include (added by the generator).

## Generator changes (`build_interactive.py`)

- Emit paragraphs without inline `style=` (positions now in `form.css`).
- Add `data-compute` attributes to `pay_total`, `tax_total`, `total_words`, and
  `readonly` to those three inputs.
- Add the `baht-text.js` script tag.

## strings.json changes

- Paragraph entries drop `x/y/w/sz`; keep `hide`, `th`, `en`. Update the
  `_comment` to note positions now live in `form.css`.

## Error handling

- **Bad/edge numbers:** non-numeric row values count as 0; negative totals render
  as-is (user error, not our concern); amounts ≥ 1e15 are clamped/guarded in
  `baht-text` to avoid runaway recursion (return best-effort).
- **No-IndexedDB / file://:** unchanged behavior; computed fields still work
  (they're pure UI), strings still require http (existing constraint).
- **Missing referenced field** in `data-compute="words:X"` → no-op (defensive).

## Testing

- **`test/baht-text.test.js`** (`node --test`): 0, 1, 11, 20, 21, 100, 101, 1000,
  1000000, 1234567, `.50`, `.25` (rounding), `.00` (ถ้วน), large value guard;
  both TH and EN.
- **Sum/format unit:** parse with commas, empty rows, mixed → correct total and
  `#,##0.00` formatting.
- **In-browser (Playwright):** type rows → totals update; `tax_total` → words
  appear; toggle EN → words switch to English and paragraphs reflow without
  overlap; print view stays clean; zero Thai still in `index.html`.

## File structure

```
lib/baht-text.js          NEW  — number → Thai/English baht text (pure, tested)
lib/form-engine.js        EDIT — recompute() + hooks in input/restore/setLang
forms/50bis/build_interactive.py  EDIT — no inline para styles; data-compute; readonly; baht-text script
forms/50bis/form.css      EDIT — paragraph base positions + body.lang-en layout overrides; computed-field style
forms/50bis/strings.json  EDIT — paragraphs drop x/y/w/sz
forms/50bis/index.html    REGEN
test/baht-text.test.js    NEW
```

## Success criteria

- English toggle reflows the text layer (no overlap/overflow); Thai rendering
  unchanged.
- Totals update live, formatted, read-only.
- `total_words` shows correct Thai baht text, switches to English on toggle.
- `index.html` still contains zero Thai; all data still local.
- `node --test` green; in-browser checks pass.
