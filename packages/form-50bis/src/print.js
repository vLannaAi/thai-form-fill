// Print ONLY the certificate, as a single clean page that opens fast in any reader.
//
// We print the MAIN document (NOT a hidden iframe — iframe printing is unreliable across
// browsers/OS and was leaving the live <input> fields in the output as AcroForm widgets).
// Instead we append a flattened, print-only copy of the form to <body> and use @media print to
// hide everything else. Why each piece:
//  • Flatten every <input> to static text  -> no interactive form-field widgets (AcroForm), which
//    are what made the PDF slow to open / show as a fillable form.
//  • Copy each field's computed transform  -> text lands exactly in its box (the engine positions
//    fields with a translate).
//  • Replace the dotted-underline gradient  -> a plain dotted border-bottom; the CSS
//    repeating-linear-gradient renders on screen but produces a PDF construct macOS readers
//    (Preview / PDF Expert / Quartz) fail to open (blank page).
//  • @page pinned to the form's native size -> exactly one page (the form is larger than A4).
const KEEP_STYLES = ['left', 'top', 'width', 'height', 'position', 'transform', 'transformOrigin',
  'font', 'color', 'textAlign', 'letterSpacing', 'padding', 'lineHeight', 'boxSizing',
  'fontVariantNumeric'];

function kebab(p) { return p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()); }

export function printIsolated(rootEl) {
  const clone = rootEl.cloneNode(true);

  // Flatten inputs -> static divs. Read computed style from the LIVE originals (they're rendered,
  // so transforms/fonts resolve), pairing them with the clone's inputs by document order.
  const orig = rootEl.querySelectorAll('input');
  const cloned = clone.querySelectorAll('input');
  for (let i = 0; i < cloned.length; i++) {
    const inp = orig[i];
    const cs = getComputedStyle(inp);
    const out = document.createElement('div');
    let style = 'display:flex;align-items:center;overflow:hidden;white-space:nowrap;';
    KEEP_STYLES.forEach((p) => { style += kebab(p) + ':' + cs[p] + ';'; });
    if (cs.backgroundImage && cs.backgroundImage.indexOf('gradient') !== -1) style += 'border-bottom:1px dotted #5f6368;';
    out.setAttribute('style', style);
    if (inp.type === 'checkbox') { out.textContent = inp.checked ? '✕' : ''; out.style.justifyContent = 'center'; }
    else { out.textContent = inp.value; }
    cloned[i].parentNode.replaceChild(out, cloned[i]);
  }

  const portal = document.createElement('div');
  portal.className = 'tff-print-portal';
  portal.appendChild(clone);
  document.body.appendChild(portal);

  const style = document.createElement('style');
  style.textContent =
    '@media print{' +
    'body > *:not(.tff-print-portal){display:none !important}' +
    '.tff-print-portal{position:static !important;margin:0;padding:0}' +
    '@page{size:793.333pt 1122.667pt;margin:0}' +
    '.tff-50bis .pf{page-break-after:auto !important}' +
    '}';
  document.head.appendChild(style);

  let done = false;
  const cleanup = () => {
    if (done) return; done = true;
    portal.remove(); style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  let printed = false;
  const run = () => { if (printed) return; printed = true; window.print(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  setTimeout(run, 800);          // fallback if fonts.ready stalls
  setTimeout(cleanup, 60000);    // safety net if afterprint never fires
}
