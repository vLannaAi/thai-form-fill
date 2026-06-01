#!/usr/bin/env python3
"""Wire the cleaned official English form (en.html) into the app: add the edit
console (language button navigates back to the Thai form), the shared lib/ engine,
and init with lang='en' (so BE years display as CE). Input overlay is added in a
later step; field names will mirror the Thai form so data is shared via IndexedDB."""
import re, html
src = open('en_clean.html', encoding='utf-8').read()

# --- input overlay (coords in the 595x842 .pf space of the English form) ---
# field NAMES mirror the Thai form so data is shared via IndexedDB by name.
fields=[]
def F(id,x,y,w,h,cls='tf',role=None,dtype=None,en='',extra=''):
    a=f'id="f_{id}" name="{id}" class="{cls}"'
    if role: a+=f' data-role="{role}"'
    if dtype: a+=f' data-type="{dtype}"'
    if en: a+=f' title="{html.escape(en,True)}"'
    typ='checkbox' if cls=='cb' else 'text'
    if typ=='text': a+=' autocomplete="off"'
    fields.append(f'<input type="{typ}" {a} {extra} style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;">')

# Payer (owner) block
F('book_no',505,44,40,11,role='owner',en='Book No.')
F('run_no',505,56,40,11,role='owner',en='No.')
F('tin1',378,71,135,11,'tf mono',role='owner',en='Tax ID (payer)',extra='inputmode="numeric" maxlength="13"')
F('name1',108,82,262,11,role='owner',en='Payer name')
F('add1',118,100,402,11,role='owner',en='Payer address')
# Payee block
F('tin2',378,115,135,11,'tf mono',en='Tax ID (payee)',extra='inputmode="numeric" maxlength="13"')
F('name2',108,130,262,11,en='Payee name')
F('add2',118,147,402,11,en='Payee address')
F('seq',200,163,55,11,en='Sequence No.')
# P.N.D. checkboxes (row near y166-180)
for cid,x,y in [('pnd1',218,167),('pnd1x',262,167),('pnd2',390,167),('pnd3',460,167),
                ('pnd2a',218,179),('pnd3a',300,179),('pnd53',390,179)]:
    F(cid,x,y,10,10,'cb',en=cid.upper())
# Income table rows (Date paid / Amount paid / Tax withheld), dotted-leader y's
EN_ROW_Y=[209,221,233,247,328,343,359,375,420,452,480,494,512,604]
for n,y in enumerate(EN_ROW_Y):
    F(f'date{n}',352,y-2,52,11,en='Date paid')
    F(f'pay{n}',408,y-2,62,11,'tf money',en='Amount paid',extra='inputmode="decimal"')
    F(f'tax{n}',472,y-2,60,11,'tf money',en='Tax withheld',extra='inputmode="decimal"')
# Totals
F('pay_total',408,644,62,11,'tf money',en='Total amount',extra='inputmode="decimal"')
F('tax_total',472,644,60,11,'tf money',en='Total tax',extra='inputmode="decimal"')
F('total_words',190,662,330,11,en='Total tax (in words)')
# Fund amounts
F('fund_gpf',432,681,58,11,'tf money',en='Pension fund',extra='inputmode="decimal"')
F('fund_sso',250,697,58,11,'tf money',en='Social Security',extra='inputmode="decimal"')
F('fund_pvd',432,697,58,11,'tf money',en='Provident fund',extra='inputmode="decimal"')
# Payer-method checkboxes (y723 line)
for cid,x in [('m1',110),('m2',196),('m3',300),('m4',392)]:
    F(cid,x,723,10,10,'cb',role='owner',en=cid)
# Issue date (y783 line)
F('iss_day',312,782,32,11,en='Day')
F('iss_month',356,782,58,11,en='Month')
F('iss_year',430,782,42,11,dtype='be-year',en='Year')

SLOTS=('<img class="slot" id="slot_signature" data-slot="signature" alt="" '
       'style="left:330px;top:760px;width:150px;height:18px;display:none;">'
       '<img class="slot" id="slot_stamp" data-slot="stamp" alt="" '
       'style="left:486px;top:762px;width:46px;height:44px;display:none;">')
OVERLAY='<div class="page" id="ov">'+''.join(fields)+SLOTS+'</div>'
src,n=re.subn(r'(<div id="pf1" class="pf[^>]*>)', r'\1'+OVERLAY, src, count=1)
assert n==1, f"overlay anchor not found (n={n})"

CONSOLE = '''<div class="toolbar" id="console">
  <strong>50 Bis — Withholding Tax Certificate</strong>
  <a class="lang" id="langBtn" href="../50bis_converted/index.html" onclick="return navLang(this.href)">ไทย</a>
  <button class="sec" data-act="toggleFields">Show/Hide fields</button>
  <button class="sec" data-act="img" data-slot="signature">Signature</button>
  <button class="sec" data-act="img" data-slot="stamp">Stamp</button>
  <button class="sec" data-act="clearSubmit">Clear submission</button>
  <button class="sec" data-act="resetAll">Reset all</button>
  <button data-act="print">Print / Save PDF</button>
  <span class="sp"></span>
  <span id="storeWarn" style="display:none;color:#fbbc04">Autosave unavailable</span>
</div>
'''

HEAD = '''<style>
 .toolbar{position:sticky;top:0;z-index:1000;background:#323639;color:#fff;display:flex;gap:10px;align-items:center;padding:8px 14px;font-family:sans-serif;font-size:14px;flex-wrap:wrap;}
 .toolbar button{background:#1a73e8;color:#fff;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font:inherit;}
 .toolbar button.sec{background:#5f6368;}
 .toolbar .lang{background:#137333;font-weight:600;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;display:inline-block;}
 .toolbar .sp{flex:1;}
 #page-container{position:static !important;}
 #ov{position:absolute;inset:0;z-index:50;}
 #ov input{position:absolute;margin:0;padding:0 2px;border:0;background:transparent;color:#0b3d91;font-family:sans-serif;font-size:11px;line-height:1;outline:none;box-sizing:border-box;}
 #ov input.mono{font-family:'Courier New',monospace;letter-spacing:2px;text-align:center;}
 #ov input.money{text-align:right;}
 #ov input.cb{-webkit-appearance:none;appearance:none;cursor:pointer;}
 #ov input.cb:checked::after{content:'\\2715';color:#0b3d91;font-weight:700;display:flex;align-items:center;justify-content:center;width:100%;height:100%;}
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
<script>FormEngine.init({ formId: '50bis', lang: 'en' });
function navLang(href){
  try{ var st=FormEngine._state;
    if(st&&st.db&&st.db.available){ FormEngine.flush().then(function(){location.href=href;}); return false; }
  }catch(e){}
  return true;
}
</script>
'''

src = src.replace('</head>', HEAD + '</head>', 1)
src = src.replace('<body>', '<body>\n' + CONSOLE, 1)
src = src.replace('</body>', SCRIPTS + '</body>', 1)
open('en.html', 'w', encoding='utf-8').write(src)
print("wrote en.html", len(src), "bytes; console+engine added")
