#!/usr/bin/env python3
"""Generate the interactive bilingual form (index.html) from the cleaned
pdf2htmlEX output (50bis.html). All Thai/English text lives in strings.json;
this script is layout + wiring only: it tags each label text node with
data-th/data-en for the engine's language toggle, hides the multi-line source
nodes and replaces them with clean wrapping paragraphs, builds the input
overlay, and injects the lib/ engine + edit console.

To change wording, edit strings.json (no Python needed) and re-run this script.
"""
import re, html, json

src = open('50bis.html', encoding='utf-8').read()
STR = json.load(open('strings.json', encoding='utf-8'))

# --- bilingual content (all of it from strings.json) ------------------------
# labels: visible single-line text keyed by pdf2htmlEX DOM-order index.
LABELS = STR['labels']
TRANS = {int(k): v['en'] for k, v in LABELS.items()}  # index -> English
TH    = {int(k): v['th'] for k, v in LABELS.items()}  # index -> Thai
# paragraphs: multi-line sentences rebuilt as one wrapping block.
PARAS = STR['paragraphs']
HIDE = {i for p in PARAS for i in p["hide"]}
# fields: input tooltips keyed by field id. console: edit-toolbar UI text.
FIELDS = STR['fields']
C = STR['console']

# Scale all label text down ~24% (the converter's sizes render a touch large in
# real fonts). Preserves the size hierarchy by scaling every .fs class equally.
SCALE = 0.76
fs_css = ''
try:
    _css = open('style.css', encoding='utf-8').read()
    for m in re.finditer(r'\.(fs\d+)\{font-size:([0-9.]+)px;?\}', _css):
        fs_css += '.pc .%s{font-size:%.2fpx !important;}' % (m.group(1), float(m.group(2)) * SCALE)
except OSError:
    pass

# Tag single-line labels with clean data-th/data-en; hide the paragraph nodes.
counter = {'i': 0}
def add_attrs(m):
    idx = counter['i']; counter['i'] += 1
    tag = m.group(0)
    if idx in HIDE:
        # .t nodes position via CSS classes (no inline style), so ADD one to hide.
        tag = re.sub(r'(class="t[^"]*")', r'\1 style="display:none"', tag, count=1)
    elif idx in TRANS:
        th = html.escape(TH.get(idx, ''), quote=True)
        en = html.escape(TRANS[idx], quote=True)
        tag = re.sub(r'(class="t[^"]*")', r'\1 data-th="%s" data-en="%s"' % (th, en), tag, count=1)
    return tag

src = re.sub(r'<div class="t[^>]*>', add_attrs, src)
tagged = counter['i']

# Clean-text paragraph blocks for the text overlay (rendered in real fonts).
para_html = []
for p in PARAS:
    sz = p.get("sz", 12)
    para_html.append(
      '<div class="tx" data-th="%s" data-en="%s" style="left:%dpx;top:%dpx;width:%dpx;font-size:%dpx;">%s</div>'
      % (html.escape(p["th"],True), html.escape(p["en"],True), p["x"], p["y"], p["w"], sz, html.escape(p["th"])))
TXT = '<div id="txt">' + ''.join(para_html) + '</div>'

# --- build the input overlay (coords are in the 893x1263 .pf pixel space) ---
# income-table fill rows: dotted-leader y positions -> date / amount / tax cells
ROW_Y = [452,474,495,517,604,626,648,669,713,756,800,843,930,952]
fields = []
def F(id,x,y,w,h,cls='tf',role=None,dtype=None,th=None,en=None,extra=''):
    # Resolve the tooltip from strings.json by field id (income rows date0..N
    # fall back to the base key 'date'); th/en args override for generated ids.
    if th is None:
        meta = FIELDS.get(id) or FIELDS.get(id.rstrip('0123456789'))
        if meta: th, en = meta['th'], meta['en']
    a=f'id="f_{id}" name="{id}" class="{cls}"'
    if role: a+=f' data-role="{role}"'
    if dtype: a+=f' data-type="{dtype}"'
    if th: a+=f' data-th="{html.escape(th,True)}" data-en="{html.escape(en,True)}" title="{html.escape(th,True)}"'
    typ='checkbox' if cls=='cb' else 'text'
    if typ=='text': a+=' autocomplete="off"'
    fields.append(f'<input type="{typ}" {a} {extra} style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;">')

