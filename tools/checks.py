# Course checks: English/Spanish match and photo coverage.
# usage: python3 -I checks.py <unzipped package dir> <target slides, e.g. "1.10,1.12,..."> [<template csv>]
import sys, json, re, collections, csv, os, math
PKG=sys.argv[1]; TARGETS=[tuple(map(int,s.split('.'))) for s in sys.argv[2].split(',')]; TPL=sys.argv[3] if len(sys.argv)>3 else None
ESC={'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','v':'\v','0':'\0'}
def unjs(s): return re.sub(r"\\(?:(u)([0-9a-fA-F]{4})|(x)([0-9a-fA-F]{2})|(.))", lambda m: chr(int(m.group(2),16)) if m.group(1) else chr(int(m.group(4),16)) if m.group(3) else ESC.get(m.group(5),m.group(5)), s, flags=re.S)
def load(p):
    s=open(p,encoding='utf-8-sig').read(); m=re.search(r"globalProvideData\('(\w+)',\s*'(.*)'\);?\s*$", s, re.S); return json.loads(unjs(m.group(2)))
def walk(n):
    if isinstance(n,dict):
        yield n
        for v in n.values(): yield from walk(v)
    elif isinstance(n,list):
        for v in n: yield from walk(v)
d=load(f'{PKG}/html5/data/js/data.js'); assets={a['id']:a for a in d['assetLib']}
slides={}
for sc in d['scenes']:
    if sc.get('isMessageScene'): continue
    for s in sc['slides']: slides[(sc['sceneNumber'],s['slideNumberInScene'])]=(s,load(f"{PKG}/{s['html5url']}"))
# every photo reference on a slide, from every place Storyline puts one
def photo_refs(sd):
    refs=[]
    for n in walk(sd):
        for im in n.get('imagelib',[]) or []: refs.append(('picture',im['assetId'],im.get('altText','')))
        dat=n.get('data') if isinstance(n.get('data'),dict) else {}
        idt=dat.get('imagedata') if isinstance(dat.get('imagedata'),dict) else None
        if idt and idt.get('assetId') is not None:
            h5=dat.get('html5data') or {}
            kind='flattened shape' if str(h5.get('url','')).startswith('Shape') else 'image'
            refs.append((kind,idt['assetId'],idt.get('altText','')))
        z=n.get('zoomdata')
        if isinstance(z,dict) and isinstance(z.get('imagedata'),dict) and z['imagedata'].get('assetId') is not None:
            refs.append(('zoom source',z['imagedata']['assetId'],(n.get('data') or {}).get('imagedata',{}).get('altText','')))
    return refs
use=collections.Counter()
for k,(s,sd) in slides.items():
    for a in {r[1] for r in photo_refs(sd)}: use[a]+=1
def is_photo(aid):
    a=assets[aid]; u=a['url'].lower()
    return u.endswith(('.png','.jpg','.jpeg')) and use[aid]<=6 and min(a['width'],a['height'])>=100
def hotspots(sd, box=None):
    out=[]
    for n in walk(sd):
        dat=n.get('data') if isinstance(n.get('data'),dict) else {}
        vd=dat.get('vectorData') if isinstance(dat.get('vectorData'),dict) else None
        if vd and 'hotspot' in str(vd.get('altText','')).lower() and 'xPos' in n: out.append((vd['altText'].rstrip(' 0123456789'),n['xPos'],n['yPos'],n['width'],n['height']))
    return sorted(out)
problems=[]
# ---- 1. English/Spanish pairing: scenes with the same slide count and matching photo files
by_scene=collections.defaultdict(dict)
for (a,b),v in slides.items(): by_scene[a][b]=v
target_scenes=sorted({a for a,b in TARGETS})
pairs=[]
for a in target_scenes:
    for c in sorted(by_scene):
        if c<=a or len(by_scene[c])!=len(by_scene[a]): continue
        pairs.append((a,c))
print('== English/Spanish pairs found:', ', '.join(f'scene {a} and scene {c}' for a,c in pairs) or 'none')
FLAT_RE=re.compile(r'(^|/)(_default_\w+_)?Shape\w+\.png$')
def is_flat(aid): return bool(FLAT_RE.search(assets[aid]['url']))
def photos_on(sd):
    out=set()
    for kind,aid,alt in photo_refs(sd):
        if not is_photo(aid): continue
        out.add(('flattened: '+alt, 0, 0) if is_flat(aid) else (assets[aid]['url'],assets[aid]['width'],assets[aid]['height']))
    return sorted(x for x in out if x[0]!='flattened: ')
