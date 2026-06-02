(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BahtText = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var TH_N = ['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
  var TH_U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  // Read a 1..6 digit chunk. hasHigher=true when a higher million-group precedes,
  // so a trailing 1 becomes เอ็ด (e.g. 1,000,001 -> ...ล้านเอ็ด).
  function thaiGroup(s, hasHigher) {
    var len = s.length, out = '';
    for (var i = 0; i < len; i++) {
      var d = +s.charAt(i), pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0) out += (d === 1 && (len > 1 || hasHigher)) ? 'เอ็ด' : TH_N[d];
      else if (pos === 1) out += d === 1 ? 'สิบ' : (d === 2 ? 'ยี่สิบ' : TH_N[d] + 'สิบ');
      else out += TH_N[d] + TH_U[pos];
    }
    return out;
  }

  function thaiInt(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!isFinite(n)) return '';
    if (n === 0) return 'ศูนย์';
    var chunks = [];
    while (n > 0) { chunks.push(n % 1000000); n = Math.floor(n / 1000000); }
    var out = '';
    for (var i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i] === 0) continue;
      var hasHigher = false;
      for (var j = i + 1; j < chunks.length; j++) { if (chunks[j] > 0) { hasHigher = true; break; } }
      out += thaiGroup(String(chunks[i]), hasHigher);
      for (var k = 0; k < i; k++) out += 'ล้าน';
    }
    return out;
  }

  function thai(amount) {
    var a = parseFloat(amount);
    if (!isFinite(a)) return '';
    var parts = Math.abs(a).toFixed(2).split('.');
    var baht = parseInt(parts[0], 10), satang = parseInt(parts[1], 10);
    var txt = (a < 0 ? 'ลบ' : '');
    if (baht > 0) txt += thaiInt(baht) + 'บาท';
    else if (satang === 0) txt += 'ศูนย์บาท';
    if (satang > 0) txt += thaiInt(satang) + 'สตางค์';
    else if (baht > 0 || satang === 0) txt += 'ถ้วน';
    return txt;
  }

  var EN_ONES = ['zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  var EN_TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  var EN_SCALE = ['', 'thousand', 'million', 'billion', 'trillion'];

  function enBelow1000(x) {
    var s = '';
    if (x >= 100) { s += EN_ONES[Math.floor(x / 100)] + ' hundred'; x %= 100; if (x) s += ' '; }
    if (x >= 20) { s += EN_TENS[Math.floor(x / 10)]; if (x % 10) s += '-' + EN_ONES[x % 10]; }
    else if (x > 0) s += EN_ONES[x];
    return s;
  }

  function englishInt(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!isFinite(n)) return '';
    if (n === 0) return 'zero';
    var chunks = [];
    while (n > 0) { chunks.push(n % 1000); n = Math.floor(n / 1000); }
    var parts = [];
    for (var i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i] === 0) continue;
      parts.push(enBelow1000(chunks[i]) + (EN_SCALE[i] ? ' ' + EN_SCALE[i] : ''));
    }
    return parts.join(' ');
  }

  function english(amount) {
    var a = parseFloat(amount);
    if (!isFinite(a)) return '';
    var parts = Math.abs(a).toFixed(2).split('.');
    var baht = parseInt(parts[0], 10), satang = parseInt(parts[1], 10);
    var txt = (a < 0 ? 'minus ' : '') + englishInt(baht) + ' baht';
    if (satang > 0) txt += ' ' + englishInt(satang) + ' satang';
    return txt;
  }

  return { thai: thai, english: english, thaiInt: thaiInt, englishInt: englishInt };
});
