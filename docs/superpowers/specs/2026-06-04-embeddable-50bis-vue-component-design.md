# Embeddable 50 Bis — Vue 3 Component Design

**Date:** 2026-06-04
**Status:** Approved (design); pending implementation plan
**Topic:** Make the 50 Bis withholding-tax form template embeddable in third-party Vue apps.

## Goal

Package the existing 50 Bis form as `@lanna/form-50bis`, a **Vue 3 component** that host
apps drop in for **interactive editing** of a withholding-tax certificate. The host owns
persistence; the component takes/returns data via the project's JSON Schema and can print
the certificate on demand.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Embed mode | Interactive editing (host receives filled data; host owns saving) |
| Layout source | **Baked** static asset; **no** GitHub fetch, **no** token gate, **no** Studio editor in the embed (Studio stays in the standalone app for authoring) |
| Packaging | **Vue 3 npm component** (idiomatic SFC, `vue` as peer dependency) |
| UI surface | **Chromeless** — host drives via props / events / exposed methods; no built-in toolbar |
| Build approach | **C — embedded mode in the existing engine** (parameterize `form-engine.js`; one source of truth; additive) |

## Non-goals

- No Studio layout editing, token handling, GitHub I/O, or IndexedDB in the embed.
- No built-in toolbar, sample-fill, or chrome (host composes its own).
- Read-only/display mode is out of scope for v1 (interactive only).
- `exportPdf()` is a v2 stretch; v1 ships `print()`.

## Architecture

New package `packages/form-50bis/`, published to npm, `vue` as a **peer dependency**.

It reuses the existing engine through a new **embedded mode** rather than a rewrite:

```
FormEngine.init({
  root,            // Element to scope ALL DOM queries to (default: document → standalone app unchanged)
  layout,          // baked layout object (was fetched from GitHub)
  strings,         // baked strings object (was fetched)
  lang,            // 'th' | 'en'
  data,            // initial data (JSON-Schema shape)
  embedded: true,  // skip token gate, GitHub fetch, IndexedDB, Studio
  onChange,        // callback(dataOut) on field edits
})
```

- `root` scoping is the core change: every `document.querySelector('.page input…')` /
  `getElementById` in `form-engine.js` becomes a query against `root`. Passing `document`
  preserves current standalone behavior; passing the component's element enables embedding
  **and multiple instances per page**.
- When `embedded`, the engine does **not** call `showTokenGate`, `loadLayout` (GitHub),
  `Storage`/IndexedDB, or `studio.js`. `layout` and `strings` arrive as objects.

The package bundles, as static assets:
- the form markup (the `#pf1` overlay + background block, extracted from `index.html`),
- `form.css` (scoped — see Styling),
- `layout.json`, `strings.json`, `assets/background.svg`,
- self-hosted fonts (JetBrains Mono + Sarabun, woff2).

The Vue SFC `<Form50Bis>`:
- **mount:** inject the scoped stylesheet once; render the form markup into its root
  `<div class="tff-50bis">`; call `FormEngine.init({ root: el, layout, strings, lang, data })`.
- **reactivity:** watch `modelValue` → push into the engine (set fields); engine `onChange`
  → debounced `emit('update:modelValue', data)`.
- **`defineExpose({ print, getResult, setLanguage })`** (plus `exportPdf` in v2).
- **unmount:** engine teardown (remove listeners/timers).

## Component API (chromeless)

**Props**
- `modelValue: Form50BisInput` (`v-model`) — data per the JSON Schema. Dotted input names
  already equal the schema leaf paths, so the adapter is near 1:1.
- `language: 'th' | 'en'` (default `'th'`).
- `signature?: string`, `stamp?: string` — optional image data-URLs rendered into the slots.
  Host provides any upload UI.
- `showFieldOutlines?: boolean` (default `false`) — the old debug tint.

**Events**
- `update:modelValue` — on edit, debounced ~300 ms.
- `change` — `{ data, totals }` where `totals = { amountPaid, taxWithheld, taxInWords }`
  (computed, read-only).

**Exposed methods (via `ref`)**
- `print()` — print just the certificate (isolated; see Print).
- `getResult()` — synchronous `{ data, totals }`.
- `setLanguage(lang)`.
- `exportPdf()` — **v2 stretch** (browser print-to-PDF path).

## Data flow

Single contract = `docs/50bis-input.schema.json`. A small **pure, unit-tested** module
`schemaAdapter` does the mapping:

- `toFields(data)`: flatten the schema object to dotted field names; split a 13/10-digit
  `taxId`/`legacyTaxId` string across `.1..5` / `.1..4` segments; map the `formType` and
  `taxPaymentCondition.condition` **enums** to their one-hot checkboxes; map the income
  array index → row fields (`income.<i>.amountPaid` …).
- `toData(fields)`: inverse — collect inputs and nest back into the schema shape.

Computed totals (`recompute()`) are surfaced only in `change` / `getResult`; they are never
written back into `modelValue`.

## Styling, fonts, print

- **CSS scoping:** a build step rewrites all form selectors under `.tff-50bis` (`#ov`,
  `.pf`, pdf2htmlEX `ff*/fs*/...` classes), so host CSS cannot disturb the pixel-positioned
  overlay and the form's CSS cannot leak into the host. The form has a fixed intrinsic
  canvas size; the host scales it with a documented CSS-transform wrapper.
- **Fonts:** self-hosted JetBrains Mono + Sarabun via `@font-face` in the scoped stylesheet
  (no Google Fonts CDN dependency). Slashed-zero `font-variant-numeric` preserved.
- **Print:** `print()` clones the form root + scoped CSS into an **off-screen iframe** and
  calls `iframe.contentWindow.print()`. This isolates the certificate from host chrome and
  host print CSS, and reuses the existing `@media print` rules. Replaces `window.print()`.

## Dropped in embedded mode

Token gate, GitHub layout fetch, IndexedDB persistence, Studio editor, built-in toolbar,
sample-fill. All remain available in the standalone app (which passes `document` as `root`
and `embedded: false`).

## Build / distribution / testing

- **Build:** Vite library mode → ESM (and optional UMD); `vue` peer dep; assets shipped
  with the package; emit TypeScript types including `Form50BisInput` (generated from / kept
  in sync with the JSON Schema).
- **Tests:**
  - Unit: `schemaAdapter` round-trip (`data → fields → data` is identity for a populated
    instance, incl. TIN segmentation and enum/checkbox mapping); `recompute` (already
    covered).
  - Integration (Playwright, reusing the existing headless harness): mount the component,
    set `modelValue`, assert rendered field values; assert the print-iframe contains the
    certificate.
  - Regression: the standalone app's existing test suite must stay green (root defaults to
    `document`).

## Risks & mitigations

- **Root-scoping `form-engine.js`** touches many `document.*` queries — the main refactor.
  Bounded and mechanical; mitigate by defaulting `root = document` and running the full
  standalone suite + a live smoke before/after.
- **Fixed canvas size** assumes a known geometry (`background.svg` + absolute positions);
  arbitrary host layouts need the documented sizing/scale wrapper.
- **Signature/stamp** stay chromeless (data-URL props); richer editing is the host's job.
- **Schema ↔ type drift:** keep `Form50BisInput` generated from or checked against the JSON
  Schema so the published types can't diverge from the contract.

## Open questions for the plan (not blocking design)

- Monorepo layout: `packages/form-50bis/` in this repo vs. a separate repo. (Lean: in-repo
  package, since it shares the engine and assets.)
- Whether to inline assets (single-file bundle) or ship them as separate files.
