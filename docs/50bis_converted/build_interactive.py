#!/usr/bin/env python3
"""Generate the interactive bilingual form (index.html) from the cleaned
pdf2htmlEX output (50bis.html): tag each label text node with data-th/data-en
for the shared engine's language toggle, and wire in the lib/ engine + console.
Inputs are added in a later step."""
import re, html

src = open('50bis.html', encoding='utf-8').read()

# English translation for each meaningful .t node, keyed by DOM order index.
# Dotted-leader / tax-id-cell nodes are intentionally omitted (they become inputs).
TRANS = {
 0:"The person liable to withhold tax :-",
 1:"Name",
 3:"Address",
 18:"Taxpayer Identification No.",
 19:"Taxpayer Identification No. (13 digits)*",
 20:"Book No.",
 21:"No.",
 22:"Withholding Tax Certificate",
 23:"Under Section 50 Bis of the Revenue Code",
 24:"Copy 1 (for the payee to attach with the income tax return)",
 25:"Copy 2 (for the payee to keep as evidence)",
 26:"(Specify whether an individual, juristic person, company, association or body of persons)",
 27:"(Specify building/village name, room no., floor, no., alley/soi, moo, road, sub-district, district, province)",
 28:"(Specify whether an individual, juristic person, company, association or body of persons)",
 29:"(Specify building/village name, room no., floor, no., alley/soi, moo, road, sub-district, district, province)",
 30:"Type of assessable income paid",
 31:"Day, month",
 32:"or tax year paid",
 33:"Amount paid",
 34:"1. Salary, wages, allowance, bonus, etc. under Section 40(1)",
 35:"2. Fees, commissions, etc. under Section 40(2)",
 36:"3. Royalties, etc. under Section 40(3)",
 37:"4. (a) Interest, etc. under Section 40(4)(a)",
 38:"(b) Dividends, share of profit, etc. under Section 40(4)(b)",
 39:"(1) Where the dividend recipient is entitled to a tax credit, paid from",
 40:"net profit of a business",
 41:"liable to corporate income tax at the following rates:",
 42:"(1.1) 30 percent of net profit",
 43:"(1.2) 25 percent of net profit",
 44:"(1.3) 20 percent of net profit",
 45:"(1.4) Other rate (specify) ............ of net profit",
 46:"(2) Where the recipient is not entitled to a tax credit, paid from",
 47:"(2.1) Net profit of a business exempt from corporate income tax",
 48:"(2.2) Dividends or share of profit that are exempt and need not be included",
 49:"in the computation of income for corporate income tax",
 50:"(2.3) Net profit after deducting net loss carried forward, not exceeding 5 years",
 51:"before the current accounting period",
 52:"(2.4) Profit recognised under the equity method",
 53:"(2.5) Others (specify) ............",
 54:"5. Income subject to withholding tax under Revenue Department instructions issued under Section",
 55:"3 Tredecim, e.g. prizes, discounts or benefits from sales promotion, awards",
 56:"in contests, competitions or lucky draws, public performers' fees, hire-of-work",
 57:"fees, advertising, rent, transport, service fees, insurance premiums, etc.",
 58:"6. Others (specify)",
 60:"Total amount paid and tax withheld and remitted",
 61:"Total tax withheld and remitted (in words)",
 62:"The payee from whom tax is withheld :-",
 63:"Name",
 65:"Address",
 66:"Sequence No. in form (1) P.N.D.1a (2) P.N.D.1a Special (3) P.N.D.2 (4) P.N.D.3",
 67:"(5) P.N.D.2a (6) P.N.D.3a (7) P.N.D.53",
 83:"to allow cross-reference between the sequence no. in the",
 84:"withholding tax certificate and the withholding tax return",
 85:"paid)",
 86:"Taxpayer Identification No.",
 101:"Tax withheld",
 102:"and remitted",
 103:"Payer",
 104:"(1) Withhold at source  (2) Pay on every occasion  (3) Pay once  (4) Others (specify) ......",
 105:"Amounts paid into: Govt Pension/GPF/Private School Teachers' Welfare Fund ...... Baht   Social Security Fund ...... Baht   Provident Fund ...... Baht",
 106:"Warning: A person required to issue a withholding tax certificate",
 107:"who fails to comply with Section 50 Bis of the Revenue",
 108:"Code shall be liable to criminal penalty under Section 35",
 109:"of the Revenue Code",
 110:"I hereby certify that the above particulars and figures are true and correct in every respect.",
 111:"Signed .................................................... Payer",
 113:"(Day / Month / Year the certificate is issued)",
 114:"Affix",
 115:"juristic person",
 116:"seal (if any)",
 117:"Taxpayer Identification No. (13 digits)*",
 118:"Note: Taxpayer Identification No. (13 digits)* means: 1. For a Thai individual, use the citizen ID issued by the Dept. of Provincial Administration",
 119:"2. For a juristic person, use the registration no. issued by the Dept. of Business Development",
 120:"3. In other cases (other than 1 and 2), use the 13-digit Taxpayer ID issued by the Revenue Department",
}

