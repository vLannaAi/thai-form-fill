# Thai Form Fill — Design Spec

**Date:** 2026-06-01
**Status:** Approved (brainstorming) → ready for implementation plan

## Purpose

An open-source, public-utility web app for filling Thai bureaucratic forms in the
browser. The first form is the Thai withholding-tax certificate **50 ทวิ (50 Bis)**.
The app overlays editable fields on a scan of the real government form, supports
Thai/English, persists everything locally (including stamp & signature images), and
prints to an official-looking PDF.

Privacy is a first-class goal: a tax utility must keep data on the user's device.
No network calls, no server-side storage.

## Run model

Served as **static files** (GitHub Pages / any static host; locally via a dev
server). "Just HTML + JavaScript" means **no build step and no framework** — not "no
server". This matters because IndexedDB is unreliable on `file://` origins. Served
origins make IndexedDB fully reliable and persistent.

## Repository layout

```
thai-form-fill/
├── index.html                 # landing page: form picker
├── lib/
│   ├── engine.css             # console + field styles (shared)
│   ├── storage.js             # IndexedDB wrapper (values + image blobs)
│   ├── image-tool.js          # upload -> crop/resize -> white->transparent
│   ├── buddhist-date.js       # BE<->CE conversion helpers
│   └── form-engine.js         # console actions, autosave, lang, slots, wiring
├── forms/
│   └── 50bis/
│       └── index.html         # form markup (background image + fields + slots)
└── docs/
    └── 50bis_form_bilingual.html   # original POC (kept for reference)
```

Each new form = a new folder under `forms/` reusing `lib/` unchanged. The form HTML
is the only per-form file; it declares fields and image slots via `data-*`
attributes. The engine reads the DOM — no separate config file to drift out of sync.

Loaded via classic `<script>` tags (no ES modules / no `fetch`), keeping the option
of opening locally open while targeting served hosting.

## Components

### lib/storage.js — IndexedDB wrapper
One DB `thai-form-fill`, two object stores:

- `fields` — keyed by `formId` (e.g. `"50bis"`). Value = `{ fieldName: value }` map.
  A reserved key holds UI prefs (`lang`, `showFields`).
- `images` — keyed by `formId:slot` (e.g. `"50bis:signature"`). Value =
  `{ blob: PNG Blob, w, h }`.

API (Promise-based, thin): `openDB()`, `loadFields(formId)`, `saveFields(formId, map)`,
`loadImage(formId, slot)`, `saveImage(formId, slot, blob, meta)`, `deleteImage(...)`,
`clearForm(formId, {keepImages})`.

On open failure: resolve to a no-op stub and signal the engine to show a
non-blocking "autosave unavailable" banner. The form stays usable.

### lib/image-tool.js — stamp & signature processor
A modal dialog driven by `<canvas>`:
1. **Upload** an image file (reject non-images; cap max dimension, e.g. 2000px,
   downscaling before processing).
2. **Crop** — drag a rectangle; **resize** the crop.
3. **White → transparent** — key out near-white pixels on canvas with an adjustable
   threshold slider (so a stamp/signature photographed on white paper drops its
   background). Default threshold tuned for paper white; preview live.
4. **Apply** — export `canvas.toBlob()` PNG, hand back to the engine.

Pure function core (`makeTransparent(imageData, threshold)`) so it is unit-testable
without the DOM.

### lib/buddhist-date.js — year conversion
- `beToCe(y) = y - 543`, `ceToBe(y) = y + 543`.
- `parseDMY(str)` — strict `dd/mm/yyyy` parser; returns `null` if not an exact match.
- `guessUnit(year)` — 4-digit year `>= 2400` → BE, else CE.

