(function (root) {
  var DB_NAME = 'thai-form-fill';
  var DB_VERSION = 1;

  function openDB() {
    return new Promise(function (resolve) {
      var ok = typeof indexedDB !== 'undefined';
      if (!ok) return resolve(stub());
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('fields')) db.createObjectStore('fields');
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = function () { resolve(wrap(req.result)); };
      req.onerror = function () { resolve(stub()); };
    });
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }
  function asPromise(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function wrap(db) {
    return {
      available: true,
      loadFields: function (formId) {
        return asPromise(tx(db, 'fields', 'readonly').get(formId)).then(function (v) { return v || {}; });
      },
      saveFields: function (formId, map) {
        return asPromise(tx(db, 'fields', 'readwrite').put(map, formId));
      },
      loadImage: function (formId, slot) {
        return asPromise(tx(db, 'images', 'readonly').get(formId + ':' + slot));
      },
      saveImage: function (formId, slot, blob, meta) {
        var rec = { blob: blob, w: meta.w, h: meta.h };
        return asPromise(tx(db, 'images', 'readwrite').put(rec, formId + ':' + slot));
      },
      deleteImage: function (formId, slot) {
        return asPromise(tx(db, 'images', 'readwrite').delete(formId + ':' + slot));
      },
      clearForm: function (formId, opts) {
        var p = asPromise(tx(db, 'fields', 'readwrite').delete(formId));
        if (opts && opts.keepImages) return p;
        return p.then(function () {
          return Promise.all([
            asPromise(tx(db, 'images', 'readwrite').delete(formId + ':signature')),
            asPromise(tx(db, 'images', 'readwrite').delete(formId + ':stamp'))
          ]);
        });
      }
    };
  }

  // No-op stub when IndexedDB is unavailable. Engine shows a banner.
  function stub() {
    var noop = function () { return Promise.resolve(); };
    return {
      available: false,
      loadFields: function () { return Promise.resolve({}); },
      saveFields: noop, loadImage: function () { return Promise.resolve(null); },
      saveImage: noop, deleteImage: noop, clearForm: noop
    };
  }

  root.Storage = { openDB: openDB };
})(typeof self !== 'undefined' ? self : this);