# Payer (owner) block
F('book_no',790,73,58,18,role='owner')
F('run_no',790,95,58,18,role='owner')
F('tin1',596,123,206,19,'tf mono',role='owner',extra='inputmode="numeric" maxlength="13"')
F('name1',80,155,392,20,role='owner')
F('add1',96,184,726,20,role='owner')
# Payee block
F('tin2',596,226,206,19,'tf mono',extra='inputmode="numeric" maxlength="13"')
F('name2',80,264,392,20)
F('add2',96,297,726,20)
F('seq',112,336,44,19)
# P.N.D. checkboxes (row1 i66 ~y341, row2 i67 ~y369) — numbered tooltips, generated
for i,(cid,x,y) in enumerate([('pnd1',171,340),('pnd1x',330,340),('pnd2',470,340),('pnd3',600,340),
                               ('pnd2a',430,367),('pnd3a',548,367),('pnd53',660,367)]):
    F(cid,x,y,14,14,'cb',th=f'ภ.ง.ด. ({i+1})',en=f'P.N.D. ({i+1})')
# Income table rows: date / amount / tax (tooltips share base keys date/pay/tax)
for n,y in enumerate(ROW_Y):
    F(f'date{n}',495,y-4,95,17)
    F(f'pay{n}',600,y-4,120,17,'tf money',extra='inputmode="decimal"')
    F(f'tax{n}',726,y-4,110,17,'tf money',extra='inputmode="decimal"')
# Totals
F('pay_total',600,972,120,18,'tf money',extra='inputmode="decimal"')
F('tax_total',726,972,110,18,'tf money',extra='inputmode="decimal"')
F('total_words',272,1002,402,18)
# Fund amounts (i105)
F('fund_gpf',430,1030,72,17,'tf money',extra='inputmode="decimal"')
F('fund_sso',628,1030,64,17,'tf money',extra='inputmode="decimal"')
F('fund_pvd',773,1030,64,17,'tf money',extra='inputmode="decimal"')
# Payer-method checkboxes (i104 ~y1066)
for cid,x in [('m1',150),('m2',300),('m3',470),('m4',610)]:
    F(cid,x,1064,14,14,'cb',role='owner')
# Issue date (i112 ~y1138)
F('iss_day',498,1136,40,17)
F('iss_month',545,1136,92,17)
F('iss_year',650,1136,55,17,dtype='be-year')

SLOTS = ('<img class="slot" id="slot_signature" data-slot="signature" alt="" '
         'style="left:545px;top:1108px;width:190px;height:26px;display:none;">'
         '<img class="slot" id="slot_stamp" data-slot="stamp" alt="" '
         'style="left:752px;top:1116px;width:72px;height:60px;display:none;">')
OVERLAY = '<div class="page" id="ov">' + ''.join(fields) + SLOTS + '</div>'
# inject text-overlay (paragraphs) then input-overlay as first children of .pf
src, n = re.subn(r'(<div id="pf1" class="pf[^>]*>)', r'\1' + TXT + OVERLAY, src, count=1)
assert n == 1, f"overlay injection anchor not found (n={n})"

# --- inject edit console + engine assets (UI text from strings.json) ---
CONSOLE = f'''<div class="toolbar" id="console">
  <strong data-th="{C['title']['th']}" data-en="{C['title']['en']}">{C['title']['th']}</strong>
  <button class="lang" id="langBtn" data-act="lang">EN</button>
  <button class="sec" data-act="toggleFields"><span data-th="{C['toggleFields']['th']}" data-en="{C['toggleFields']['en']}">{C['toggleFields']['th']}</span></button>
  <button class="sec" data-act="img" data-slot="signature"><span data-th="{C['signature']['th']}" data-en="{C['signature']['en']}">{C['signature']['th']}</span></button>
  <button class="sec" data-act="img" data-slot="stamp"><span data-th="{C['stamp']['th']}" data-en="{C['stamp']['en']}">{C['stamp']['th']}</span></button>
  <button class="sec" data-act="clearSubmit"><span data-th="{C['clearSubmit']['th']}" data-en="{C['clearSubmit']['en']}">{C['clearSubmit']['th']}</span></button>
  <button class="sec" data-act="resetAll"><span data-th="{C['resetAll']['th']}" data-en="{C['resetAll']['en']}">{C['resetAll']['th']}</span></button>
  <button data-act="print"><span data-th="{C['print']['th']}" data-en="{C['print']['en']}">{C['print']['th']}</span></button>
  <span class="sp"></span>
  <span id="storeWarn" style="display:none;color:#fbbc04" data-th="{C['storeWarn']['th']}" data-en="{C['storeWarn']['en']}">{C['storeWarn']['th']}</span>
</div>
'''