### lib/form-engine.js — orchestration
- Reads all `.page input` and `[data-slot]` elements from the form DOM.
- Wires the edit console buttons.
- Debounced autosave (~300ms) to `storage` on `input`/`change`.
- On load: restores field values, images, and UI prefs.
- Language toggle (extends the POC's `toggleLang` / `fitEnglish` / `applyLangText`).
- Year display conversion (see below).
- Clear submission / Reset all (see below).

### forms/50bis/index.html — the form
The POC markup, refactored: background scan on `.page`, English mask layer
(`.enlayer`), absolutely-positioned inputs. Additions:
- `data-role="owner"` on owner-data fields.
- `data-type="be-year"` on `f_year_pay`; `data-type="dmy"` on `f_date*`.
- Two slot elements: `<img data-slot="signature">` and `<img data-slot="stamp">`.
- The standalone `clearAll()` button removed; console drives all actions.

## The edit console (top toolbar)

Print-hidden. Buttons:
- **EN / ไทย** — language toggle.
- **Show/hide fields** — `show-fields` outline toggle.
- **Stamp**, **Signature** — open the image tool for that slot.
- **Clear submission** — clears per-document fields, keeps owner data + images.
- **Reset all** — clears everything incl. owner fields + stored images (confirm).
- **Print / Save PDF** — `window.print()`.

## Owner vs. submission data (50bis)

`data-role="owner"` marks preserved fields. **Clear submission** clears all fields
*except* owner-role fields, and keeps stored images. **Reset all** clears both and
deletes images.

**Owner (preserved):**
- Payer block: `name1, tin1, add1, id1`
- `book_no, run_no`
- Payer method: `chk8, chk9, chk10, chk11, spec4`
- Stamp & signature images

**Submission (cleared):**
- Payee block: `name2, tin1_2, add2, id1_2`
- All amount/tax/date rows (`pay1.*`, `tax1.*`, `date1..14`, `date14.*`)
- Income-type checkboxes `chk1..chk7`
- `rate1`, `spec1`, `spec3`, `total`, `Text1.*`
- Issue date: `date_pay, month_pay, year_pay`

## Stamp & signature placement

Auto-anchored to fixed slots (only size adjustable):
- signature → slot anchored on the *"sign … payer"* line.
- stamp → slot anchored on the *"Affix Corporate Seal"* box.

Slots are `<img>` overlays positioned like inputs (absolute, `z-index` above the
background, below focusable inputs where needed). They print. Stored blob is loaded
into the slot on page open. A small size control (slider or +/-) adjusts displayed
size; size persists in the `images` store metadata.

## Buddhist ↔ Gregorian year

- `f_year_pay`: **stored as BE**. TH view & print show BE; EN view shows CE. Toggling
  language converts the displayed value. Track the currently displayed unit with a
  `data-unit` attribute to avoid double-conversion.
- `f_date1…f_date14`: convert the year portion **only** when the value strictly
  matches `dd/mm/yyyy`; otherwise leave untouched.
- Input heuristic: a 4-digit year `>= 2400` is treated as BE, else CE — so the user
  may type either; stored/printed value is normalized to BE.

## Error handling & edge cases

- Storage open failure → non-blocking banner; form remains usable in-memory.
- Image tool: reject non-image files; cap dimensions before canvas work.
- Year conversion: ignore non-numeric/short years; never convert twice.
- Print: console and field outlines hidden; inputs and slot images render in black.

## Testing

Front-end app — manual test checklist (run in a browser before declaring done):
1. Autosave round-trip: type values, reload, values restored.
2. Clear submission preserves the owner block + images; clears payee/amounts/dates.
3. Reset all wipes everything including images.
4. Language toggle: year field shows BE in TH, CE in EN, both directions, no
   double-conversion; English mask layer still fits.
5. Image tool: upload → crop → make-transparent → apply; image appears in slot,
   persists across reload, prints.
6. Strict `dd/mm/yyyy` date converts its year; freeform date untouched.
7. Print output: no console/outlines; fields + images in black.

Pure-function cores (`makeTransparent`, `beToCe`/`ceToBe`/`parseDMY`) are
unit-testable without the DOM.

## Out of scope (YAGNI)

- Server-side anything, accounts, sync.
- Additional forms (architecture supports them; only 50bis is built now).
- Free drag positioning of images (fixed slots chosen).
- OCR / auto-extraction of values.
