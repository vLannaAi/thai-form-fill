(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = { Studio: api };
  root.Studio = api;
  if (typeof document !== 'undefined') api._initDOM();
})(typeof self !== 'undefined' ? self : this, function () {
  // ---- pure helpers (unit-tested) ----
  function rawToEff(raw, scale) { return raw * (scale || 1); }
  function effToRaw(eff, scale) { return (scale && isFinite(scale)) ? eff / scale : eff; }

  // ---- DOM editor (browser only) ----
  function _initDOM() {
    var FE = window.FormEngine; if (!FE) return;
    var btn = document.getElementById('studioBtn');
    var exitBtn = document.getElementById('studioExit');
    var info = document.getElementById('studioInfo');
    if (!btn) return;

    var host = location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]' || host === '::1';
    if (!local) return;            // off-localhost: leave the button hidden, do nothing
    btn.style.display = '';        // reveal Studio button on localhost

    var active = false, sel = null, key = null, cur = null;

    function start() {
      active = true; document.body.classList.add('studio');
      btn.textContent = 'Save changes'; exitBtn.style.display = ''; info.style.display = '';
      // Do NOT re-capture if the engine already captured natural baselines at load
      // (re-capturing now would treat already-overridden positions as "natural").
      if (!FE._state.layoutBase) FE._captureLayoutBaselines();
      setInfo();
    }
    function stop() {
      active = false; deselect(); document.body.classList.remove('studio');
      btn.textContent = 'Studio'; exitBtn.style.display = 'none'; info.style.display = 'none';
    }
    function select(el) {
      deselect();
      sel = el; key = FE._layoutKey(el); el.classList.add('studio-sel');
      var b = FE._state.layoutBase[key] || { natX: 0, natY: 0, rawFs: parseFloat(getComputedStyle(el).fontSize) };
      var o = FE._state.layout[key] || {};
      cur = { x: o.x != null ? o.x : b.natX, y: o.y != null ? o.y : b.natY,
              fs: o.fs != null ? o.fs : b.rawFs };
      setInfo();
    }
    function deselect() { if (sel) { sel.classList.remove('studio-sel'); } sel = null; key = null; cur = null; setInfo(); }

    function commit() {
      var b = FE._state.layoutBase[key];
      var entry = { x: Math.round(cur.x), y: Math.round(cur.y) };
      if (b && Math.abs(cur.fs - b.rawFs) > 0.01) entry.fs = Math.round(cur.fs * 100) / 100;
      FE._state.layout[key] = entry;
      FE._applyLayoutOne(key);
      setInfo();
    }
    function nudge(dx, dy) { if (!sel) return; cur.x += dx; cur.y += dy; commit(); }
    function fontStep(d) {
      if (!sel) return;
      var scale = FE._scaleOf(FE._state.layoutBase[key].base);
      cur.fs = effToRaw(rawToEff(cur.fs, scale) + d, scale);
      commit();
    }

    function setInfo() {
      if (!sel) { info.textContent = 'studio: click an item'; return; }
      var pf = document.querySelector('.pf').getBoundingClientRect();
      var r = sel.getBoundingClientRect();
      var scale = FE._scaleOf(FE._state.layoutBase[key].base);
      info.textContent = 'x ' + Math.round(r.left - pf.left) + '  y ' + Math.round(r.top - pf.top) +
        '   ' + Math.round(r.width) + '×' + Math.round(r.height) +
        '   fs ' + (Math.round(rawToEff(cur.fs, scale) * 10) / 10) + 'px';
    }

    function isSelectable(el) {
      return el && (el.matches('[data-i18n^="labels."],[data-i18n^="paragraphs."]') ||
                    (el.matches('#ov input.tf')));
    }

    // mousedown (not click) so we can preventDefault to stop input focus / text selection
    document.addEventListener('mousedown', function (e) {
      if (!active) return;
      var t = e.target.closest('[data-i18n],#ov input');
      if (t && isSelectable(t)) { e.preventDefault(); select(t); }
      else if (!e.target.closest('.toolbar')) { deselect(); }
    });

    document.addEventListener('keydown', function (e) {
      if (!active) return;
      if (e.key === 'Shift') { showBoxes(true); return; }
      if (!sel) return;
      var step = 1;
      if (e.key === 'ArrowLeft') { nudge(-step, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { nudge(step, 0); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { nudge(0, -step); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { nudge(0, step); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { fontStep(1); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { fontStep(-1); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === 'Escape') { deselect(); e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { if (active && e.key === 'Shift') showBoxes(false); });

    // showBoxes + guides are added in Task 4 — stub here so Task 3 runs standalone.
    function showBoxes(/* on */) {}

    btn.addEventListener('click', function () { if (!active) start(); else save(); });
    exitBtn.addEventListener('click', stop);

    // save is implemented in Task 5 — stub so the button is harmless until then.
    function save() { info.textContent = 'save: not wired yet'; }
  }

  return { rawToEff: rawToEff, effToRaw: effToRaw, _initDOM: _initDOM };
});
