// Print ONLY the certificate by cloning the form root + its CSS into an off-screen iframe
// and printing that. Isolates from host page chrome and host print stylesheets.
export function printIsolated(rootEl, cssText) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  // The bundled (pdf2htmlEX) CSS sets `.pf { page-break-after: always }`, which emits a blank
  // trailing page. Override it and pin @page to the form's native size (793.33×1122.67pt) so the
  // certificate prints as exactly ONE page at 1:1 (margin 0), with no overflow or blank page.
  var pageFix = '<style>@media print{' +
    '@page{size:793.333pt 1122.667pt;margin:0}' +
    'html,body{margin:0;padding:0}' +
    '.tff-50bis .pf{page-break-after:auto !important;page-break-before:auto !important}' +
    '}</style>';
  doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + cssText + '</style>' +
            pageFix + '</head><body class="tff-50bis"></body></html>');
  doc.close();
  doc.body.appendChild(doc.importNode(rootEl, true));
  const win = iframe.contentWindow;
  // Flatten every <input> into static text in the print clone. A printed certificate has no
  // editable fields, and leaving real inputs makes the OS "Save as PDF" path emit interactive
  // form-field widgets + extra font embedding — which readers like Preview open very slowly.
  // We copy each input's computed position/typography so the text lands exactly where it was.
  const KEEP = ['left', 'top', 'width', 'height', 'position', 'font', 'color', 'textAlign',
    'letterSpacing', 'padding', 'lineHeight', 'boxSizing', 'fontVariantNumeric',
    'backgroundImage', 'backgroundRepeat', 'backgroundSize', 'backgroundPosition'];
  Array.prototype.slice.call(doc.querySelectorAll('.tff-50bis input')).forEach((inp) => {
    const cs = win.getComputedStyle(inp);
    const out = doc.createElement('div');
    let style = 'display:flex;align-items:center;overflow:hidden;white-space:nowrap;';
    KEEP.forEach((p) => { style += p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + ':' + cs[p] + ';'; });
    out.setAttribute('style', style);
    if (inp.type === 'checkbox') { out.textContent = inp.checked ? '✕' : ''; out.style.justifyContent = 'center'; }
    else { out.textContent = inp.value; }
    inp.parentNode.replaceChild(out, inp);
  });
  const cleanup = () => { setTimeout(() => iframe.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  let printed = false;
  const run = () => { if (printed) return; printed = true; win.focus(); win.print(); };
  // Print once fonts are ready, but never block on it — fall back after 800ms so a stalled
  // fonts.ready (or a missing one) can't prevent printing.
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(run);
  setTimeout(run, 800);
  setTimeout(cleanup, 60000);
}
