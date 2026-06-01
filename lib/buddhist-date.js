(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuddhistDate = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var OFFSET = 543;

  function beToCe(y) { return y - OFFSET; }
  function ceToBe(y) { return y + OFFSET; }

  function guessUnit(y) { return Number(y) >= 2400 ? 'BE' : 'CE'; }

  function normalizeToBE(y) {
    y = parseInt(y, 10);
    if (isNaN(y)) return null;
    return guessUnit(y) === 'BE' ? y : ceToBe(y);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseDMY(str) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str).trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2], y = +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return { d: d, m: mo, y: y };
  }

  function displayYear(storedBE, lang) {
    var y = parseInt(storedBE, 10);
    if (isNaN(y)) return storedBE;
    return lang === 'en' ? String(beToCe(y)) : String(y);
  }

  function storeYear(displayed, lang) {
    var y = parseInt(displayed, 10);
    if (isNaN(y)) return displayed;
    return lang === 'en' ? String(ceToBe(y)) : String(y);
  }

  function displayDMY(storedStr, lang) {
    var p = parseDMY(storedStr);
    if (!p) return storedStr;
    var y = lang === 'en' ? beToCe(p.y) : p.y;
    return pad(p.d) + '/' + pad(p.m) + '/' + y;
  }

  function storeDMY(displayedStr, lang) {
    var p = parseDMY(displayedStr);
    if (!p) return displayedStr;
    var y = lang === 'en' ? ceToBe(p.y) : p.y;
    return pad(p.d) + '/' + pad(p.m) + '/' + y;
  }

  return {
    beToCe: beToCe, ceToBe: ceToBe, guessUnit: guessUnit,
    normalizeToBE: normalizeToBE, parseDMY: parseDMY, pad: pad,
    displayYear: displayYear, storeYear: storeYear,
    displayDMY: displayDMY, storeDMY: storeDMY
  };
});
