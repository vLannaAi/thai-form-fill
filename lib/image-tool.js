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

  return { makeTransparent: makeTransparent };
});
