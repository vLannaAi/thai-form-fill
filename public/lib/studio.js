(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
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

    // ---- token field (paste / save / forget the GitHub PAT) ----
    var tokenWrap = document.createElement('span');
    tokenWrap.className = 'studio-token';
    tokenWrap.innerHTML =
      '<input type="password" id="studioToken" placeholder="fine-grained GitHub PAT" autocomplete="off">' +
      '<button id="studioTokenSave" type="button">Save token</button>' +
      '<button id="studioTokenForget" type="button">Forget</button>';
    btn.parentNode.insertBefore(tokenWrap, btn);
    var tokenInput = tokenWrap.querySelector('#studioToken');
    function revealToken() { tokenWrap.classList.add('show'); tokenInput.focus(); }
    function hideToken() { tokenWrap.classList.remove('show'); tokenInput.value = ''; }
    tokenWrap.querySelector('#studioTokenSave').addEventListener('click', function () {
      var v = tokenInput.value.trim();
      if (!v) return;
      FE._setToken(v); hideToken();
      info.style.display = ''; info.textContent = 'token saved — Studio enabled';
    });
    tokenWrap.querySelector('#studioTokenForget').addEventListener('click', function () {
      FE._clearToken(); hideToken();
      info.style.display = ''; info.textContent = 'token forgotten';
    });

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
      if (guides) guides.innerHTML = ''; if (boxes) boxes.innerHTML = '';
      btn.textContent = 'Studio'; exitBtn.style.display = 'none'; info.style.display = 'none';
    }
    function select(el) {
      deselect();
      var k = FE._layoutKey(el);
      var b = FE._state.layoutBase[k];
      if (!b) return; // not a captured element; ignore (keeps the layoutBase[key] guards consistent)
      sel = el; key = k; el.classList.add('studio-sel');
      var o = FE._state.layout[key] || {};
      cur = { x: o.x != null ? o.x : b.natX, y: o.y != null ? o.y : b.natY,
              fs: o.fs != null ? o.fs : b.rawFs,
              w: o.w != null ? o.w : b.rawW, h: o.h != null ? o.h : b.rawH };
      setInfo();
    }
    function deselect() { if (sel) { sel.classList.remove('studio-sel'); } sel = null; key = null; cur = null; setInfo(); }

    function commit() {
      var b = FE._state.layoutBase[key];
      var entry = { x: Math.round(cur.x), y: Math.round(cur.y) };
      if (b && Math.abs(cur.fs - b.rawFs) > 0.01) entry.fs = Math.round(cur.fs * 100) / 100;
      if (b && Math.abs(cur.w - b.rawW) > 0.5) entry.w = Math.round(cur.w);
      if (b && Math.abs(cur.h - b.rawH) > 0.5) entry.h = Math.round(cur.h);
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
    function resize(dw, dh) {
      if (!sel) return;
      cur.w = Math.max(1, cur.w + dw); cur.h = Math.max(1, cur.h + dh);
      commit();
    }

    function setInfo() {
      if (!sel) { info.textContent = 'studio: click an item'; if (guides) guides.innerHTML = ''; return; }
      var pf = document.querySelector('.pf').getBoundingClientRect();
      var r = sel.getBoundingClientRect();
      var scale = FE._scaleOf(FE._state.layoutBase[key].base);
      info.textContent = 'x ' + Math.round(r.left - pf.left) + '  y ' + Math.round(r.top - pf.top) +
        '   ' + Math.round(r.width) + '×' + Math.round(r.height) +
        '   fs ' + (Math.round(rawToEff(cur.fs, scale) * 10) / 10) + 'px';
      drawGuides();
    }

    function isSelectable(el) {
      return el && (el.matches('[data-i18n^="labels."],[data-i18n^="paragraphs."]') ||
                    (el.matches('#ov input')));   // text + checkboxes — all overlay inputs
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
      // arrows = move 1px · + / - = font ±1 · a/d = width ∓ · w/s = height ∓ · Enter/Esc = deselect
      var c = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (c === 'ArrowLeft') nudge(-1, 0);
      else if (c === 'ArrowRight') nudge(1, 0);
      else if (c === 'ArrowUp') nudge(0, -1);
      else if (c === 'ArrowDown') nudge(0, 1);
      else if (c === '+' || c === '=') fontStep(1);
      else if (c === '-' || c === '_') fontStep(-1);
      else if (c === 'a') resize(-1, 0);
      else if (c === 'd') resize(1, 0);
      else if (c === 'w') resize(0, -1);
      else if (c === 's') resize(0, 1);
      else if (c === 'Enter' || c === 'Escape') deselect();
      else return;
      e.preventDefault();
    });
    document.addEventListener('keyup', function (e) { if (active && e.key === 'Shift') showBoxes(false); });
    // In studio, swallow the interactive click on overlay inputs so a checkbox
    // selects (via mousedown) instead of toggling. Capture phase beats the default.
    document.addEventListener('click', function (e) {
      if (active && e.target.closest('#ov input')) e.preventDefault();
    }, true);
    // The engine fires this after a language switch (label text/geometry changes);
    // redraw the selected item's guides + readout so they aren't stale.
    document.addEventListener('form-relayout', function () { if (active && sel) setInfo(); });

    // ---- guides + shift box-overlay ----
    var guides = null, boxes = null;
    function layer(id, z) {
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div'); el.id = id;
        el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:' + z + ';';
        document.querySelector('.pf').appendChild(el);
      }
      return el;
    }
    function drawGuides() {
      guides = layer('studio-guides', 60);
      if (!sel) { guides.innerHTML = ''; return; }
      var pf = document.querySelector('.pf').getBoundingClientRect();
      var r = sel.getBoundingClientRect();
      var L = Math.round(r.left - pf.left), T = Math.round(r.top - pf.top), W = Math.round(r.width), H = Math.round(r.height);
      guides.innerHTML =
        '<div class="g gh" style="top:' + T + 'px"></div>' +
        '<div class="g gh" style="top:' + (T + H) + 'px"></div>' +
        '<div class="g gv" style="left:' + L + 'px"></div>' +
        '<div class="g gv" style="left:' + (L + W) + 'px"></div>';
    }
    function showBoxes(on) {
      boxes = layer('studio-boxes', 55);
      if (!on) { boxes.innerHTML = ''; return; }
      var pf = document.querySelector('.pf').getBoundingClientRect();
      boxes.innerHTML = FE._selectable().map(function (el) {
        var r = el.getBoundingClientRect();
        return '<div class="b" style="left:' + Math.round(r.left - pf.left) + 'px;top:' + Math.round(r.top - pf.top) +
          'px;width:' + Math.round(r.width) + 'px;height:' + Math.round(r.height) + 'px"></div>';
      }).join('');
    }

    btn.addEventListener('click', function () { if (!active) start(); else save(); });
    exitBtn.addEventListener('click', stop);

    // ---- save: commit layout.json to GitHub via the Contents API (LWW) ----
    function ghHeaders(token) {
      return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    }
    function authError() { var e = new Error('auth'); e.authError = true; return e; } // routed to the token re-prompt
    function getSha(url, branch, token) {
      return fetch(url + '?ref=' + branch, { headers: ghHeaders(token), cache: 'no-store' })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) throw authError();
          if (r.status === 404) return undefined;              // file does not exist yet (new form)
          if (!r.ok) throw new Error('GET ' + r.status);
          return r.json().then(function (j) { return j.sha; });
        });
    }
    function putFile(url, message, contentB64, sha, branch, token) {
      var body = { message: message, content: contentB64, branch: branch };
      if (sha) body.sha = sha;
      return fetch(url, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }
    var saving = false;
    function save() {
      if (saving) return;                                      // ignore clicks while a save is in flight
      var token = FE._getToken();
      if (!token) { revealToken(); info.textContent = 'paste a fine-grained PAT to save'; return; }
      var repo = FE._state.repo;
      if (!repo) { info.textContent = 'no repo configured for this form'; return; }
      var url = FE._contentsUrl(repo, FE._state.formId);
      var json = JSON.stringify(FE._state.layout, null, 2) + '\n';
      var b64 = FE._b64utf8(json);
      var msg = 'studio: update ' + FE._state.formId + ' layout';
      saving = true;
      info.textContent = 'saving…';
      getSha(url, repo.branch, token)
        .then(function (sha) { return putFile(url, msg, b64, sha, repo.branch, token); })
        .then(function (res) {
          if (FE._needsRetry(res.status)) {                    // 409: someone committed since our GET
            return getSha(url, repo.branch, token)             // re-read sha, write once more (LWW)
              .then(function (sha) { return putFile(url, msg, b64, sha, repo.branch, token); });
          }
          return res;
        })
        .then(function (res) {
          if (res.status === 200 || res.status === 201) {
            var sha = res.body && res.body.commit && res.body.commit.sha;
            info.textContent = 'saved to GitHub ✓' + (sha ? ' (' + sha.slice(0, 7) + ')' : '');
          } else if (res.status === 401 || res.status === 403 || res.status === 404) {
            revealToken(); info.textContent = 'token invalid, expired, or lacks access to this repo';
          } else {
            info.textContent = 'save failed: ' + ((res.body && res.body.message) || res.status);
          }
        })
        .catch(function (e) {
          if (e && e.authError) { revealToken(); info.textContent = 'token invalid, expired, or lacks access to this repo'; }
          else { info.textContent = 'save failed: ' + (e && e.message); }
        })
        .finally(function () { saving = false; });             // clear the in-flight guard (success or failure, even if a handler throws)
    }
  }

  return { rawToEff: rawToEff, effToRaw: effToRaw, _initDOM: _initDOM };
});
