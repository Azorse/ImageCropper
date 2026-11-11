# Build a course photo template (CSV + photo guide) from a published Storyline course.
# usage: python3 -I build_template.py <config.json>
# config: {"pkg": dir, "prefix": "PEC", "title": "...", "targets": ["1.10", ...],
#          "codes": [[storyline_name, first_slide, code], ...], "out_csv": path, "out_guide": path}
import sys, json, re, os, csv, collections
from PIL import Image, ImageDraw, ImageFont

cfg = json.load(open(sys.argv[1]))
PKG = cfg['pkg']
TARGETS = [tuple(map(int, s.split('.'))) for s in cfg['targets']]
CODES = {(n, s): c for n, s, c in cfg['codes']}
# hidden references to a picture's original image (left behind by Change Picture); never shown
IGNORE = {(n, s) for n, s in cfg.get('ignore', [])}

ESC = {'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f', 'v': '\v', '0': '\0'}
def unjs(s):
    return re.sub(r"\\(?:(u)([0-9a-fA-F]{4})|(x)([0-9a-fA-F]{2})|(.))",
                  lambda m: chr(int(m.group(2), 16)) if m.group(1) else chr(int(m.group(4), 16)) if m.group(3) else ESC.get(m.group(5), m.group(5)), s, flags=re.S)
def load(p):
    s = open(p, encoding='utf-8-sig').read()
    m = re.search(r"globalProvideData\('(\w+)',\s*'(.*)'\);?\s*$", s, re.S)
    return json.loads(unjs(m.group(2)))
def walk(n):
    if isinstance(n, dict):
        yield n
        for v in n.values(): yield from walk(v)
    elif isinstance(n, list):
        for v in n: yield from walk(v)

d = load(f'{PKG}/html5/data/js/data.js')
assets = {a['id']: a for a in d['assetLib']}
slides = {}
for sc in d['scenes']:
    if sc.get('isMessageScene'): continue
    for s in sc['slides']:
        slides[(sc['sceneNumber'], s['slideNumberInScene'])] = (s, load(f"{PKG}/{s['html5url']}"))

FLAT_RE = re.compile(r'(^|/)(_default_\w+_)?Shape\w+\.png$')
def file_of(aid):
    """The image file actually in the package (Storyline lists story_content/ but ships mobile/)."""
    u = assets[aid]['url']
    for cand in (u, u.replace('story_content/', 'mobile/')):
        if os.path.exists(f'{PKG}/{cand}'): return cand
    return None
_size = {}
def real_size(aid):
    """Pixel size of the real file. The course data's own size is often lower than the file."""
    if aid not in _size:
        f = file_of(aid)
        _size[aid] = Image.open(f'{PKG}/{f}').size if f else (assets[aid]['width'], assets[aid]['height'])
    return _size[aid]

# how many slides use each asset, to tell photos from logos and buttons
use = collections.Counter()
for k, (s, sd) in slides.items():
    ids = set()
    for n in walk(sd):
        for im in n.get('imagelib', []) or []: ids.add(im['assetId'])
    for i in ids: use[i] += 1
def is_photo(aid):
    a = assets[aid]
    return a['url'].lower().endswith(('.png', '.jpg', '.jpeg')) and use[aid] <= 6 and min(a['width'], a['height']) >= 100

def positioned(node, ox=0, oy=0):
    """Every object with its absolute position on the slide (children of buttons are relative)."""
    if isinstance(node, dict):
        if 'xPos' in node:
            x, y = ox + node.get('xPos', 0), oy + node.get('yPos', 0)
            yield node, x, y
            for ch in node.get('objects', []) or []: yield from positioned(ch, x, y)
        else:
            for v in node.values():
                if isinstance(v, (dict, list)): yield from positioned(v, ox, oy)
    elif isinstance(node, list):
        for v in node: yield from positioned(v, ox, oy)

