(function (root) {
  var BD = root.BuddhistDate;
  var Storage = root.Storage;

  var state = { formId: null, db: null, lang: 'th', saveTimer: null };

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

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      if (!state.db) return; // openDB may not have resolved yet
      state.db.saveFields(state.formId, collect());
    }, 300);
  }

  function restore(map) {
    fields().forEach(function (el) {
      if (Object.prototype.hasOwnProperty.call(map, el.name)) setVal(el, toDisplay(el, map[el.name]));
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
    applyLangText(en);
    if (en) requestAnimationFrame(fitEnglish);
    scheduleSave();
  }

  function init(opts) {
    state.formId = opts.formId;
    bindConsole();
    fields().forEach(function (el) { el.addEventListener('input', scheduleSave); el.addEventListener('change', scheduleSave); });
    Storage.openDB().then(function (db) {
      state.db = db;
      if (!db.available) { var w = document.getElementById('storeWarn'); if (w) w.style.display = ''; }
      return db.loadFields(state.formId);
    }).then(function (map) {
      var ui = map._ui || {};
      if (ui.showFields) document.body.classList.add('show-fields');
      restore(map);
      setLang(ui.lang || 'th');
      if (root.ImageTool && root.ImageTool.restoreSlots) root.ImageTool.restoreSlots(state);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitEnglish);
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
    init: init, _state: state, _collect: collect, _scheduleSave: scheduleSave,
    _setLang: setLang, _fields: fields
  };
})(typeof self !== 'undefined' ? self : this);
