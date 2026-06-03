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

Click **Save changes** to commit `layout.json` straight to GitHub.

**Authoring from the deployed site (no local clone):**

1. Mint a **fine-grained Personal Access Token** (GitHub → Settings → Developer
   settings → Fine-grained tokens): repository access limited to
   **`vLannaAI/thai-form-fill`**, permission **Contents: Read and write**, a
   short expiry.
2. Open the form with the `#studio` hash, e.g.
   `…/forms/50bis/index.html#studio`. The **Studio** button and a token field
   appear. Paste the PAT and click **Save token** (stored only in your browser's
   `localStorage`, never committed). Studio now appears automatically on every
   load in that browser.
3. Edit the layout, then click **Save changes** — it commits to `main` as
   `studio: update <formId> layout`. Conflicts resolve Last-Write-Wins.
4. **Forget** clears the token from your browser.

**Reading:** a token-holder loads the live layout from the authenticated
Contents API; everyone else loads the `layout.json` bundled in the deployed
site (which refreshes when the site redeploys after a commit).

**Security:** the token is your login credential — use a repo-scoped,
short-expiry, Contents-only token, and only paste it on the trusted deployed
origin. `localStorage` is readable by any script on the origin.

**Prerequisite:** serving a *private* repo via GitHub Pages requires a paid plan
(Pro/Team/Enterprise); otherwise host the built site (`npm run generate` →
`.output/public`) wherever you like — the non-token read path just needs a
deployed origin.

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