def hotspot_shapes(sd):
    """Every oval and rectangle hotspot on the slide, as (shape, x, y, w, h)."""
    out = []
    for o, x, y in positioned(sd.get('slideLayers', [])):
        dat = o.get('data') if isinstance(o.get('data'), dict) else {}
        vd = dat.get('vectorData') if isinstance(dat.get('vectorData'), dict) else None
        alt = str((vd or {}).get('altText', ''))
        if alt.startswith('Oval Hotspot'): out.append(('o', x, y, o['width'], o['height']))
        elif alt.startswith('Rectangular Hotspot'): out.append(('r', x, y, o['width'], o['height']))
    return out

rows = {}
missing_codes = []
for key in TARGETS:
    s, sd = slides[key]
    lab = f'{key[0]}.{key[1]}'
    hs = hotspot_shapes(sd)
    for o, x, y in positioned(sd.get('slideLayers', [])):
        for im in o.get('imagelib', []) or []:
            aid = im['assetId']
            if not is_photo(aid): continue
            if (im.get('altText', ''), lab) in IGNORE: continue
            r = rows.setdefault(('a', aid), {'slides': [], 'aid': aid, 'alt': im.get('altText', ''), 'hs': {}, 'flat': False})
            if lab not in r['slides']: r['slides'].append(lab)
            W, H = o['width'], o['height']
            for shape, hx, hy, hw, hh in hs:
                cx, cy = hx + hw / 2, hy + hh / 2
                if not (x <= cx <= x + W and y <= cy <= y + H): continue
                # a rectangle covering most of the photo just makes the whole photo clickable; not a body target
                if shape == 'r' and hw * hh >= 0.5 * W * H: continue
                r['hs'].setdefault(lab, []).append((shape,) + tuple(round(v, 4) for v in ((hx - x) / W, (hy - y) / H, hw / W, hh / H)))
        # pictures Storyline flattened into Shape*.png (effects baked in); the original photo is in zoomdata
        dat = o.get('data') if isinstance(o.get('data'), dict) else {}
        h5 = dat.get('html5data') or {}
        if o.get('kind') == 'image' and str(h5.get('url', '')).startswith('Shape'):
            alt = dat.get('imagedata', {}).get('altText', '')
            r = rows.setdefault(('flat', alt), {'slides': [], 'aid': None, 'alt': alt, 'hs': {}, 'flat': True})
            if lab not in r['slides']: r['slides'].append(lab)
        z = o.get('zoomdata')
        if isinstance(z, dict) and isinstance(z.get('imagedata'), dict) and z['imagedata'].get('assetId') is not None:
            alt = dat.get('imagedata', {}).get('altText', '')
            if ('flat', alt) in rows: rows[('flat', alt)]['aid'] = z['imagedata']['assetId']
        elif o.get('kind') == 'image' and ('flat', dat.get('imagedata', {}).get('altText', '')) in rows:
            pass

out = []
for r in rows.values():
    if r['aid'] is None:
        print('WARNING: no original photo found for flattened image', r['alt'], r['slides']); continue
    sets = {tuple(sorted(v)) for v in r['hs'].values()}
    if len(sets) > 1: print('WARNING: hotspots differ between slides for', r['alt'], list(r['hs']))
    # oval: "x,y,w,h"   rectangle: "r:x,y,w,h"  (fractions of the image)
    r['hsstr'] = ';'.join(('r:' if f[0] == 'r' else '') + ','.join(map(str, f[1:])) for f in (next(iter(sets)) if sets else []))
    r['code'] = CODES.get((os.path.basename(assets[r['aid']]['url']), r['slides'][0])) or CODES.get((r['alt'], r['slides'][0]))
    if not r['code']: missing_codes.append((r['alt'], os.path.basename(assets[r['aid']]['url']), r['slides'][0])); continue
    r['file'] = file_of(r['aid'])
    r['w'], r['h'] = real_size(r['aid'])
    r['fmt'] = 'png' if r['file'].lower().endswith('.png') else 'jpg'
    r['manual'] = 'yes: hotspots' if r['hsstr'] else ''
    out.append(r)
if missing_codes:
    print('ERROR: no code given for:'); [print('  ', m) for m in missing_codes]; sys.exit(1)