TOOLBAR_CSS = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
<style>
 /* Clean text: real fonts (Sarabun for Thai, serif for English to match the
    official English form) + natural spacing — replaces the pdf2htmlEX glyph subsets. */
 .pc .t{font-family:'Sarabun','Angsana New',sans-serif !important;letter-spacing:normal !important;word-spacing:normal !important;}
 body.lang-en .pc .t{font-family:'Times New Roman',Times,serif !important;}
 #txt{position:absolute;inset:0;z-index:40;}
 #txt .tx{position:absolute;color:#000;line-height:1.32;white-space:normal;font-family:'Sarabun','Angsana New',sans-serif;}
 body.lang-en #txt .tx{font-family:'Times New Roman',Times,serif;}
 body:not(.lang-en) #txt .tx[data-en]::after{content:'';}
 .toolbar{position:sticky;top:0;z-index:1000;background:#323639;color:#fff;display:flex;gap:10px;align-items:center;padding:8px 14px;font-family:'Sarabun',sans-serif;font-size:14px;flex-wrap:wrap;}
 .toolbar button{background:#1a73e8;color:#fff;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font:inherit;}
 .toolbar button.sec{background:#5f6368;}
 .toolbar .lang{background:#137333;font-weight:600;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;display:inline-block;}
 .toolbar .sp{flex:1;}
 #page-container{position:static !important;}
 #ov{position:absolute;inset:0;z-index:50;}
 #ov input{position:absolute;margin:0;padding:0 2px;border:0;background:transparent;color:#0b3d91;font-family:'Sarabun',sans-serif;font-size:13px;line-height:1;outline:none;box-sizing:border-box;}
 #ov input.mono{font-family:'Courier New',Courier,monospace;letter-spacing:8px;text-align:center;}
 #ov input.money{text-align:right;}
 #ov input.cb{-webkit-appearance:none;appearance:none;cursor:pointer;}
 #ov input.cb:checked::after{content:'\\2715';color:#0b3d91;font-weight:700;display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:13px;}
 body.show-fields #ov input.tf{background:rgba(26,115,232,.10);outline:1px solid rgba(26,115,232,.35);}
 body.show-fields #ov input.cb{outline:1px solid rgba(26,115,232,.55);}
 @media print{.toolbar{display:none;} #ov input{color:#000;} body.show-fields #ov input{outline:0;background:transparent;}}
</style>
<link rel="stylesheet" href="../../lib/engine.css"/>
'''

SCRIPTS = '''<script src="../../lib/buddhist-date.js"></script>
<script src="../../lib/image-tool.js"></script>
<script src="../../lib/storage.js"></script>
<script src="../../lib/form-engine.js"></script>
<script>FormEngine.init({ formId: '50bis', lang: 'th' });</script>
'''

TOOLBAR_CSS = TOOLBAR_CSS.replace('</style>', fs_css + '\n</style>', 1)
src = src.replace('</head>', TOOLBAR_CSS + '</head>', 1)
src = src.replace('<body>', '<body>\n' + CONSOLE, 1)
src = src.replace('</body>', SCRIPTS + '</body>', 1)

open('index.html', 'w', encoding='utf-8').write(src)
print(f"tagged {tagged} text nodes; {len(TRANS)} translated; {len(PARAS)} paragraphs; {len(FIELDS)} field labels")
print("wrote index.html", len(src), "bytes")
