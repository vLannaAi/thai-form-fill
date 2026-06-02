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

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

Serve over http(s) (e.g. GitHub Pages). Opening as a raw `file://` is not
supported because browsers restrict IndexedDB on file origins.

## Privacy

Your form data never leaves your browser — it is stored only in IndexedDB on
your device, with no accounts and no backend. The one exception is the **Sarabun
web font**, loaded from `fonts.googleapis.com` for consistent Thai typography;
that request is visible to Google. To run with zero third-party requests, remove
the two `fonts.googleapis.com` `<link>` tags from the landing `index.html`, and
the `@import url('https://fonts.googleapis.com/...')` line at the top of
`forms/50bis/form.css` (the CSS falls back to system Thai fonts).

## Studio (layout authoring)

Run the form on `localhost` and click **Studio** in the toolbar. Click any label,
paragraph, or fill cell to select it, then nudge with the arrow keys (1px), step
its font with `+`/`-`, hold **Shift** to see all item boxes, and read the live
`x, y` / size in the toolbar. The button becomes **Save changes** — click it to
write `forms/50bis/layout.json` (Chromium asks once for file access; other
browsers download the file to commit manually). The form applies `layout.json`
at load for everyone, so committed positions ship to the deployed site. The
Studio button only appears on `localhost`.

## Add a new form

Create `forms/<name>/index.html`, overlay inputs on the form scan, tag fields
with `data-role="owner"` and `data-type="be-year"|"dmy"`, add `data-slot` images,
include the `lib/*.js` scripts, and call `FormEngine.init({ formId: '<name>' })`.

## Tests

```bash
node --test test/
```