def ck(r):
    sc, sl = map(int, r['slides'][0].split('.'))
    c, n = r['code'].split('-')
    m = re.match(r'(\d+)(\w*)', n)
    return (sc, sl, int(m.group(1)), {'S': 0, 'B': 1}.get(m.group(2), 0))
out.sort(key=ck)
flatcodes = {r['code'][:-1] for r in out if r['flat']}
for r in out:
    if r['code'][:-1] in flatcodes and r['code'][-1] in 'SB' and not r['manual']:
        r['manual'] = 'yes: flattened button image'

with open(cfg['out_csv'], 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['code', 'slides', 'your_photo', 'width', 'height', 'format', 'manual_in_storyline', 'storyline_name', 'hotspot_guide'])
    for r in out:
        w.writerow([r['code'], ('Slides ' if len(r['slides']) > 1 else 'Slide ') + ', '.join(r['slides']), '',
                    r['w'], r['h'], r['fmt'], r['manual'], r['alt'], r['hsstr']])

# photo guide
F = lambda s, b=False: ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if b else ''}.ttf", s)
TW, TH, cols = 230, 250, 6; HEAD = 70; SEC = 40; CELL = TH + 50
quiz_scene = max(a for a, b in TARGETS)
sections = [("Knowledge checks", [r for r in out if not r['slides'][0].startswith(f'{quiz_scene}.')]),
            ("Final quiz", [r for r in out if r['slides'][0].startswith(f'{quiz_scene}.')])]
sections = [s for s in sections if s[1]]
height = HEAD + sum(SEC + ((len(rs) + cols - 1) // cols) * CELL for _, rs in sections)
sheet = Image.new('RGB', (cols * TW, height), (245, 247, 248)); dr = ImageDraw.Draw(sheet)
dr.rectangle([0, 0, cols * TW, HEAD - 14], fill=(5, 102, 58))
dr.text((16, 12), f"{cfg['title']}: photo guide", fill='white', font=F(22, True))
dr.text((16, 38), "Red outlines = hotspots. MANUAL = Dan places this photo in Storyline. Everything else swaps automatically.", fill=(234, 246, 239), font=F(12))
y0 = HEAD
for title, rs in sections:
    dr.text((10, y0 + 8), title.upper(), fill=(91, 103, 112), font=F(14, True))
    dr.line([10, y0 + 30, cols * TW - 10, y0 + 30], fill=(217, 224, 228), width=2)
    y0 += SEC
    for i, r in enumerate(rs):
        pic = Image.open(f"{PKG}/{r['file']}").convert('RGB'); pic.thumbnail((TW - 16, TH - 10))
        x = (i % cols) * TW; y = y0 + (i // cols) * CELL
        px = x + (TW - pic.width) // 2; py = y + (TH - 10 - pic.height) // 2; sheet.paste(pic, (px, py))
        for f in filter(None, r['hsstr'].split(';')):
            rect = f.startswith('r:')
            a, b, c, e = map(float, f[2:].split(',') if rect else f.split(','))
            box = [px + a * pic.width, py + b * pic.height, px + (a + c) * pic.width, py + (b + e) * pic.height]
            (dr.rectangle if rect else dr.ellipse)(box, outline=(230, 30, 30), width=2)
        dr.text((x + 8, y + TH - 4), r['code'], fill=(5, 102, 58), font=F(17, True))
        dr.text((x + 8, y + TH + 18), f"Slides {', '.join(r['slides'])}", fill=(31, 42, 51), font=F(12))
        dr.text((x + 8, y + TH + 33), f"{r['w']} × {r['h']} {r['fmt'].upper()}" + ("   MANUAL" if r['manual'] else ""),
                fill=(196, 90, 0) if r['manual'] else (91, 103, 112), font=F(11, bool(r['manual'])))
    y0 += ((len(rs) + cols - 1) // cols) * CELL
sheet.save(cfg['out_guide'])
print(f"{len(out)} rows written")
for r in out: print(f"  {r['code']:<10} {' '.join(r['slides']):<12} {r['w']}x{r['h']} {r['fmt']:<4} {r['manual']:<28} {r['alt']}")
