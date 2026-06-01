#!/usr/bin/env python3
"""Clean the raw pdf2htmlEX English form (frm_WTC.html) -> en_clean.html:
strip viewer JS + chrome, externalize fonts/images, move CSS to style.css.
Idempotent: always reads the raw frm_WTC.html. build_en.py then wires the app
layer (console + engine + inputs) from en_clean.html into en.html."""
import re, base64, os
s = open('frm_WTC.html', encoding='utf-8').read()
os.makedirs('fonts', exist_ok=True); os.makedirs('assets', exist_ok=True)

s = re.sub(r'\s*<script src="(compatibility|pdf2htmlEX)\.min\.js"></script>', '', s)
s = re.sub(r'\s*<script>\s*try\{.*?\}catch\(e\)\{\}\s*</script>', '', s, flags=re.S)
s = re.sub(r'\s*<div id="sidebar">\s*<div id="outline">\s*</div>\s*</div>', '', s)
s = re.sub(r'\s*<div class="loading-indicator">.*?</div>', '', s, flags=re.S)

def fontsub(m):
    name, b64 = m.group('name'), m.group('b64')
    open(f'fonts/{name}.woff', 'wb').write(base64.b64decode(b64))
    return m.group(0).replace(f"data:application/font-woff;base64,{b64}", f"fonts/{name}.woff")
s = re.sub(r"@font-face\{font-family:(?P<name>\w+);src:url\('data:application/font-woff;base64,(?P<b64>[A-Za-z0-9+/=]+)'\)", fontsub, s)

idx = [0]
def imgsub(m):
    pre, mime, b64, post = m.group(1), m.group(2), m.group(3), m.group(4)
    ext = {'image/png':'png','image/svg+xml':'svg','image/jpeg':'jpg'}.get(mime,'bin')
    fn = f'assets/img{idx[0]}.{ext}'; idx[0]+=1
    open(fn, 'wb').write(base64.b64decode(b64))
    return pre + fn + post
s = re.sub(r'(<img[^>]*src=")data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)(")', imgsub, s)
s = re.sub(r'(url\()data:(image/[a-z+]+);base64,([A-Za-z0-9+/=]+)(\))',
           lambda m: m.group(0) if len(m.group(3)) < 1200 else imgsub(m), s)

styles = re.findall(r'<style type="text/css">(.*?)</style>', s, flags=re.S)
open('style.css', 'w', encoding='utf-8').write('\n'.join(styles))
s = re.sub(r'<style type="text/css">.*?</style>\s*', '', s, flags=re.S)
s = s.replace('</head>', '<link rel="stylesheet" href="style.css"/>\n</head>', 1)
s = s.replace('<title></title>', '<title>50 Bis — Withholding Tax Certificate</title>')

open('en_clean.html', 'w', encoding='utf-8').write(s)
print("en_clean.html", len(s), "bytes; data URIs left:", len(re.findall(r'data:[a-z]+/[a-z0-9.+-]+;base64', s)))
