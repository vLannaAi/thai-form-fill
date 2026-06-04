(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;
  var Baht = root.BahtText;

  var state = { formId: null, db: null, lang: 'th', saveTimer: null, layout: {}, layoutBase: null,
                labelNums: false, inputNums: false, inputNumMode: 'num', grid: false };

  // Embedded mode: scope all DOM access to a root element so the form can live inside a host app.
  // Standalone app passes nothing -> ROOT=document, EMBEDDED=false (unchanged behavior).
  var ROOT = (typeof document !== 'undefined') ? document : null;
  var EMBEDDED = false;
  function qs(sel) { return ROOT.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(ROOT.querySelectorAll(sel)); }
  function byId(id) { return ROOT.querySelector('#' + id); }
  function classRoot() { return EMBEDDED ? ROOT : document.body; } // lang-en / show-fields toggles

  function fields() {
    return qsa('.page input');
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
    var map = { _ui: { lang: state.lang, showFields: classRoot().classList.contains('show-fields') } };
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
    qsa('[data-i18n]').forEach(function (el) {
      var node = strings, parts = el.getAttribute('data-i18n').split('.');
      for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
      if (node && node.th != null) {
        el.setAttribute('data-th', node.th);
        el.setAttribute('data-en', node.en);
      }
    });
    var f = strings.fields || {};
    fields().forEach(function (el) {
      // exact name, else a base key with the numeric path segment dropped
      // (income.0.amountPaid -> income.amountPaid; payer.taxId.1 -> payer.taxId).
      var m = f[el.name] || f[el.name.replace(/\.\d+(?=\.|$)/g, '')];
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
    return qsa('[data-i18n^="labels."],[data-i18n^="paragraphs."],#ov input');
  }
  function layoutKey(el) { return (el.dataset && el.dataset.i18n) || ('field.' + el.name); }
  function pfRect() { var pf = qs('.pf'); return pf ? pf.getBoundingClientRect() : { left: 0, top: 0 }; }
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
      ? qs('#ov input[name="' + key.slice(6) + '"]')   // any overlay input (text or checkbox)
      : qs('[data-i18n="' + key + '"]');
  }
  // Token-required read: the layout is fetched live from the private repo's Contents API. There is
  // NO public/deployed fallback — without a valid token the form is gated (see showTokenGate). A
  // failed read rejects so init() can clear the bad token and re-show the gate.
  function loadLayout() {
    var token = getToken();
    var api = contentsUrl(state.repo, state.formId) + '?ref=' + state.repo.branch;
    return fetch(api, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw' },
      cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error('GitHub read ' + r.status); // 401/403/404/rate-limit
      return r.json();
    }).then(function (j) { state.layout = j || {}; });
  }

  // Blocking token gate (internal-tool mode): the form is unusable without a GitHub token. Covers
  // the whole page until a token is entered; a token submit reloads into init with the token set.
  function showTokenGate(message) {
    var existing = qs('.token-gate');
    if (existing) { var e0 = existing.querySelector('.tg-err'); if (e0) e0.textContent = message || ''; return; }
    var repo = state.repo ? (state.repo.owner + '/' + state.repo.name) : 'the repository';
    var g = document.createElement('div');
    g.className = 'token-gate';
    g.innerHTML =
      '<div class="tg-box">' +
      '<h2 class="tg-title">GitHub access token required</h2>' +
      '<p class="tg-sub">This form loads its layout from a private repository. Paste a fine-grained ' +
      'token (Contents: Read) for <code>' + repo + '</code>.</p>' +
      '<input type="password" class="tg-input" placeholder="github_pat_…" autocomplete="off" spellcheck="false">' +
      '<button type="button" class="tg-go">Unlock</button>' +
      '<p class="tg-err">' + (message || '') + '</p>' +
      '</div>';
    document.body.appendChild(g);
    var input = g.querySelector('.tg-input');
    function submit() { var v = input.value.trim(); if (!v) return; setToken(v); location.reload(); }
    g.querySelector('.tg-go').addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    input.focus();
  }
  // Record each selectable element's natural (pre-override) top-left + base transform + raw font/size.
  function captureLayoutBaselines() {
    state.layoutBase = {};
    var p = pfRect();
    selectable().forEach(function (el) {
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      state.layoutBase[layoutKey(el)] = {
        natX: r.left - p.left, natY: r.top - p.top,
        base: cs.transform, rawFs: parseFloat(cs.fontSize),
        rawW: parseFloat(cs.width), rawH: parseFloat(cs.height), ta: cs.textAlign
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
    if (o.w != null) el.style.width = o.w + 'px';   // no removeProperty: inputs carry an inline width from the generator
    if (o.h != null) el.style.height = o.h + 'px';
    if (o.ta) el.style.setProperty('text-align', o.ta); else el.style.removeProperty('text-align'); // j/k/l align
  }
  function applyLayout() { Object.keys(state.layout).forEach(applyLayoutOne); }

  // ---- number badges: toggleable index chips overlaid on labels (green) and inputs (blue) ----
  function renderNumBadges() {
    var pf = qs('.pf'); if (!pf) return;
    var layer = byId('num-badges');
    if (!layer) { layer = document.createElement('div'); layer.id = 'num-badges'; pf.appendChild(layer); }
    if (!state.labelNums && !state.inputNums) { layer.innerHTML = ''; return; }
    var p = pf.getBoundingClientRect(), html = '';
    function chip(el, text, cls) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;                  // skip hidden elements
      html += '<span class="num-badge ' + cls + '" style="left:' + Math.round(r.left - p.left) +
        'px;top:' + Math.round(r.top - p.top) + 'px">' + text + '</span>';
    }
    if (state.labelNums) {
      qsa('[data-i18n^="labels."]').forEach(function (el) {
        if (el.offsetParent === null) return;                      // skip display:none labels
        chip(el, el.getAttribute('data-i18n').split('.')[1], 'label'); // labels.N -> N
      });
      qsa('[data-i18n^="paragraphs."]').forEach(function (el) {
        if (el.offsetParent === null) return;
        chip(el, 'P' + el.getAttribute('data-i18n').split('.')[1], 'para'); // paragraphs.N -> "PN"
      });
    }
    if (state.inputNums) {
      qsa('#ov input').forEach(function (el, i) {
        chip(el, state.inputNumMode === 'name' ? el.name : (i + 1), 'input');
      });
    }
    layer.innerHTML = html;
  }

  // ---- reference grid: 100x100 cells labelled <row-letter><col-number> (A1 top-left) ----
  function rowLetter(n) { var s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
  function renderGrid() {
    var pf = qs('.pf'); if (!pf) return;
    var layer = byId('studio-grid');
    if (!layer) { layer = document.createElement('div'); layer.id = 'studio-grid'; pf.appendChild(layer); }
    if (!state.grid) { layer.innerHTML = ''; return; }
    var cols = Math.ceil(pf.scrollWidth / 100), rows = Math.ceil(pf.scrollHeight / 100), html = '';
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      html += '<div class="gcell" style="left:' + (c * 100) + 'px;top:' + (r * 100) + 'px">' +
        '<span class="glabel">' + rowLetter(r) + (c + 1) + '</span></div>';
    }
    layer.innerHTML = html;
  }

  // ---- computed fields (declared via data-compute on the inputs) ----
  function num(v) { var x = parseFloat(String(v).replace(/[, ]/g, '')); return isNaN(x) ? 0 : x; }
  function fmt(x) { return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // sum:<prefix>  -> total of inputs named <prefix>0..<prefix>N (e.g. pay0..pay13)
  // words:<name>  -> language-aware baht text of the field named <name>
  function recompute() {
    qsa('.page input[data-compute^="sum:"]').forEach(function (el) {
      // glob like "income.*.amountPaid" — escape, then turn the * into a digit run so it
      // matches every row (income.0.amountPaid .. income.13.amountPaid).
      var glob = el.getAttribute('data-compute').slice(4).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var re = new RegExp('^' + glob.replace(/\\\*/g, '\\d+') + '$');
      var total = 0, any = false;
      fields().forEach(function (r) {
        if (!re.test(r.name)) return;
        var v = r.value.trim();
        if (v !== '') { any = true; total += num(v); }
      });
      el.value = any ? fmt(total) : '';
    });
    qsa('.page input[data-compute^="words:"]').forEach(function (el) {
      var srcName = el.getAttribute('data-compute').slice(6);
      var ref = qs('.page input[name="' + srcName + '"]');
      if (!ref || ref.value.trim() === '' || !Baht) { el.value = ''; return; }
      el.value = state.lang === 'en' ? Baht.english(num(ref.value)) : Baht.thai(num(ref.value));
    });
  }

  // POC language helpers, kept.
  function applyLangText(en) {
    qsa('[data-th][data-en]').forEach(function (el) {
      if (el.tagName === 'INPUT') el.title = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
      else el.textContent = en ? el.getAttribute('data-en') : el.getAttribute('data-th');
    });
  }
  function fitEnglish() {
    qsa('.enlbl').forEach(function (el) {
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
    classRoot().classList.toggle('lang-en', en);
    if (!EMBEDDED) { document.documentElement.lang = lang; }
    var btn = byId('langBtn'); if (btn) btn.textContent = en ? 'ไทย' : 'EN';
    var title = state.strings && state.strings.console && state.strings.console.title;
    if (title && !EMBEDDED) document.title = en ? title.en : title.th; // don't hijack the host page title when embedded
    applyLangText(en);
    recompute(); // amount-in-words is language-specific; totals reformat
    if (!EMBEDDED) { document.dispatchEvent(new Event('form-relayout')); } // studio refreshes guides if active
    if (en) requestAnimationFrame(fitEnglish);
    requestAnimationFrame(renderNumBadges); // labels move/resize per language — reposition badges
    requestAnimationFrame(renderGrid);      // page height can shift per language — rebuild the grid
    if (!EMBEDDED) scheduleSave();
  }

  // Editable amounts toggle between a DISPLAY form and an EDIT form. formatMoney renders the display
  // form on blur: thousand separators + two decimals (600000 -> 600,000.00), the same fmt() the
  // computed totals use. unformatMoney strips it on focus so the user types a plain number — commas
  // always go, and a whole-baht ".00" fraction is dropped too (600,000.00 -> 600000) while a real
  // fraction stays (1,000.01 -> 1000.01). Non-numeric text is left exactly as typed.
  function formatMoney(el) {
    if (!el.classList.contains('money') || el.readOnly) return;
    var v = el.value.trim();
    if (!v) { el.value = ''; return; }
    if (!/^[\d,]*\.?\d*$/.test(v)) return;
    el.value = fmt(num(v));
  }
  function unformatMoney(el) {
    if (!el.classList.contains('money') || el.readOnly) return;
    var v = el.value.trim();
    if (v) el.value = v.replace(/,/g, '').replace(/\.0+$/, '');
  }
  function formatMoneyAll() { qsa('.page input.money').forEach(formatMoney); }

  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                   'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
  // Default the issue day/month/year to today (only when none is set — keeps a saved/edited date).
  function defaultIssueDate() {
    function byName(n) { return qs('.page input[name="' + n + '"]'); }
    var d = byName('issueDate.day'), m = byName('issueDate.month'), y = byName('issueDate.yearBE');
    if (!d || !m || !y || d.value || m.value || y.value) return;
    var now = new Date();
    d.value = String(now.getDate());
    m.value = (state.lang === 'en' ? EN_MONTHS : TH_MONTHS)[now.getMonth()];
    setVal(y, toDisplay(y, String(now.getFullYear() + 543))); // be-year: store BE, display per lang
  }

  // Sample data: two Thai sets + one English set, picked to match the form's current language (the
  // Thai ones alternate on repeated clicks). A company withholding tax on an individual's salary.
  var SAMPLES = {
    th: [
      { 'certificate.bookNumber': '1', 'certificate.number': '123',
        'payer.taxId.1': '0', 'payer.taxId.2': '1055', 'payer.taxId.3': '56012', 'payer.taxId.4': '34', 'payer.taxId.5': '5',
        'payer.name': 'บริษัท ลานนา เทค จำกัด', 'payer.address': '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110',
        'payee.taxId.1': '1', 'payee.taxId.2': '1009', 'payee.taxId.3': '87654', 'payee.taxId.4': '32', 'payee.taxId.5': '1',
        'payee.name': 'นายสมชาย ใจดี', 'payee.address': '456 หมู่ 7 ตำบลสุเทพ อำเภอเมือง จังหวัดเชียงใหม่ 50200',
        'payee.legacyTaxId.1': '1', 'payee.legacyTaxId.2': '2345', 'payee.legacyTaxId.3': '6789', 'payee.legacyTaxId.4': '0',
        'withholdingReturn.sequenceNumber': '1', 'withholdingReturn.formType.pnd1a': '1',
        'income.0.datePaid': '31 ธ.ค. 69', 'income.0.amountPaid': '600000.00', 'income.0.taxWithheld': '30000.00',
        'funds.socialSecurity': '9000.00', 'taxPaymentCondition.withheldFromPayment': '1' },
      { 'certificate.bookNumber': '2', 'certificate.number': '045',
        'payer.taxId.1': '0', 'payer.taxId.2': '9943', 'payer.taxId.3': '00128', 'payer.taxId.4': '77', 'payer.taxId.5': '0',
        'payer.name': 'ห้างหุ้นส่วนจำกัด เชียงใหม่ก่อสร้าง', 'payer.address': '99 หมู่ 4 ตำบลหนองป่าครั่ง อำเภอเมือง จังหวัดเชียงใหม่ 50000',
        'payee.taxId.1': '3', 'payee.taxId.2': '5099', 'payee.taxId.3': '01234', 'payee.taxId.4': '56', 'payee.taxId.5': '7',
        'payee.name': 'นางสาวสุดา รักไทย', 'payee.address': '12 ถนนนิมมานเหมินท์ ตำบลสุเทพ อำเภอเมือง จังหวัดเชียงใหม่ 50200',
        'payee.legacyTaxId.1': '3', 'payee.legacyTaxId.2': '5099', 'payee.legacyTaxId.3': '0123', 'payee.legacyTaxId.4': '4',
        'withholdingReturn.sequenceNumber': '5', 'withholdingReturn.formType.pnd3': '1',
        'income.0.datePaid': '15 พ.ย. 69', 'income.0.amountPaid': '250000.00', 'income.0.taxWithheld': '7500.00',
        'taxPaymentCondition.paidByPayerRecurring': '1' }
    ],
    en: [
      { 'certificate.bookNumber': '7', 'certificate.number': '212',
        'payer.taxId.1': '0', 'payer.taxId.2': '1055', 'payer.taxId.3': '56012', 'payer.taxId.4': '34', 'payer.taxId.5': '5',
        'payer.name': 'Lanna Tech Co., Ltd.', 'payer.address': '123 Sukhumvit Rd., Khlong Toei, Khlong Toei, Bangkok 10110',
        'payee.taxId.1': '1', 'payee.taxId.2': '1009', 'payee.taxId.3': '87654', 'payee.taxId.4': '32', 'payee.taxId.5': '1',
        'payee.name': 'Mr. Somchai Jaidee', 'payee.address': '456 Moo 7, Suthep, Muang, Chiang Mai 50200',
        'payee.legacyTaxId.1': '1', 'payee.legacyTaxId.2': '2345', 'payee.legacyTaxId.3': '6789', 'payee.legacyTaxId.4': '0',
        'withholdingReturn.sequenceNumber': '1', 'withholdingReturn.formType.pnd1a': '1',
        'income.0.datePaid': '31 Dec 2026', 'income.0.amountPaid': '600000.00', 'income.0.taxWithheld': '30000.00',
        'funds.socialSecurity': '9000.00', 'taxPaymentCondition.withheldFromPayment': '1' }
    ]
  };
  var sampleIdx = 0;
  function fillSample() {
    var lang = state.lang === 'en' ? 'en' : 'th';
    var list = SAMPLES[lang], d = list[sampleIdx % list.length]; sampleIdx++;
    Object.keys(d).forEach(function (n) {
      var el = qs('.page input[name="' + n + '"]'); if (el) setVal(el, d[n]);
    });
    qsa('.page input.money').forEach(formatMoney); // separators on sample fill
    recompute(); scheduleSave();
  }

  // Coordinate the 5 segmented TIN boxes (groups 1-4-5-2-1): keep digits only, auto-advance on fill,
  // backspace to the previous box, and paste a full multi-digit number to distribute across all five.
  function wireTin(prefix, sizes) {
    var segs = [];
    for (var i = 0; i < sizes.length; i++) {
      var s = qs('.page input[name="' + prefix + (i + 1) + '"]'); if (!s) return; segs.push(s);
    }
    function go(j, toEnd) {
      if (j < 0 || j >= segs.length) return;
      var s = segs[j]; s.focus();
      var n = toEnd ? s.value.length : 0; try { s.setSelectionRange(n, n); } catch (e) {}
    }
    segs.forEach(function (seg, i) {
      seg.addEventListener('input', function () {
        seg.value = seg.value.replace(/\D/g, '').slice(0, sizes[i]);
        if (seg.value.length >= sizes[i] && i < segs.length - 1) go(i + 1, false); // advance when a box fills
      });
      seg.addEventListener('keydown', function (e) {
        var atStart = seg.selectionStart === 0 && seg.selectionEnd === 0;
        var atEnd = seg.selectionStart === seg.value.length && seg.selectionStart === seg.selectionEnd;
        if (e.key === 'Backspace' && !seg.value && i > 0) { e.preventDefault(); go(i - 1, true); }      // empty box -> prev
        else if (e.key === 'Enter') { e.preventDefault(); if (i < segs.length - 1) go(i + 1, false); else seg.blur(); }
        else if (e.key === 'ArrowLeft' && atStart && i > 0) { e.preventDefault(); go(i - 1, true); }    // step across boxes
        else if (e.key === 'ArrowRight' && atEnd && i < segs.length - 1) { e.preventDefault(); go(i + 1, false); }
        // Tab moves natively in DOM order; Delete forward-deletes (input handler re-filters to digits).
      });
      seg.addEventListener('paste', function (e) {
        var data = e.clipboardData || root.clipboardData;
        var t = (data ? data.getData('text') : '').replace(/\D/g, '');
        if (t.length <= sizes[i]) return;            // single-box paste: let the browser handle it
        e.preventDefault();
        for (var j = 0, pos = 0; j < segs.length; j++) { segs[j].value = t.substr(pos, sizes[j]); pos += sizes[j]; }
        go(segs.length - 1, true);
        recompute(); scheduleSave();
      });
    });
  }

  function wireFields() {
    fields().forEach(function (el) {
      el.addEventListener('focus', function () { unformatMoney(el); });
      el.addEventListener('input', function () { recompute(); afterEdit(); });
      el.addEventListener('change', function () { formatMoney(el); recompute(); afterEdit(); });
      el.addEventListener('blur', function () { formatMoney(el); recompute(); afterEdit(); });
    });
    if (EMBEDDED) {
      wireTin('payer.taxId.', [1, 4, 5, 2, 1]);
      wireTin('payee.taxId.', [1, 4, 5, 2, 1]);
      wireTin('payer.legacyTaxId.', [1, 4, 4, 1]);
      wireTin('payee.legacyTaxId.', [1, 4, 4, 1]);
    }
  }
  // Standalone persists to IndexedDB; embedded notifies the host via onChange.
  function afterEdit() { if (EMBEDDED) { if (state.onChange) state.onChange(collect()); } else { scheduleSave(); } }

  // Embedded teardown: invalidate pending async continuations, clear the save timer, drop the host callback.
  function destroy() {
    state.gen = (state.gen || 0) + 1; // any in-flight fonts.ready/raf continuation no-ops
    clearTimeout(state.saveTimer);
    state.onChange = null;
  }

  function init(opts) {
    state.formId = opts.formId;
    ROOT = opts.root || (typeof document !== 'undefined' ? document : null);
    EMBEDDED = !!opts.embedded;
    state.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    if (EMBEDDED) {
      // Baked layout + strings, no token/GitHub/IndexedDB/Studio.
      state.layout = opts.layout || {};
      if (opts.strings) applyStrings(opts.strings);
      wireFields();
      restore(opts.data || {});
      recompute();
      formatMoneyAll();
      setLang(opts.lang || 'th');
      var myGen = (state.gen = (state.gen || 0) + 1);
      var go = function () { if (state.gen !== myGen) return; fitEnglish(); captureLayoutBaselines(); applyLayout(); };
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
      return;
    }

    state.repo = opts.repo;
    if (!getToken() || !state.repo) { showTokenGate(); return; }
    bindConsole();
    wireFields();
    wireTin('payer.taxId.', [1, 4, 5, 2, 1]);
    wireTin('payee.taxId.', [1, 4, 5, 2, 1]);
    wireTin('payer.legacyTaxId.', [1, 4, 4, 1]);
    wireTin('payee.legacyTaxId.', [1, 4, 4, 1]);
    loadLayout().then(function () { finishLoad(opts); }, function () {
      clearToken();
      showTokenGate('Token invalid, expired, or lacks access to this repo — try another.');
    });
  }

  function finishLoad(opts) {
    (opts.strings ? loadStrings(opts.strings) : Promise.resolve())
      .then(function () { return Storage.openDB(); })
      .then(function (db) {
        state.db = db;
        if (!db.available) { var w = byId('storeWarn'); if (w) w.style.display = ''; }
        return db.loadFields(state.formId);
      }).then(function (map) {
        var ui = map._ui || {};
        if (ui.showFields) classRoot().classList.add('show-fields');
        restore(map);
        qsa('.page input.money').forEach(formatMoney); // separators on load
        recompute();
        setLang(opts.lang || ui.lang || 'th'); // explicit opts.lang lets each page force its language
        defaultIssueDate(); // day/month/year default to today when the user hasn't set one
        if (root.ImageTool && root.ImageTool.restoreSlots) root.ImageTool.restoreSlots(state);
        var afterFonts = function () { fitEnglish(); captureLayoutBaselines(); applyLayout(); };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(afterFonts); else afterFonts();
      }).catch(function (e) { if (typeof console !== 'undefined') console.error('[form-engine] load error', e); });
  }

  // Console actions filled in across Tasks 5-7.
  function bindConsole() {
    var c = byId('console'); if (!c) return;
    c.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]'); if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'lang') setLang(state.lang === 'en' ? 'th' : 'en');
      else if (act === 'toggleFields') { classRoot().classList.toggle('show-fields'); scheduleSave(); }
      else if (act === 'print') window.print();
      else if (act === 'clearSubmit') clearSubmit();
      else if (act === 'resetAll') resetAll();
      else if (act === 'img' && root.ImageTool) root.ImageTool.open(state, btn.getAttribute('data-slot'));
      else if (act === 'labelNums') { state.labelNums = btn.checked; renderNumBadges(); }
      else if (act === 'inputNums') { state.inputNums = btn.checked; renderNumBadges(); }
      else if (act === 'inputNumMode') { state.inputNumMode = state.inputNumMode === 'name' ? 'num' : 'name'; renderNumBadges(); }
      else if (act === 'grid') { state.grid = btn.checked; renderGrid(); }
      else if (act === 'sample') fillSample();
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
    qsa('.slot').forEach(function (img) { img.style.display = 'none'; img.removeAttribute('src'); });
    qsa('.slot-size').forEach(function (el) { el.remove(); });
    if (state.db) state.db.clearForm(state.formId, { keepImages: false });
    scheduleSave();
  }

  // ---- GitHub save/read helpers ----
  var TOKEN_KEY = 'tff:ghtoken';
  function getToken() { return (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || ''; }
  function setToken(t) { if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY); }

  // UTF-8-safe base64 (GitHub Contents API wants base64 file content).
  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function contentsUrl(repo, formId) {
    return 'https://api.github.com/repos/' + repo.owner + '/' + repo.name +
           '/contents/public/forms/' + formId + '/layout.json';
  }
  function needsRetry(status) { return status === 409; } // stale sha -> re-GET + PUT once (LWW)

  root.FormEngine = {
    init: init, flush: persist, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _restore: restore, _afterEdit: afterEdit, _formatMoneyAll: formatMoneyAll, _destroy: destroy,
    _setLang: setLang, _fields: fields, _recompute: recompute, _num: num, _fmt: fmt,
    _layoutKey: layoutKey, _scaleOf: scaleOf, _composeTransform: composeTransform,
    _selectable: selectable, _elForKey: elForKey, _captureLayoutBaselines: captureLayoutBaselines,
    _applyLayoutOne: applyLayoutOne,
    _getToken: getToken, _setToken: setToken, _clearToken: clearToken,
    _b64utf8: b64utf8, _contentsUrl: contentsUrl, _needsRetry: needsRetry, _loadLayout: loadLayout
  };
})(typeof self !== 'undefined' ? self : this);
