(function (root, factory) {
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ImageTool = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
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
      var url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
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
      '<canvas id="it_canvas" class="it-crop" width="320" height="160"></canvas>' +
      '<div class="row it-hint">Drag on the image to crop. Click once to clear the crop.</div>' +
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
    var crop = null;        // crop rect in canvas-internal pixels, or null = whole image
    var base = { w: 0, h: 0 }; // fit-down dimensions of the displayed image

    // Map a pointer event to canvas-internal pixel coordinates (accounts for CSS scaling).
    function toCanvas(e) {
      var r = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(base.w, (e.clientX - r.left) * (canvas.width / r.width))),
        y: Math.max(0, Math.min(base.h, (e.clientY - r.top) * (canvas.height / r.height)))
      };
    }

    function render() {
      if (!srcImg) return;
      base = fitDown(srcImg.naturalWidth, srcImg.naturalHeight);
      canvas.width = base.w; canvas.height = base.h;
      ctx.clearRect(0, 0, base.w, base.h);
      ctx.drawImage(srcImg, 0, 0, base.w, base.h);
      var id = ctx.getImageData(0, 0, base.w, base.h);
      makeTransparent(id, parseInt(thEl.value, 10));
      ctx.putImageData(id, 0, 0);
      drawCropOverlay();
    }

    // Purely cosmetic — Apply re-renders from srcImg, never reads this canvas.
    function drawCropOverlay() {
      if (!crop) return;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, base.w, crop.y);
      ctx.fillRect(0, crop.y + crop.h, base.w, base.h - (crop.y + crop.h));
      ctx.fillRect(0, crop.y, crop.x, crop.h);
      ctx.fillRect(crop.x + crop.w, crop.y, base.w - (crop.x + crop.w), crop.h);
      ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = 1;
      ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);
      ctx.restore();
    }

    // Drag-to-crop interaction.
    var dragStart = null;
    canvas.addEventListener('mousedown', function (e) {
      if (!srcImg) return;
      dragStart = toCanvas(e);
      e.preventDefault();
    });
    function onMove(e) {
      if (!dragStart) return;
      var p = toCanvas(e);
      crop = {
        x: Math.min(dragStart.x, p.x), y: Math.min(dragStart.y, p.y),
        w: Math.abs(p.x - dragStart.x), h: Math.abs(p.y - dragStart.y)
      };
      render();
    }
    function onUp() {
      if (!dragStart) return;
      // A click (no meaningful drag) clears the crop back to the whole image.
      if (crop && (crop.w < 5 || crop.h < 5)) crop = null;
      dragStart = null;
      render();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    function cleanup() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      back.remove();
    }

    back.querySelector('#it_file').addEventListener('change', function (e) {
      loadFile(e.target.files[0]).then(function (img) { srcImg = img; crop = null; render(); }).catch(function () { alert('Please choose an image file.'); });
    });
    thEl.addEventListener('input', function () { thv.textContent = thEl.value; render(); });
    back.querySelector('#it_cancel').addEventListener('click', cleanup);
    back.querySelector('#it_apply').addEventListener('click', function () {
      if (!srcImg) { cleanup(); return; }
      var region = (crop && crop.w >= 5 && crop.h >= 5) ? crop : { x: 0, y: 0, w: base.w, h: base.h };
      var scaleX = srcImg.naturalWidth / base.w, scaleY = srcImg.naturalHeight / base.h;
      var out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(region.w));
      out.height = Math.max(1, Math.round(region.h));
      var octx = out.getContext('2d');
      octx.drawImage(srcImg, region.x * scaleX, region.y * scaleY, region.w * scaleX, region.h * scaleY,
        0, 0, out.width, out.height);
      var id = octx.getImageData(0, 0, out.width, out.height);
      makeTransparent(id, parseInt(thEl.value, 10));
      octx.putImageData(id, 0, 0);
      out.toBlob(function (blob) {
        var meta = { w: out.width, h: out.height };
        if (state.db) state.db.saveImage(state.formId, slot, blob, meta);
        place(slot, blob, defaultSize(slot));
        cleanup();
      }, 'image/png');
    });
  }

  function defaultSize(slot) {
    var img = document.getElementById('slot_' + slot);
    if (!img) return { w: 120, h: 40 };
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
