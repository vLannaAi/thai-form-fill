# Studio Authoring Mode — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Builds on:** `forms/50bis/` (runtime-i18n form), `lib/form-engine.js`, `strings.json`

## Goal

An in-browser visual authoring tool ("Studio") for pixel-perfect alignment of the
form's text and fill cells. Activate it, click an element, nudge it with the arrow
keys and resize its font with `+`/`−`, with on-screen guides and a coordinate
readout, then save the positions to a `layout.json` that the form applies at load.

## Scope

**In:**
- A **Studio** toggle in the toolbar (shown only on localhost). When active it becomes **Save changes**.
- **Select** any text div (`labels.*`, `paragraphs.*`) or fill input (`#ov input.tf`) by clicking it.
- **Nudge** the selected item 1px with arrow keys; **Enter**/**Esc**/click-away deselects.
- **`+`/`−`** change the selected item's font-size by 1 *visual* pixel.
- **Hold Shift** to overlay every selectable item's box (semi-transparent) as alignment references.
- **4 guides** extending the selected box's edges across the page during editing.
- **Info readout** in the toolbar: top-left `x,y`, `w×h`, font-size.
- **Save** writes `layout.json` via the File System Access API (one-click after a one-time grant); download fallback off-Chromium.
- The form **applies `layout.json` at load** for everyone (authoring is local; the tuned layout ships in the committed `layout.json`).

**Out (not this round):** editing widths (paragraph widths stay in `form.css`);
nudging checkboxes / stamp-signature slots; multi-select; undo history; group align.

## Architecture

```
strings.json  → text      ┐
layout.json   → positions ┴→ form-engine.js applies BOTH at load
                                index.html stays generated & position-free
lib/studio.js (inert until "Studio" clicked, localhost only)
   selects/nudges elements, mutates the in-memory layout map,
   writes layout.json on "Save changes" (File System Access API)
```

Two new units, each with one responsibility:
- **`lib/studio.js`** — the editor UI/interaction layer (selection, nudge, font step, guides, shift-overlay, info readout, save). Depends on a small layout API exposed by the engine.
- **Layout API in `lib/form-engine.js`** — loads `layout.json`, captures each selectable element's natural position, applies overrides at load, and exposes helpers studio reuses (so positions render for all users without studio).

## Key scheme

Every selectable element maps to a stable **layout key**:
- Text divs → their `data-i18n` value: `"labels.0"`, `"paragraphs.0"`.
- Fill inputs → `"field." + input.name`: `"field.name1"`, `"field.pay0"`.

`layoutKey(el) = el.dataset.i18n || ('field.' + el.name)`.

Selectable set: `[data-i18n^="labels."]`, `[data-i18n^="paragraphs."]`, `#ov input.tf`
(excludes `.cb` checkboxes, `img.slot`, toolbar, background).

## layout.json schema

```json
{
  "labels.0":     { "x": 80,  "y": 150, "fs": 34 },
  "paragraphs.0": { "x": 100, "y": 553, "fs": 12 },
  "field.name1":  { "x": 80,  "y": 155 }
}
```
- `x`,`y` = target top-left of the element in `.pf` page pixels (the 893×1263 space).
- `fs` = the element's **raw CSS** font-size in px (optional; present only if the font was edited). Studio computes raw from the visual step (see below).
- Missing keys → element keeps its base CSS/class position. Starts as `{}`.

## Coordinate model (labels vs paragraphs unified)

The challenge: paragraphs are top-based (`form.css`), but label `.t` divs use
pdf2htmlEX `bottom` + `transform: scale(0.375)` with `transform-origin: 0 100%`.

**Solution — store absolute `{x,y}`, apply as a measured translate:**
1. At load (after fonts ready, before applying overrides) the engine records each
   selectable element's **baseline**: natural visual top-left relative to `.pf`
   (`getBoundingClientRect` − `.pf` rect) and its base `transform`
   (`getComputedStyle(el).transform`, e.g. `matrix(0.375,0,0,0.375,0,0)` or `none`).
2. Apply an override `{x,y}`:
   ```
   dx = x − natX;  dy = y − natY
   el.style.transform = `translate(${dx}px, ${dy}px)` + (base === 'none' ? '' : ' ' + base)
   ```
   Because `translate` is the outer transform function, the element's final
   rendered box moves exactly `(dx,dy)` page-pixels regardless of the inner scale —
   pixel-perfect and identical for labels and paragraphs. Re-measuring the baseline
   each load makes stored absolute coords robust to later base-CSS changes.

**Font size:** `scale = d` from the base matrix (`0.375` for labels, `1` otherwise).
- Effective (visual) size = rawFontSize × scale. The info box shows the effective size.
- `+`/`−` change the effective size by 1px → `rawNew = (effectiveOld ± 1) / scale`;
  studio sets `el.style.fontSize = rawNew + 'px'` and stores `fs: rawNew`.