# Plain-text Thai for data-th (textContent fallback after a round-trip toggle),
# captured from the rendered map so the toggle-back is clean text.
TH = {
 0:"ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-",1:"ชื่อ",3:"ที่อยู่",
 18:"เลขประจำตัวผู้เสียภาษีอากร",19:"เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*",
 20:"เล่มที่",21:"เลขที่",22:"หนังสือรับรองการหักภาษี ณ ที่จ่าย",
 23:"ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร",
 24:"ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)",
 25:"ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)",
 26:"(ให้ระบุว่าเป็นบุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)",
 27:"(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)",
 28:"(ให้ระบุว่าเป็นบุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)",
 29:"(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)",
 30:"ประเภทเงินได้พึงประเมินที่จ่าย",31:"วัน เดือน",32:"หรือปีภาษี ที่จ่าย",33:"จำนวนเงินที่จ่าย",
 34:"1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)",
 35:"2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)",
 36:"3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)",
 37:"4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)",
 38:"(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)",
 39:"(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจาก",
 40:"กำไรสุทธิของก",41:"ิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้",
 42:"(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ",43:"(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ",
 44:"(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ",45:"(1.4) อัตราอื่นๆ (ระบุ) ............ ของกำไรสุทธิ",
 46:"(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก",
 47:"(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล",
 48:"(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวม",
 49:"คำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล",
 50:"(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี",
 51:"ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน",
 52:"(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)",
 53:"(2.5) อื่นๆ (ระบุ) ............",
 54:"5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา",
 55:"3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัล",
 56:"ในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้าง",
 57:"ทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ",
 58:"6. อื่นๆ (ระบุ)",
 60:"รวมเงินที่จ่ายและภาษีที่หักนำส่ง",61:"รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)",
 62:"ผู้ถูกหักภาษี ณ ที่จ่าย :-",63:"ชื่อ",65:"ที่อยู่",
 66:"ลำดับที่ ในแบบ (1) ภ.ง.ด.1ก (2) ภ.ง.ด.1ก พิเศษ (3) ภ.ง.ด.2 (4) ภ.ง.ด.3",
 67:"(5) ภ.ง.ด.2ก (6) ภ.ง.ด.3ก (7) ภ.ง.ด.53",
 83:"ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตาม",
 84:"หนังสือรับรองฯ กับแบบยื่นรายการภาษีหัก",85:"ที่จ่าย)",
 86:"เลขประจำตัวผู้เสียภาษีอากร",101:"ภาษีที่หัก",102:"และนำส่งไว้",103:"ผู้จ่ายเงิน",
 104:"(1) หัก ณ ที่จ่าย  (2) ออกให้ตลอดไป  (3) ออกให้ครั้งเดียว  (4) อื่นๆ (ระบุ) ......",
 105:"เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ...... บาท   กองทุนประกันสังคม ...... บาท   กองทุนสำรองเลี้ยงชีพ ...... บาท",
 106:"คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย",
 107:"ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวล",
 108:"รัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35",109:"แห่งประมวลรัษฎากร",
 110:"ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ",
 111:"ลงชื่อ .................................................... ผู้จ่ายเงิน",
 113:"(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)",
 114:"ประทับตรา",115:"นิติบุคคล",116:"(ถ้ามี)",
 117:"เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*",
 118:"หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง",
 119:"2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า",
 120:"3. กรณีอื่นๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร",
}

