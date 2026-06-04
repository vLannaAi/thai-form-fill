#!/usr/bin/env node
/* Build packaged assets for the embeddable 50bis form.
 *
 * Generates into packages/form-50bis/src/generated/:
 *   - form.scoped.css : form.css + engine.css, all selectors scoped under
 *                       .tff-50bis, self-hosted @font-face prepended, no
 *                       Google-Fonts @import.
 *   - markup.js       : the form's <div id="pf1"> ... </div> exported as a string.
 *   - strings.json, layout.json, assets/background.svg : copied verbatim.
 *
 * Robust CSS scoping uses PostCSS (NOT regex). Markup extraction balances
 * <div>/</div> tags (NOT lazy regex).
 *
 * Fonts: best-effort download of four woff2 files into assets/fonts/. Network
 * failure does NOT fail the build — the scoped CSS already references the paths.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const postcss = require('postcss');

// A modern Chrome UA makes fonts.googleapis.com return woff2 (an older/simple
// UA gets ttf, which we don't want).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const REPO = path.resolve(__dirname, '..', '..', '..');
const SRC_FORM = path.join(REPO, 'public', 'forms', '50bis');
const SRC_LIB = path.join(REPO, 'public', 'lib');
const OUT = path.join(REPO, 'packages', 'form-50bis', 'src', 'generated');

const FONT_FACE = [
  "@font-face{font-family:'JetBrains Mono';font-weight:400;src:url('./assets/fonts/jetbrains-400.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'JetBrains Mono';font-weight:700;src:url('./assets/fonts/jetbrains-700.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'Sarabun';font-weight:400;src:url('./assets/fonts/sarabun-400.woff2') format('woff2');font-display:swap;}",
  "@font-face{font-family:'Sarabun';font-weight:600;src:url('./assets/fonts/sarabun-600.woff2') format('woff2');font-display:swap;}",
].join('\n');

// --- CSS scoping ----------------------------------------------------------
function scope(css) {
  const root = postcss.parse(css);
  // Drop any leftover Google-Fonts @import.
  root.walkAtRules((r) => {
    if (r.name === 'import' && /googleapis/.test(r.params)) r.remove();
  });
  root.walkRules((rule) => {
    // Skip selector-less rules inside @font-face / @keyframes.
    if (rule.parent && rule.parent.type === 'atrule' && /keyframes|font-face/i.test(rule.parent.name)) return;
    rule.selectors = rule.selectors.map((sel) => {
      if (/^body\b/.test(sel)) return sel.replace(/^body\b/, '.tff-50bis'); // body / body.lang-en / body.show-fields
      if (sel.startsWith('.tff-50bis')) return sel;
      return '.tff-50bis ' + sel;
    });
  });
  return root.toString();
}

function buildCss() {
  let formCss = fs.readFileSync(path.join(SRC_FORM, 'form.css'), 'utf8');
  const engineCss = fs.readFileSync(path.join(SRC_LIB, 'engine.css'), 'utf8');
  // Remove the Google-Fonts @import as a string before parsing (belt & braces).
  formCss = formCss.replace(/@import\s+url\([^)]*fonts\.googleapis[^)]*\)\s*;?/g, '');
  let scoped = scope(formCss + '\n' + engineCss);
  // Rewrite url(assets/...) -> url('./assets/...') (relative to packaged CSS).
  scoped = scoped.replace(/url\(\s*(['"]?)assets\//g, "url('./assets/");
  const out = FONT_FACE + '\n' + scoped + '\n';
  fs.writeFileSync(path.join(OUT, 'form.scoped.css'), out);
  return out;
}

// --- Markup extraction (tag-balanced) -------------------------------------
function extractPf1(html) {
  const start = html.indexOf('<div id="pf1"');
  if (start < 0) throw new Error('no #pf1');
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let m, end = -1;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { end = m.index + m[0].length; break; }
  }
  if (end < 0) throw new Error('unbalanced #pf1');
  return html.slice(start, end);
}

function buildMarkup() {
  const html = fs.readFileSync(path.join(SRC_FORM, 'index.html'), 'utf8');
  const markup = extractPf1(html);
  fs.writeFileSync(path.join(OUT, 'markup.js'), 'export const MARKUP = ' + JSON.stringify(markup) + ';\n');
  return markup;
}

// --- Copy data assets -----------------------------------------------------
function copyAssets() {
  fs.copyFileSync(path.join(SRC_FORM, 'strings.json'), path.join(OUT, 'strings.json'));
  fs.copyFileSync(path.join(SRC_FORM, 'layout.json'), path.join(OUT, 'layout.json'));
  fs.copyFileSync(path.join(SRC_FORM, 'assets', 'background.svg'), path.join(OUT, 'assets', 'background.svg'));
}

// --- Fonts (best-effort; never fails the build) ---------------------------
function curl(url) {
  return execFileSync('curl', ['-sS', '-fL', '-H', 'User-Agent: ' + UA, url], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function curlToFile(url, dest) {
  execFileSync('curl', ['-sS', '-fL', '-H', 'User-Agent: ' + UA, '-o', dest, url], {
    timeout: 60000,
  });
}

// Pick the @font-face block whose unicode-range covers the needed codepoint.
// Google's css2 emits several subsets per family (cyrillic, greek, latin,
// thai, ...) — "first woff2" is the WRONG subset (JetBrains needs latin/digits
// for the boxed tax-id & money fields; Sarabun needs thai). Select by codepoint.
function pickWoff2(css, needCodepoint) {
  // Split into @font-face blocks; each carries its own src + unicode-range.
  const blocks = css.split('@font-face').slice(1);
  for (const b of blocks) {
    const ranges = (b.match(/unicode-range:\s*([^;]+);/) || [])[1] || '';
    if (!unicodeRangeCovers(ranges, needCodepoint)) continue;
    const m = b.match(/src:\s*url\(([^)]+\.woff2)\)/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  // Fallback: first woff2 in the file (better than nothing).
  const m = css.match(/src:\s*url\(([^)]+\.woff2)\)/);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

function unicodeRangeCovers(rangeStr, cp) {
  for (const part of rangeStr.split(',')) {
    const t = part.trim().replace(/^U\+/i, '');
    if (!t) continue;
    if (t.includes('-')) {
      const [lo, hi] = t.split('-').map((x) => parseInt(x, 16));
      if (cp >= lo && cp <= hi) return true;
    } else if (parseInt(t, 16) === cp) {
      return true;
    }
  }
  return false;
}

function fetchFonts() {
  const fontsDir = path.join(OUT, 'assets', 'fonts');
  const wanted = [
    // JetBrains Mono is used for digits (tax-id segments, money) — need latin (U+0030).
    { file: 'jetbrains-400.woff2', css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400', need: 0x0030 },
    { file: 'jetbrains-700.woff2', css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700', need: 0x0030 },
    // Sarabun renders the Thai form text — need the thai subset (U+0E01).
    { file: 'sarabun-400.woff2', css: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400', need: 0x0E01 },
    { file: 'sarabun-600.woff2', css: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@600', need: 0x0E01 },
  ];
  const got = [];
  for (const w of wanted) {
    try {
      const css = curl(w.css);
      const woffUrl = pickWoff2(css, w.need);
      if (!woffUrl) { console.warn('  ! no woff2 url found for ' + w.file); continue; }
      curlToFile(woffUrl, path.join(fontsDir, w.file));
      got.push(w.file);
    } catch (e) {
      console.warn('  ! font fetch failed for ' + w.file + ': ' + (e && e.message ? e.message : e));
    }
  }
  return got;
}

// --- main -----------------------------------------------------------------
function main() {
  fs.mkdirSync(path.join(OUT, 'assets', 'fonts'), { recursive: true });

  const css = buildCss();
  console.log('  form.scoped.css: ' + css.length + ' bytes');

  const markup = buildMarkup();
  console.log('  markup.js: ' + markup.length + ' bytes of markup');

  copyAssets();
  console.log('  copied strings.json, layout.json, assets/background.svg');

  const fonts = fetchFonts();
  if (fonts.length === 4) console.log('  fonts: downloaded all 4 woff2');
  else console.log('  fonts: downloaded ' + fonts.length + '/4 (' + (fonts.join(', ') || 'none') + ') — paths still referenced in CSS, files can be added later');

  console.log('done.');
}

main();
