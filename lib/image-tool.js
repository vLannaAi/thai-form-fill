(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ImageTool = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // Zero the alpha channel of any pixel whose R,G,B are all >= threshold.
  function makeTransparent(imageData, threshold) {
    var d = imageData.data, t = threshold;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] >= t && d[i + 1] >= t && d[i + 2] >= t) d[i + 3] = 0;
    }
    return imageData;
  }

  // ---- DOM layer (browser only) ----
  function hasDoc() { return typeof document !== 'undefined'; }
  var MAXDIM = 2000;

  function loadFile(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('not an image'));
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }

  function fitDown(w, h) {
    var s = Math.min(1, MAXDIM / Math.max(w, h));
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }

  function open(state, slot) {
    if (!hasDoc()) return;
    var back = document.createElement('div'); back.className = 'dlg-backdrop';
    back.innerHTML =
      '<div class="dlg">' +
      '<div class="row"><input type="file" accept="image/*" id="it_file"></div>' +
      '<canvas id="it_canvas" width="320" height="160"></canvas>' +
      '<div class="row"><label>Transparency <input id="it_th" type="range" min="150" max="255" value="235"></label> ' +
      '<span id="it_thv">235</span></div>' +
      '<div class="row"><button id="it_apply">Apply</button> <button id="it_cancel">Cancel</button></div>' +
      '</div>';
    document.body.appendChild(back);

    var canvas = back.querySelector('#it_canvas');
    var ctx = canvas.getContext('2d');
    var thEl = back.querySelector('#it_th');
    var thv = back.querySelector('#it_thv');
    var srcImg = null;

    function render() {
      if (!srcImg) return;
      var f = fitDown(srcImg.naturalWidth, srcImg.naturalHeight);
      canvas.width = f.w; canvas.height = f.h;
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.drawImage(srcImg, 0, 0, f.w, f.h);
      var id = ctx.getImageData(0, 0, f.w, f.h);
      makeTransparent(id, parseInt(thEl.value, 10));
      ctx.putImageData(id, 0, 0);
    }

    back.querySelector('#it_file').addEventListener('change', function (e) {
      loadFile(e.target.files[0]).then(function (img) { srcImg = img; render(); }).catch(function () { alert('Please choose an image file.'); });
    });
    thEl.addEventListener('input', function () { thv.textContent = thEl.value; render(); });
    back.querySelector('#it_cancel').addEventListener('click', function () { back.remove(); });
    back.querySelector('#it_apply').addEventListener('click', function () {
      if (!srcImg) { back.remove(); return; }
      canvas.toBlob(function (blob) {
        var meta = { w: canvas.width, h: canvas.height };
        state.db.saveImage(state.formId, slot, blob, meta);
        place(slot, blob, defaultSize(slot));
        back.remove();
      }, 'image/png');
    });
  }

  function defaultSize(slot) {
    var img = document.getElementById('slot_' + slot);
    return { w: parseFloat(img.style.width) || 120, h: parseFloat(img.style.height) || 40 };
  }

  function place(slot, blob, size) {
    var img = document.getElementById('slot_' + slot);
    if (!img) return;
    if (img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    if (size && size.w) img.style.width = size.w + 'px';
    if (size && size.h) img.style.height = size.h + 'px';
    img.style.display = '';
    addSizer(slot);
  }

  // Simple size control: a small +/- box near the slot.
  function addSizer(slot) {
    var img = document.getElementById('slot_' + slot);
    var existing = document.getElementById('sizer_' + slot);
    if (existing) existing.remove();
    var box = document.createElement('div');
    box.className = 'slot-size'; box.id = 'sizer_' + slot;
    box.style.left = (parseFloat(img.style.left) + parseFloat(img.style.width) + 4) + 'px';
    box.style.top = img.style.top;
    box.innerHTML = '<button data-d="-">−</button><button data-d="+">+</button>';
    img.parentNode.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-d') === '+' ? 1.1 : 0.9;
      var w = parseFloat(img.style.width) * k, h = parseFloat(img.style.height) * k;
      img.style.width = w + 'px'; img.style.height = h + 'px';
      box.style.left = (parseFloat(img.style.left) + w + 4) + 'px';
      persistSize(slot, w, h);
    });
  }

  function persistSize(slot, w, h) {
    var st = root.FormEngine && root.FormEngine._state;
    if (!st || !st.db) return;
    st.db.loadImage(st.formId, slot).then(function (rec) {
      if (rec && rec.blob) st.db.saveImage(st.formId, slot, rec.blob, { w: w, h: h });
    });
  }

  function restoreSlots(state) {
    ['signature', 'stamp'].forEach(function (slot) {
      state.db.loadImage(state.formId, slot).then(function (rec) {
        if (rec && rec.blob) place(slot, rec.blob, { w: rec.w, h: rec.h });
      });
    });
  }

  return { makeTransparent: makeTransparent, open: open, place: place, restoreSlots: restoreSlots };
});