# Single-document hot-swap: this Thai vector form is the one canonical layout.
# The language button toggles labels in place (Thai <-> official English wording);
# auto-fit shrinks any English label that would overrun its Thai slot width.

# Walk every <div class="t ..."> opening tag in DOM order and add data-th/data-en
# to the indices we translate.
counter = {'i': 0}
def add_attrs(m):
    idx = counter['i']; counter['i'] += 1
    tag = m.group(0)
    if idx in TRANS:
        th = html.escape(TH.get(idx, ''), quote=True)
        en = html.escape(TRANS[idx], quote=True)
        # insert after the class="..." attribute
        tag = re.sub(r'(class="t[^"]*")', r'\1 data-th="%s" data-en="%s"' % (th, en), tag, count=1)
    return tag

src = re.sub(r'<div class="t[^"]*"', add_attrs, src)
tagged = counter['i']

# --- build the input overlay (coords are in the 893x1263 .pf pixel space) ---
# income-table fill rows: dotted-leader y positions -> date / amount / tax cells
ROW_Y = [452,474,495,517,604,626,648,669,713,756,800,843,930,952]
fields = []
def F(id,x,y,w,h,cls='tf',role=None,dtype=None,th='',en='',extra=''):
    a=f'id="f_{id}" name="{id}" class="{cls}"'
    if role: a+=f' data-role="{role}"'
    if dtype: a+=f' data-type="{dtype}"'
    if th: a+=f' data-th="{html.escape(th,True)}" data-en="{html.escape(en,True)}" title="{html.escape(th,True)}"'
    typ='checkbox' if cls=='cb' else 'text'
    if typ=='text': a+=' autocomplete="off"'
    fields.append(f'<input type="{typ}" {a} {extra} style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;">')

# Payer (owner) block
F('book_no',790,73,58,18,role='owner',th='เล่มที่',en='Book No.')
F('run_no',790,95,58,18,role='owner',th='เลขที่',en='No.')
F('tin1',596,123,206,19,'tf mono',role='owner',th='เลขประจำตัวผู้เสียภาษี (ผู้จ่าย)',en='Tax ID (payer)',extra='inputmode="numeric" maxlength="13"')
F('name1',80,155,392,20,role='owner',th='ชื่อผู้จ่าย',en='Payer name')
F('add1',96,184,726,20,role='owner',th='ที่อยู่ผู้จ่าย',en='Payer address')
# Payee block
F('tin2',596,226,206,19,'tf mono',th='เลขประจำตัวผู้เสียภาษี (ผู้ถูกหัก)',en='Tax ID (payee)',extra='inputmode="numeric" maxlength="13"')
F('name2',80,264,392,20,th='ชื่อผู้ถูกหัก',en='Payee name')
F('add2',96,297,726,20,th='ที่อยู่ผู้ถูกหัก',en='Payee address')
F('seq',112,336,44,19,th='ลำดับที่',en='Sequence No.')
# P.N.D. checkboxes (row1 i66 ~y341, row2 i67 ~y369) — approximate x by label
for i,(cid,x,y) in enumerate([('pnd1',171,340),('pnd1x',330,340),('pnd2',470,340),('pnd3',600,340),
                               ('pnd2a',430,367),('pnd3a',548,367),('pnd53',660,367)]):
    F(cid,x,y,14,14,'cb',th=f'ภ.ง.ด. ({i+1})',en=f'P.N.D. ({i+1})')
