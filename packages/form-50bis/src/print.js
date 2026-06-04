// Print ONLY the certificate by cloning the form root + its CSS into an off-screen iframe
// and printing that. Isolates from host page chrome and host print stylesheets.
export function printIsolated(rootEl, cssText) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"><style>' + cssText +
            '</style></head><body class="tff-50bis"></body></html>');
  doc.close();
  doc.body.appendChild(doc.importNode(rootEl, true));
  const win = iframe.contentWindow;
  const cleanup = () => { setTimeout(() => iframe.remove(), 500); };
  win.addEventListener('afterprint', cleanup);
  const run = () => { win.focus(); win.print(); };
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(run); else setTimeout(run, 150);
  setTimeout(cleanup, 60000);
}
