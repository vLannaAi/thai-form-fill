(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;
  var Baht = root.BahtText;

  var state = { formId: null, db: null, lang: 'th', saveTimer: null, layout: {}, layoutBase: null };

  function fields() {
    return Array.prototype.slice.call(document.querySelectorAll('.page input'));
  }
  function val(el) { return el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; }
  function setVal(el, v) {
    if (el.type === 'checkbox') el.checked = v === '1' || v === true;
    else el.value = v == null ? '' : v;
  }

  // Field stored value is canonical (BE for years). Convert for display by current lang.
  function toDisplay(el, stored) {
    if (el.getAttribute('data-type') === 'be-year') return BD.displayYear(stored, state.lang);
    if (el.getAttribute('data-type') === 'dmy') return BD.displayDMY(stored, state.lang);
    return stored;
  }
  function toStored(el, shown) {
    if (el.getAttribute('data-type') === 'be-year') return BD.storeYear(shown, state.lang);
    if (el.getAttribute('data-type') === 'dmy') return BD.storeDMY(shown, state.lang);
    return shown;
  }

  function collect() {
    var map = { _ui: { lang: state.lang, showFields: document.body.classList.contains('show-fields') } };
    fields().forEach(function (el) { map[el.name] = toStored(el, val(el)); });
    return map;
  }

  // Merge this page's fields over whatever is stored, so two layouts (Thai/English)
  // sharing one record by field name never clobber each other's fields.
  function persist() {
    if (!state.db) return Promise.resolve();
    return state.db.loadFields(state.formId).then(function (existing) {
      return state.db.saveFields(state.formId, Object.assign({}, existing, collect()));
    });
  }
  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(persist, 300);
  }

  function restore(map) {
    fields().forEach(function (el) {
      if (Object.prototype.hasOwnProperty.call(map, el.name)) setVal(el, toDisplay(el, map[el.name]));
    });
  }

  // Fetch the form's strings.json and populate data-th/data-en on every slot,
  // so NO text needs to be baked into the HTML. [data-i18n="a.b"] elements
  // resolve against the JSON tree (labels.<n>, paragraphs.<n>, console.<key>);
  // inputs resolve their tooltip from fields[name] (income rows date0..N fall
  // back to the base key by stripping trailing digits). After this runs, the
  // existing applyLangText() handles the th/en switching as before.
  function applyStrings(strings) {
    state.strings = strings;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var node = strings, parts = el.getAttribute('data-i18n').split('.');
      for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
      if (node && node.th != null) {
        el.setAttribute('data-th', node.th);
        el.setAttribute('data-en', node.en);
      }
    });
    var f = strings.fields || {};
    fields().forEach(function (el) {
      var m = f[el.name] || f[el.name.replace(/\d+$/, '')];
      if (m) {
        el.setAttribute('data-th', m.th);
        el.setAttribute('data-en', m.en);
        el.title = m.th;
      }
    });
  }
  function loadStrings(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(applyStrings).catch(function (e) {
      // Most likely cause: opened via file:// (fetch is CORS-blocked). Serve over http.
      console.error('[form-engine] could not load strings from "' + url + '": ' + e.message +
                    ' — the form needs to be served over http(s), not opened as a file.');
    });
  }

  // ---- layout overrides (positions/sizes from layout.json; the Studio editor writes them) ----
  function selectable() {
    return Array.prototype.slice.call(
      document.querySelectorAll('[data-i18n^="labels."],[data-i18n^="paragraphs."],#ov input'));
  }
  function layoutKey(el) { return (el.dataset && el.dataset.i18n) || ('field.' + el.name); }
  function pfRect() { var pf = document.querySelector('.pf'); return pf ? pf.getBoundingClientRect() : { left: 0, top: 0 }; }
  // scaleOf is also exported (_scaleOf) for studio.js's effToRaw/rawToEff font math.
  function scaleOf(base) {
    if (!base || base === 'none') return 1;
    var m = base.match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    return parseFloat(m[1].split(',')[3]) || 1; // matrix 'd' = vertical scale
  }
  function composeTransform(base, dx, dy) {
    var t = 'translate(' + dx + 'px, ' + dy + 'px)';
    return (base && base !== 'none') ? t + ' ' + base : t;
  }
  function elForKey(key) {
    return key.indexOf('field.') === 0
      ? document.querySelector('#ov input.tf[name="' + key.slice(6) + '"]')
      : document.querySelector('[data-i18n="' + key + '"]');
  }
  function loadLayout(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { state.layout = j || {}; })
      .catch(function () { state.layout = {}; });
  }
  // Record each selectable element's natural (pre-override) top-left + base transform + raw font-size.
  function captureLayoutBaselines() {
    state.layoutBase = {};
    var p = pfRect();
    selectable().forEach(function (el) {
      var r = el.getBoundingClientRect();
      state.layoutBase[layoutKey(el)] = {
        natX: r.left - p.left, natY: r.top - p.top,
        base: getComputedStyle(el).transform,
        rawFs: parseFloat(getComputedStyle(el).fontSize)
      };
    });
  }
  function applyLayoutOne(key) {
    var el = elForKey(key); if (!el) return;
    var b = state.layoutBase && state.layoutBase[key]; if (!b) return;
    var o = state.layout[key]; if (!o) return;
    if (o.x != null && o.y != null) el.style.transform = composeTransform(b.base, o.x - b.natX, o.y - b.natY);
    // 'important' so the override beats the `.pc .fsN { font-size: …px !important }` scale rules (labels).
    if (o.fs != null) el.style.setProperty('font-size', o.fs + 'px', 'important');
    else el.style.removeProperty('font-size');
  }
  function applyLayout() { Object.keys(state.layout).forEach(applyLayoutOne); }

  // ---- computed fields (declared via data-compute on the inputs) ----
  function num(v) { var x = parseFloat(String(v).replace(/[, ]/g, '')); return isNaN(x) ? 0 : x; }
  function fmt(x) { return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // sum:<prefix>  -> total of inputs named <prefix>0..<prefix>N (e.g. pay0..pay13)
  // words:<name>  -> language-aware baht text of the field named <name>
  function recompute() {
    document.querySelectorAll('.page input[data-compute^="sum:"]').forEach(function (el) {
      var prefix = el.getAttribute('data-compute').slice(4).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('^' + prefix + '\\d+$');
      var total = 0, any = false;
      fields().forEach(function (r) {
        if (!re.test(r.name)) return;
        var v = r.value.trim();
        if (v !== '') { any = true; total += num(v); }
      });
      el.value = any ? fmt(total) : '';
    });
    document.querySelectorAll('.page input[data-compute^="words:"]').forEach(function (el) {
      var srcName = el.getAttribute('data-compute').slice(6);
      var ref = document.querySelector('.page input[name="' + srcName + '"]');
      if (!ref || ref.value.trim() === '' || !Baht) { el.value = ''; return; }
      el.value = state.lang === 'en' ? Baht.english(num(ref.value)) : Baht.thai(num(ref.value));
    });
  }

  // POC language helpers, kept.
  function applyLangText(en) {
    document.querySelectorAll('[data-th][data-en]').forEach(function (el) {
      if (el.tagName === 'INPUT') el.title = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
      else el.textContent = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
    });
  }
  function fitEnglish() {
    document.querySelectorAll('.enlbl').forEach(function (el) {
      var span = el.firstElementChild; if (!span) return;
      var fs = parseFloat(el.getAttribute('data-fs')) || 12; span.style.fontSize = fs + 'px';
      var guard = 0;
      while (span.scrollWidth > el.clientWidth && fs > 5 && guard < 60) { fs -= 0.5; span.style.fontSize = fs + 'px'; guard++; }
    });
  }

  function setLang(lang) {
    // Re-display year/date fields under the new lang (storage stays canonical BE).
    var prev = state.lang;
    if (prev !== lang) {
      fields().forEach(function (el) {
        var t = el.getAttribute('data-type');
        if (t === 'be-year' || t === 'dmy') {
          var stored = toStored(el, val(el)); // current shown -> canonical (using prev lang)
          state.lang = lang;
          setVal(el, toDisplay(el, stored));  // canonical -> new lang
          state.lang = prev;
        }
      });
    }
    state.lang = lang;
    var en = lang === 'en';
    document.body.classList.toggle('lang-en', en);
    document.documentElement.lang = lang;
    var btn = document.getElementById('langBtn'); if (btn) btn.textContent = en ? 'ไทย' : 'EN';
    var title = state.strings && state.strings.console && state.strings.console.title;
    if (title) document.title = en ? title.en : title.th;
    applyLangText(en);
    recompute(); // amount-in-words is language-specific; totals reformat
    document.dispatchEvent(new Event('form-relayout')); // studio refreshes guides if active
    if (en) requestAnimationFrame(fitEnglish);
    scheduleSave();
  }

  function init(opts) {
    state.formId = opts.formId;
    bindConsole();
    fields().forEach(function (el) {
      el.addEventListener('input', function () { recompute(); scheduleSave(); });
      el.addEventListener('change', function () { recompute(); scheduleSave(); });
    });
    // Load strings.json (text) and layout.json (positions) before first paint logic.
    var pre = Promise.all([
      opts.strings ? loadStrings(opts.strings) : Promise.resolve(),
      opts.layout ? loadLayout(opts.layout) : Promise.resolve()
    ]);
    pre.then(function () { return Storage.openDB(); }).then(function (db) {
      state.db = db;
      if (!db.available) { var w = document.getElementById('storeWarn'); if (w) w.style.display = ''; }
      return db.loadFields(state.formId);
    }).then(function (map) {
      var ui = map._ui || {};
      if (ui.showFields) document.body.classList.add('show-fields');
      restore(map);
      recompute();
      setLang(opts.lang || ui.lang || 'th'); // explicit opts.lang lets each page force its language
      if (root.ImageTool && root.ImageTool.restoreSlots) root.ImageTool.restoreSlots(state);
      var afterFonts = function () { fitEnglish(); captureLayoutBaselines(); applyLayout(); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(afterFonts); else afterFonts();
    });
  }

  // Console actions filled in across Tasks 5-7.
  function bindConsole() {
    var c = document.getElementById('console'); if (!c) return;
    c.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]'); if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'lang') setLang(state.lang === 'en' ? 'th' : 'en');
      else if (act === 'toggleFields') { document.body.classList.toggle('show-fields'); scheduleSave(); }
      else if (act === 'print') window.print();
      else if (act === 'clearSubmit') clearSubmit();
      else if (act === 'resetAll') resetAll();
      else if (act === 'img' && root.ImageTool) root.ImageTool.open(state, btn.getAttribute('data-slot'));
    });
  }

  function isOwner(el) { return el.getAttribute('data-role') === 'owner'; }

  function clearSubmit() {
    var msg = state.lang === 'en' ? 'Clear submission data? Owner info and stamp/signature are kept.'
                                  : 'ล้างข้อมูลที่ยื่น? ข้อมูลเจ้าของและตรา/ลายเซ็นจะถูกเก็บไว้';
    if (!confirm(msg)) return;
    fields().forEach(function (el) { if (!isOwner(el)) setVal(el, ''); });
    scheduleSave();
  }

  function resetAll() {
    var msg = state.lang === 'en' ? 'Reset EVERYTHING including stamp and signature?'
                                  : 'ล้างข้อมูลทั้งหมด รวมทั้งตราและลายเซ็น?';
    if (!confirm(msg)) return;
    fields().forEach(function (el) { setVal(el, ''); });
    document.querySelectorAll('.slot').forEach(function (img) { img.style.display = 'none'; img.removeAttribute('src'); });
    document.querySelectorAll('.slot-size').forEach(function (el) { el.remove(); });
    if (state.db) state.db.clearForm(state.formId, { keepImages: false });
    scheduleSave();
  }

  root.FormEngine = {
    init: init, flush: persist, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _setLang: setLang, _fields: fields, _recompute: recompute, _num: num, _fmt: fmt,
    _layoutKey: layoutKey, _scaleOf: scaleOf, _composeTransform: composeTransform,
    _selectable: selectable, _elForKey: elForKey, _captureLayoutBaselines: captureLayoutBaselines,
    _applyLayoutOne: applyLayoutOne
  };
})(typeof self !== 'undefined' ? self : this);