# Income table rows: date / amount / tax
for n,y in enumerate(ROW_Y):
    F(f'date{n}',495,y-4,95,17,th='วันเดือนปีที่จ่าย',en='Date paid')
    F(f'pay{n}',600,y-4,120,17,'tf money',th='จำนวนเงินที่จ่าย',en='Amount paid',extra='inputmode="decimal"')
    F(f'tax{n}',726,y-4,110,17,'tf money',th='ภาษีที่หัก',en='Tax withheld',extra='inputmode="decimal"')
# Totals
F('pay_total',600,972,120,18,'tf money',th='รวมจำนวนเงิน',en='Total amount',extra='inputmode="decimal"')
F('tax_total',726,972,110,18,'tf money',th='รวมภาษี',en='Total tax',extra='inputmode="decimal"')
F('total_words',272,1002,402,18,th='ภาษีรวม (ตัวอักษร)',en='Total tax (in words)')
# Fund amounts (i105)
F('fund_gpf',430,1030,72,17,'tf money',th='กบข./กสจ. (บาท)',en='Pension fund (Baht)',extra='inputmode="decimal"')
F('fund_sso',628,1030,64,17,'tf money',th='ประกันสังคม (บาท)',en='Social Security (Baht)',extra='inputmode="decimal"')
F('fund_pvd',773,1030,64,17,'tf money',th='สำรองเลี้ยงชีพ (บาท)',en='Provident fund (Baht)',extra='inputmode="decimal"')
# Payer-method checkboxes (i104 ~y1066)
for cid,x in [('m1',152,'(1) หัก ณ ที่จ่าย'),('m2',300,'(2) ออกให้ตลอดไป'),('m3',470,'(3) ออกให้ครั้งเดียว'),('m4',610,'(4) อื่นๆ')][:0]:
    pass
for cid,x,th,en in [('m1',150,'(1) หัก ณ ที่จ่าย','(1) Withhold at source'),
                    ('m2',300,'(2) ออกให้ตลอดไป','(2) Pay continuously'),
                    ('m3',470,'(3) ออกให้ครั้งเดียว','(3) Pay once'),
                    ('m4',610,'(4) อื่นๆ','(4) Others')]:
    F(cid,x,1064,14,14,'cb',role='owner',th=th,en=en)
# Issue date (i112 ~y1138)
F('iss_day',498,1136,40,17,th='วันที่',en='Day')
F('iss_month',545,1136,92,17,th='เดือน',en='Month')
F('iss_year',650,1136,55,17,dtype='be-year',th='ปี (พ.ศ.)',en='Year')

SLOTS = ('<img class="slot" id="slot_signature" data-slot="signature" alt="" '
         'style="left:545px;top:1108px;width:190px;height:26px;display:none;">'
         '<img class="slot" id="slot_stamp" data-slot="stamp" alt="" '
         'style="left:752px;top:1116px;width:72px;height:60px;display:none;">')
OVERLAY = '<div class="page" id="ov">' + ''.join(fields) + SLOTS + '</div>'
# inject overlay as the FIRST child of .pf (z-index:50 paints it above the .pc text layer)
src, n = re.subn(r'(<div id="pf1" class="pf[^>]*>)', r'\1' + OVERLAY, src, count=1)
assert n == 1, f"overlay injection anchor not found (n={n})"

