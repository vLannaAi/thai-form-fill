# Thai Form Fill

Open-source, browser-only filler for Thai bureaucratic forms. First form: the
50 Bis withholding-tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย).

- No accounts, no server. All data — including stamp & signature images — stays
  in your browser via IndexedDB.
- Bilingual Thai/English — switching language swaps both the text and a
  per-language layout (font, position, size). Buddhist↔Gregorian year conversion.
- Auto-calculated income totals; total tax rendered as Thai/English words.
- Upload, make-transparent (white→transparent), and resize your stamp and signature.
- Print or Save as PDF.

## Tech stack

- **Landing page**: Nuxt 4 + Vue 3 + Nuxt UI v4 (Tailwind CSS v4), client-only
  SPA (`ssr: false`). Source lives in `app/` (Nuxt 4's default `srcDir`).
- **Form engine**: vanilla JS, served as static assets — zero framework coupling
- **Storage**: browser IndexedDB, no backend

Requires **Node.js 22+** (Nuxt 4).

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000/
```

The `predev` hook auto-generates `app/assets/data/forms.json` from
`public/forms/`. The `dev` script sets `TMPDIR=/tmp` to dodge a macOS
vite-node socket bug ([nuxt#35258](https://github.com/nuxt/nuxt/issues/35258))
that triggers on long default `TMPDIR` paths.

## Static build (GitHub Pages)

```bash
NUXT_APP_BASE_URL=/thai-form-fill/ npm run generate
# output: .output/public/
```

## Privacy

Your form data never leaves your browser — it is stored only in IndexedDB on
your device, with no accounts and no backend. The one exception is the **Sarabun
web font**, loaded from `fonts.googleapis.com` for consistent Thai typography;
that request is visible to Google.

## Studio (layout authoring)

Run the app locally (`npm run dev`) and navigate to a form on `localhost`.
Click **Studio** in the toolbar. Click any label, paragraph, fill cell, or
checkbox to select it, then:

- **arrow keys** — move 1px
- **`a` / `d`** — width −/＋ 1px · **`w` / `s`** — height −/＋ 1px
- **`+` / `-`** — font size ±1 visual px
- **hold `Shift`** — overlay every item's box as alignment references
- live `x, y` / size / font shown in the toolbar; **Enter**/**Esc** deselect

Click **Save changes** to write `public/forms/<name>/layout.json`. On Chromium
it asks once for the `public/forms/<name>` folder (read-write), then writes
`layout.json` directly and keeps a timestamped backup (`layout.<datetime>.json`,
gitignored); other browsers download the file to commit manually.
The Studio button only appears on `localhost`.

## Add a new form

1. Create `public/forms/<name>/` with `index.html`, `strings.json`, form assets.
2. Add a `meta.json` for the landing-page card description (optional):
   ```json
   { "descTh": "...", "descEn": "..." }
   ```
3. The landing page discovers the new form automatically via the `prebuild` hook.

See `public/forms/50bis/` for a reference implementation.

## Tests

```bash
node --test test/
```