- Apply at load: `el.style.fontSize = fs + 'px'` (raw).
- Note: a stored `fs` is an inline style, so it applies in **both** languages and
  overrides the per-language paragraph font-sizes in `form.css` (`body.lang-en …`).
  This is fine for labels/inputs (one font across languages); for the 6 paragraphs
  whose per-language sizing lives in `form.css`, prefer editing position in studio
  and leaving their font to `form.css`. (Per-language `fs` is out of scope.)

## Interactions (studio active)

- **Click** a selectable element → select (blue outline); inputs are NOT editable in
  studio mode (click selects, doesn't focus for typing). Click background/non-selectable → deselect.
- **Arrow keys** → nudge selected 1px (studio intercepts keydown and `preventDefault` so the page/caret doesn't move).
- **Enter** or **Esc** or click-away → deselect (changes are already live in the in-memory map).
- **`+` / `−`** → font-size ±1 visual px on the selected item.
- **Hold Shift** → show `#studio-boxes` overlay: every selectable item's bounding box with a semi-transparent fill (alignment reference); release hides it.
- **Guides** → `#studio-guides`: four lines at the selected box's top/bottom/left/right edges, spanning the page, updated on every nudge.
- **Info readout** (toolbar): live `x, y` (top-left, page px) · `w×h` · font-size (effective).

## Save & persistence (File System Access API)

- The toolbar button toggles studio. When active its label is **Save changes**.
- On activate, studio loads the current `layout.json` (already fetched by the engine) into its working map, so edits accumulate across sessions.
- **Save changes** click:
  1. Serialize the working map to pretty JSON.
  2. If no file handle yet: `handle = await window.showSaveFilePicker({ suggestedName: 'layout.json', types:[{description:'JSON', accept:{'application/json':['.json']}}] })` (user points at `forms/50bis/layout.json`). Cache the handle for the session.
  3. `const w = await handle.createWritable(); await w.write(json); await w.close();`
  4. Brief "Saved" confirmation in the info readout.
- **Fallback** (no `showSaveFilePicker`, e.g. Firefox/Safari): download `layout.json` as a blob and show "Saved to Downloads — ask Claude to commit it."

## Localhost gating

The generator always emits the Studio button + `studio.js` script. On load,
`studio.js` checks `location.hostname`; if it is not `localhost`/`127.0.0.1`/`::1`,
it **hides the Studio button and disables itself**. The layout *apply* path in the
engine always runs, so deployed users see the tuned positions from the committed
`layout.json`; only the editing UI is local-only.

## Engine integration (`lib/form-engine.js`)

- `init({ ..., layout: 'layout.json' })` — fetch layout (tolerate 404 → `{}`).
- After strings applied and `document.fonts.ready`: `captureLayoutBaselines()` then `applyLayout()`.
- `captureLayoutBaselines()` — for each selectable el, store `{natX, natY, base}` in a map keyed by layoutKey.
- `applyLayout()` — for each key in the layout map, `applyLayoutOne(key)`.
- `applyLayoutOne(key)` — compute translate from baseline, set `transform` + `fontSize`.
- Expose for studio: `_layout` (map), `_layoutBaseline`, `_applyLayoutOne`, `_selectable()` (returns the element list), `_layoutKey(el)`.

## Files

```
lib/studio.js                       NEW  — editor (select/nudge/font/guides/overlay/info/save)
forms/50bis/layout.json             NEW  — overrides map, starts {}
lib/form-engine.js                  EDIT — load + baseline-capture + apply layout; expose helpers
forms/50bis/build_interactive.py    EDIT — Studio button in toolbar; <script studio.js>; layout:'layout.json' in init
forms/50bis/form.css                EDIT — studio styles: selection outline, #studio-guides, #studio-boxes, info readout, studio-mode input cursor
forms/50bis/index.html              REGEN
test/studio.test.js                 NEW  — pure-helper unit tests
```

## Error handling

- `layout.json` missing/404 → start with `{}`; no overrides applied.
- Key in `layout.json` with no matching element → skip silently.
- File System Access API unsupported → download fallback (above).
- Save with no edits → still writes the current map (harmless).
- Studio off-localhost → button hidden, all handlers no-op.

## Testing

- **Unit (`node --test`, `test/studio.test.js`):** the pure helpers, factored to be DOM-free —
  `layoutKey({dataset,name})`, `composeTransform(base, dx, dy)` → string, `effToRaw(eff, scale)` / `rawToEff(raw, scale)`.
- **In-browser (Playwright):** activate studio → click a label → 5×ArrowRight moves its rect ~5px → `+` raises effective font → Shift shows `#studio-boxes` → Enter deselects. Confirm deployed-style (non-localhost simulated) hides the button.
- **Save:** verified manually (the OS file picker can't be driven by Playwright); the JSON shape is unit-checked.

## Success criteria

- On localhost, Studio selects text + fill inputs, arrow-nudges 1px, `+`/`−` steps font 1 visual px, shows guides + the shift box-overlay + live `x,y`/size readout.
- Save writes a valid `layout.json`; reloading applies those exact positions (WYSIWYG, labels and paragraphs alike).
- `index.html` stays generated and free of baked positions/Thai; the public form (non-localhost) shows no Studio UI but honors a committed `layout.json`.
- `node --test` green.