# --- inject edit console + engine assets ---
CONSOLE = '''<div class="toolbar" id="console">
  <strong data-th="50 ทวิ — หนังสือรับรองการหักภาษี ณ ที่จ่าย" data-en="50 Bis — Withholding Tax Certificate">50 ทวิ — หนังสือรับรองการหักภาษี ณ ที่จ่าย</strong>
  <button class="lang" id="langBtn" data-act="lang">EN</button>
  <button class="sec" data-act="toggleFields"><span data-th="แสดง/ซ่อนช่องกรอก" data-en="Show/Hide fields">แสดง/ซ่อนช่องกรอก</span></button>
  <button class="sec" data-act="img" data-slot="signature"><span data-th="ลายเซ็น" data-en="Signature">ลายเซ็น</span></button>
  <button class="sec" data-act="img" data-slot="stamp"><span data-th="ตราประทับ" data-en="Stamp">ตราประทับ</span></button>
  <button class="sec" data-act="clearSubmit"><span data-th="ล้างข้อมูลที่ยื่น" data-en="Clear submission">ล้างข้อมูลที่ยื่น</span></button>
  <button class="sec" data-act="resetAll"><span data-th="ล้างทั้งหมด" data-en="Reset all">ล้างทั้งหมด</span></button>
  <button data-act="print"><span data-th="พิมพ์ / บันทึก PDF" data-en="Print / Save PDF">พิมพ์ / บันทึก PDF</span></button>
  <span class="sp"></span>
  <span id="storeWarn" style="display:none;color:#fbbc04" data-th="บันทึกอัตโนมัติใช้งานไม่ได้" data-en="Autosave unavailable">บันทึกอัตโนมัติใช้งานไม่ได้</span>
</div>
'''

TOOLBAR_CSS = '''<style>
 .toolbar{position:sticky;top:0;z-index:1000;background:#323639;color:#fff;display:flex;gap:10px;align-items:center;padding:8px 14px;font-family:'Sarabun',sans-serif;font-size:14px;flex-wrap:wrap;}
 .toolbar button{background:#1a73e8;color:#fff;border:0;padding:7px 14px;border-radius:6px;cursor:pointer;font:inherit;}
 .toolbar button.sec{background:#5f6368;}
 .toolbar .lang{background:#137333;font-weight:600;color:#fff;text-decoration:none;padding:7px 14px;border-radius:6px;display:inline-block;}
 .toolbar .sp{flex:1;}
 #page-container{position:static !important;}
 #ov{position:absolute;inset:0;z-index:50;}
 #ov input{position:absolute;margin:0;padding:0 2px;border:0;background:transparent;color:#0b3d91;font-family:'Sarabun',sans-serif;font-size:13px;line-height:1;outline:none;box-sizing:border-box;}
 #ov input.mono{font-family:'Courier New',Courier,monospace;letter-spacing:3px;text-align:center;}
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
<script>FormEngine.init({ formId: '50bis', lang: 'th' });
// In-place hot-swap: shrink any English label that overruns its Thai slot width.
(function(){
  var labels=[].slice.call(document.querySelectorAll('.pc [data-th][data-en]'));
  function fit(){
    var en=document.body.classList.contains('lang-en');
    labels.forEach(function(el){
      if(!en && !el.dataset.w0){ el.dataset.w0=el.offsetWidth; el.dataset.fs0=parseFloat(getComputedStyle(el).fontSize); }
      if(!el.dataset.fs0) return;
      var fs0=parseFloat(el.dataset.fs0), w0=parseFloat(el.dataset.w0);
      el.style.whiteSpace='nowrap'; el.style.fontSize=fs0+'px';
      if(en && w0 && el.offsetWidth>w0+0.5){ el.style.fontSize=Math.max(6, fs0*w0/el.offsetWidth)+'px'; }
    });
  }
  new MutationObserver(function(){ requestAnimationFrame(fit); }).observe(document.body,{attributes:true,attributeFilter:['class']});
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(fit,50);});}
  window.addEventListener('load',function(){ setTimeout(fit,300); });
})();
</script>
'''

src = src.replace('</head>', TOOLBAR_CSS + '</head>', 1)
src = src.replace('<body>', '<body>\n' + CONSOLE, 1)
src = src.replace('</body>', SCRIPTS + '</body>', 1)

open('index.html', 'w', encoding='utf-8').write(src)
print(f"tagged {tagged} text nodes; {len(TRANS)} translated")
print("wrote index.html", len(src), "bytes")
