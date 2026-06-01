# Thai Form Fill

Open-source, browser-only filler for Thai bureaucratic forms. First form: the
50 Bis withholding-tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย).

- No accounts, no server. All data — including stamp & signature images — stays
  in your browser via IndexedDB.
- Bilingual Thai/English. Buddhist↔Gregorian year conversion.
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
the two `fonts.googleapis.com` `<link>` tags from `index.html` and
`forms/50bis/index.html` (the CSS falls back to system Thai fonts).

## Add a new form

Create `forms/<name>/index.html`, overlay inputs on the form scan, tag fields
with `data-role="owner"` and `data-type="be-year"|"dmy"`, add `data-slot` images,
include the `lib/*.js` scripts, and call `FormEngine.init({ formId: '<name>' })`.

## Tests

```bash
node --test test/
```