for a,c in pairs:
    for n in sorted(by_scene[a]):
        if (a,n) not in TARGETS and (c,n) not in TARGETS: continue
        sa,sda=by_scene[a][n]; sc_,sdc=by_scene[c][n]
        pa,pc=photos_on(sda),photos_on(sdc)
        if pa!=pc:
            problems.append(f"{a}.{n} and {c}.{n} use different photos: only on {a}.{n}: {[os.path.basename(x[0])+f' {x[1]}x{x[2]}' for x in pa if x not in pc]}; only on {c}.{n}: {[os.path.basename(x[0])+f' {x[1]}x{x[2]}' for x in pc if x not in pa]}")
        W=sa.get('width',1024); Hh=sa.get('height',768)
        onslide=lambda hs:[h for h in hs if h[1]+h[3]>0 and h[1]<W and h[2]+h[4]>0 and h[2]<Hh]
        ha,hc=onslide(hotspots(sda)),onslide(hotspots(sdc))
        # pair by type and size, then nearest position
        def pairup(xa,xc):
            xc=list(xc); out=[]
            for h in xa:
                cand=[k for k in xc if k[0]==h[0] and abs(k[3]-h[3])<=4 and abs(k[4]-h[4])<=4]
                if not cand: out.append((h,None)); continue
                k=min(cand,key=lambda k:math.dist(h[1:3],k[1:3])); xc.remove(k); out.append((h,k))
            return out, xc
        pr,left=pairup(ha,hc)
        ha=[x for x,_ in pr]; hc=[y for _,y in pr]+left
        if ha!=hc and len(ha)==len(hc) and all(y and x[0]==y[0] and x[3:]==y[3:] and abs(x[1]-y[1])<=8 and abs(x[2]-y[2])<=8 for x,y in zip(ha,hc)):
            problems.append(f"MINOR: {a}.{n} and {c}.{n} hotspots are within 8 px of each other ({', '.join(f'{x[0]} {x[1]-y[1]:+d},{x[2]-y[2]:+d}' for x,y in zip(ha,hc) if x!=y)})")
        elif ha!=hc:
            diffs=[]
            for h1,h2 in zip(ha,hc):
                if h2 is None: diffs.append(f"{h1[0]} {h1[3]}x{h1[4]} at {h1[1]},{h1[2]} has no match on {c}.{n}")
                elif h1!=h2: diffs.append(f"{h1[0]} {h1[3]}x{h1[4]} at {h1[1]},{h1[2]} vs {h2[1]},{h2[2]}" + (f" (size {h2[3]}x{h2[4]})" if h1[3:]!=h2[3:] else ""))
            for h2 in hc[len(ha):]: diffs.append(f"{h2[0]} {h2[3]}x{h2[4]} at {h2[1]},{h2[2]} on {c}.{n} has no match on {a}.{n}")
            if not ha and hc: diffs.append(f"0 hotspots vs {len(hc)}")
            problems.append(f"{a}.{n} and {c}.{n} hotspots differ: "+'; '.join(diffs))
        if (a,n) in TARGETS and (c,n) not in TARGETS: problems.append(f"{a}.{n} is a target slide but its twin {c}.{n} isn't on the list")
# ---- 2. Coverage: every photo on target slides must be in the template
on_targets={}
for k in TARGETS:
    s,sd=slides[k]
    for kind,aid,alt in photo_refs(sd):
        if is_photo(aid): on_targets.setdefault(aid,{'kinds':set(),'slides':set(),'alt':set()}); on_targets[aid]['kinds'].add(kind); on_targets[aid]['slides'].add(f'{k[0]}.{k[1]}'); alt and on_targets[aid]['alt'].add(alt)
print(f"== Photos on the target slides: {len(on_targets)} files")
if TPL:
    rows=list(csv.DictReader(open(TPL,encoding='utf-8-sig')))
    have={(r['storyline_name'],re.findall(r'\d+\.\d+',r['slides'])[0]) for r in rows}
    names_in_tpl={r['storyline_name'] for r in rows}
    for aid,info in sorted(on_targets.items(), key=lambda x: sorted(x[1]['slides'])):
        a=assets[aid]
        if is_flat(aid): continue  # rendered copy of a flattened picture; its source photo is checked via the zoom image
        if not (info['alt'] & names_in_tpl):
            problems.append(f"Not in template: {os.path.basename(a['url'])} {a['width']}x{a['height']} on {', '.join(sorted(info['slides']))} (Storyline name: {', '.join(info['alt']) or 'none'}; found as {', '.join(sorted(info['kinds']))})")
print()
print('PROBLEMS:' if problems else 'ALL CHECKS PASSED')
for p in problems: print(' -', p)
