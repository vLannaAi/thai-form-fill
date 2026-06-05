// Print ONLY the certificate by cloning the form root + its CSS into an off-screen iframe
// and printing that. Isolates from host page chrome and host print stylesheets.
//
// Three things make the printed PDF correct (all verified against the live form):
//  1. @page is pinned to the form's native size (793.33×1122.67pt) with margin 0 — the form is
//     larger than A4, so without this it spills onto a blank 2nd page. (Also override the
//     pdf2htmlEX `.pf { page-break-after: always }` that forces a trailing blank page.)
//  2. Every <input> is flattened to static text — a printed certificate has no editable fields,
//     and real inputs become interactive form-field widgets (+ extra font embedding) on the OS
//     "Save as PDF" path, which readers like Preview open very slowly. We copy each input's
//     computed position/typography INCLUDING its `transform` (the engine positions fields with a
//     translate, so dropping it would offset the text from its box).
//  3. Print once fonts are ready, with an 800ms fallback so a stalled fonts.ready can't block it.
const KEEP_STYLES = ['left', 'top', 'width', 'height', 'position', 'transform', 'transformOrigin',
  'font', 'color', 'textAlign', 'letterSpacing', 'padding', 'lineHeight', 'boxSizing',
  'fontVariantNumeric', 'backgroundImage', 'backgroundRepeat', 'backgroundSize', 'backgroundPosition'];

export function printIsolated(rootEl, cssText) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  const pageFix = '<style>@media print{' +
    '@page{size:793.333pt 1122.667pt;margin:0}' +
    '.tff-50bis .pf{page-break-after:auto !important}' +
    '}</style>';
  doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + cssText + '</style>' +
            pageFix + '</head><body class="tff-50bis"></body></html>');
  doc.close();
  doc.body.appendChild(doc.importNode(rootEl, true));
  const win = iframe.contentWindow;

  // Flatten inputs -> static text (see note 2 above).
  Array.prototype.slice.call(doc.querySelectorAll('.tff-50bis input')).forEach((inp) => {
    const cs = win.getComputedStyle(inp);
    const out = doc.createElement('div');
    let style = 'display:flex;align-items:center;overflow:hidden;white-space:nowrap;';
    KEEP_STYLES.forEach((p) => { style += p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + cs[p] + ';'; });
    out.setAttribute('style', style);
    if (inp.type === 'checkbox') { out.textContent = inp.checked ? '✕' : ''; out.style.justifyContent = 'center'; }
    else { out.textContent = inp.value; }
    inp.parentNode.replaceChild(out, inp);
  });

  const cleanup = () => { setTimeout(() => iframe.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  let printed = false;
  const run = () => { if (printed) return; printed = true; win.focus(); win.print(); };
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(run);
  setTimeout(run, 800);
  setTimeout(cleanup, 60000);
}
