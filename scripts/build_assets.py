"""Turn the raw AI generations into web-ready textures + data.

  python3 scripts/build_assets.py

Outputs (public/assets/):
  bg.webp, mid.webp, table.webp, fg.webp     colour layers (alpha-bled to avoid halos)
  mid_form.webp, table_form.webp             smooth "form" height maps (blurred alpha + luma) that
                                             push the vase/bouquet and the fallen head into 3D
  master.webp                                the full painting (colour probe, particles, poster)
  strokes.webp                               4x4 atlas of real impasto brushstrokes (luma + alpha)
  petals.webp                                8x2 atlas of painted petals
  seedhead.webp                              painted Fibonacci seed disc
  canvas.webp                                tileable primed-linen texture
  palette.json                               33 yellows + accents found in the painting (OKLab k-means)
"""
import cv2, json, numpy as np
from pathlib import Path
from PIL import Image

RAW, AL, OUT = Path('art/raw'), Path('art/aligned'), Path('public/assets')
def pick(p):
    """Prefer the original PNG; fall back to the archived WebP copy that is committed to git."""
    p = Path(p)
    if p.exists():
        return p
    w = p.with_suffix('.webp')
    return w if w.exists() else p
OUT.mkdir(parents=True, exist_ok=True)

def load_rgba(p):
    return np.array(Image.open(p).convert('RGBA'))

def save_webp(arr, name, q=88, size=None, lossless=False):
    im = Image.fromarray(arr)
    if size: im = im.resize(size, Image.LANCZOS)
    im.save(OUT / name, 'WEBP', quality=q, method=6, lossless=lossless, exact=False)
    return (OUT / name).stat().st_size

def bleed(rgba, iters=12):
    """Push-pull colour bleed: give transparent texels the colour of nearby opaque ones."""
    rgb = rgba[..., :3].astype(np.float32); a = (rgba[..., 3:4] > 8).astype(np.float32)
    levels = []; c, w = rgb * a, a.copy()
    for _ in range(iters):
        levels.append((c, w))
        if min(c.shape[:2]) < 4: break
        c = cv2.pyrDown(c); w = cv2.pyrDown(w)[..., None] if cv2.pyrDown(w).ndim == 2 else cv2.pyrDown(w)
    fill = c / np.maximum(w, 1e-4)
    for c, w in reversed(levels):
        up = cv2.resize(fill, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)
        ww = w if w.ndim == 3 else w[..., None]
        fill = np.where(ww > 1e-3, c / np.maximum(ww, 1e-4) * np.minimum(ww * 4, 1) + up * (1 - np.minimum(ww * 4, 1)), up)
    out = rgba.copy()
    m = rgba[..., 3] <= 8
    out[..., :3][m] = np.clip(fill[m], 0, 255).astype(np.uint8)
    return out

def lum(rgb):
    f = rgb.astype(np.float32) / 255.0
    return 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]

def impasto_map(rgba, form_weight=0.0, strength=1.0):
    """Height from multi-scale luminance high-pass (+ optional rounded form from alpha)."""
    L = lum(rgba[..., :3]); a = rgba[..., 3].astype(np.float32) / 255.0
    hf = L - cv2.GaussianBlur(L, (0, 0), 3.0)
    hm = L - cv2.GaussianBlur(L, (0, 0), 12.0)
    form = np.zeros_like(L)
    if form_weight > 0:
        dt = cv2.distanceTransform((a > 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        form = np.sqrt(np.clip(dt / 40.0, 0, 1))
        form = cv2.GaussianBlur(form, (0, 0), 10.0)
    h = (0.9 * hf + 0.55 * hm) * strength + form_weight * form * 0.08
    h *= (a > 0.02)
    gx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
    s = 6.0
    n = np.dstack([-gx * s, gy * s, np.ones_like(h)])  # y flipped for GL (v up)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    out = np.zeros(rgba.shape[:2] + (4,), np.uint8)
    out[..., 0] = np.clip((n[..., 0] * 0.5 + 0.5) * 255, 0, 255)
    out[..., 1] = np.clip((n[..., 1] * 0.5 + 0.5) * 255, 0, 255)
    out[..., 2] = np.clip(form * 255, 0, 255)
    out[..., 3] = 255
    return out[..., :3]

def form_map(rgba):
    """Smooth rounded 'form' height from the alpha silhouette (domes for heads, ridges for stems)."""
    a = (rgba[..., 3] > 127).astype(np.uint8)
    dt = cv2.distanceTransform(a, cv2.DIST_L2, 5)
    f = np.sqrt(np.clip(dt / 48.0, 0, 1))
    f = cv2.GaussianBlur(f, (0, 0), 9.0)
    g = (np.clip(f, 0, 1) * 255).astype(np.uint8)
    return np.dstack([g, g, g])

report = {}
# ---------------------------------------------------------------- layers
master = load_rgba(pick(RAW / '01_master.png'))
report['master'] = save_webp(master[..., :3], 'master.webp', q=86)
bg = load_rgba(pick(RAW / '03_layer_bg.png'))
report['bg'] = save_webp(bg[..., :3], 'bg.webp', q=86)
for key, src, fw, q in [('mid', AL / '04_layer_mid.png', 1.0, 90), ('table', AL / '05_layer_table.png', 1.0, 90)]:
    im = load_rgba(src)
    a = im[..., 3].astype(np.float32)
    a = np.clip((a - 12) * 1.08, 0, 255).astype(np.uint8)   # trim faint fringe
    im[..., 3] = a
    im = bleed(im)
    report[key] = save_webp(im, f'{key}.webp', q=q)
    report[key + '_form'] = save_webp(form_map(im), f'{key}_form.webp', q=85, size=(512, 341))
fg = bleed(load_rgba(AL / '06_layer_fg.png'))
report['fg'] = save_webp(fg, 'fg.webp', q=82, size=(1024, 683))

# ---------------------------------------------------------------- atlases
def components(rgba, min_area=1500):
    a = (rgba[..., 3] > 24).astype(np.uint8)
    a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(a, 8)
    comps = [(stats[i], lab == i) for i in range(1, n) if stats[i][4] >= min_area]
    comps.sort(key=lambda c: (c[0][1] // 200, c[0][0]))
    return comps

def fit_cell(img, cw, ch, pad=6):
    h, w = img.shape[:2]; s = min((cw - 2 * pad) / w, (ch - 2 * pad) / h)
    im = cv2.resize(img, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    cell = np.zeros((ch, cw, 4), np.uint8)
    y0 = (ch - im.shape[0]) // 2; x0 = (cw - im.shape[1]) // 2
    cell[y0:y0 + im.shape[0], x0:x0 + im.shape[1]] = im
    return cell

strokes = load_rgba(pick(RAW / '02_strokes.png'))
cells = []
for st, m in components(strokes):
    x, y, w, h, _ = st
    crop = strokes[y:y + h, x:x + w].copy(); crop[..., 3] = crop[..., 3] * m[y:y + h, x:x + w]
    ys, xs = np.nonzero(crop[..., 3] > 30)
    pts = np.stack([xs, ys], 1).astype(np.float32)
    mean, ev = cv2.PCACompute(pts, mean=None)
    ang = np.degrees(np.arctan2(ev[0, 1], ev[0, 0]))
    big = cv2.copyMakeBorder(crop, h, h, w, w, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0))
    R = cv2.getRotationMatrix2D((big.shape[1] / 2, big.shape[0] / 2), ang, 1.0)
    rot = cv2.warpAffine(big, R, (big.shape[1], big.shape[0]), flags=cv2.INTER_CUBIC)
    ys, xs = np.nonzero(rot[..., 3] > 20)
    rot = rot[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    g = (lum(rot[..., :3]) * 255).astype(np.uint8)
    g = cv2.normalize(g, None, 40, 255, cv2.NORM_MINMAX, mask=(rot[..., 3] > 30).astype(np.uint8))
    cells.append(fit_cell(np.dstack([g, g, g, rot[..., 3]]), 256, 128))
n_strokes = len(cells)
while len(cells) < 16: cells.append(cells[len(cells) % n_strokes])
atlas = np.vstack([np.hstack(cells[r * 4:(r + 1) * 4]) for r in range(4)])
report['strokes'] = save_webp(bleed(atlas), 'strokes.webp', q=90)

petals = load_rgba(pick(RAW / '08_petals.png'))
pc = []
for st, m in components(petals):
    x, y, w, h, _ = st
    crop = petals[y:y + h, x:x + w].copy(); crop[..., 3] = crop[..., 3] * m[y:y + h, x:x + w]
    pc.append(fit_cell(crop, 128, 256, pad=4))
n_petals = len(pc)
while len(pc) < 16: pc.append(pc[len(pc) % n_petals])
patlas = np.vstack([np.hstack(pc[r * 8:(r + 1) * 8]) for r in range(2)])
report['petals'] = save_webp(bleed(patlas), 'petals.webp', q=90)

seed = load_rgba(pick(RAW / '09_seedhead.png'))
ys, xs = np.nonzero(seed[..., 3] > 40)
seed = seed[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
report['seedhead'] = save_webp(bleed(seed), 'seedhead.webp', q=84, size=(768, 768))

# tileable canvas: blend with half-offset copy through a cross-shaped seam mask
cv_ = np.array(Image.open(pick(RAW / '10_canvas.png')).convert('L').resize((1024, 1024), Image.LANCZOS)).astype(np.float32)
cv_ = cv_ - cv2.GaussianBlur(cv_, (0, 0), 40) + cv_.mean()
sh = np.roll(np.roll(cv_, 512, 0), 512, 1)
yy, xx = np.mgrid[0:1024, 0:1024] / 1023.0
w_ = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy)) * 2
w_ = np.clip(w_ * 4, 0, 1)
tile = cv_ * w_ + sh * (1 - w_)
tile = cv2.normalize(tile, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
report['canvas'] = save_webp(np.dstack([tile] * 3), 'canvas.webp', q=80, size=(512, 512))

# ---------------------------------------------------------------- palette (OKLab k-means)
def srgb_to_oklab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    l = 0.4122214708 * c[..., 0] + 0.5363325363 * c[..., 1] + 0.0514459929 * c[..., 2]
    m = 0.2119034982 * c[..., 0] + 0.6806995451 * c[..., 1] + 0.1073969566 * c[..., 2]
    s = 0.0883024619 * c[..., 0] + 0.2817188376 * c[..., 1] + 0.6299787005 * c[..., 2]
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack([0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
                     1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
                     0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s], -1)

small = cv2.resize(master[..., :3], (768, 512), interpolation=cv2.INTER_AREA).reshape(-1, 3)
lab = srgb_to_oklab(small)
C = np.hypot(lab[:, 1], lab[:, 2]); hdeg = (np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) + 360) % 360
yellow = (hdeg >= 52) & (hdeg <= 118) & (C > 0.045) & (lab[:, 0] > 0.42)
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 80, 1e-4)
cv2.setRNGSeed(1888)
def km(data, k):
    w = data.astype(np.float32) * np.array([1.6, 1.0, 1.0], np.float32)   # emphasise lightness steps
    _, lbl, cen = cv2.kmeans(w, k, None, crit, 6, cv2.KMEANS_PP_CENTERS)
    return lbl.ravel(), cen / np.array([1.6, 1.0, 1.0], np.float32)
ly, cy = km(lab[yellow], 33)
la, ca = km(lab[~yellow], 7)

def oklab_to_srgb(L, a, b):
    l_ = L + 0.3963377774 * a + 0.2158037573 * b; m_ = L - 0.1055613458 * a - 0.0638541728 * b; s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076372229 * s
    f = lambda x: 255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)
    return [int(np.clip(round(f(max(v, 0))), 0, 255)) for v in (r, g, bb)]

def family(L, Cc, h):
    """Approximate pigment family for a yellow cluster (OKLCh: L 0..1, C chroma, h hue°)."""
    if h >= 92:
        if L >= 0.84: return ('柠檬黄', 'Lemon Yellow') if Cc >= 0.135 else ('那不勒斯黄', 'Naples Yellow')
        if L >= 0.76: return ('浅铬黄', 'Chrome Yellow Light')
        if L >= 0.60: return ('土黄', 'Earth Yellow')
        return ('橄榄黄', 'Olive Yellow')
    if h >= 82: return ('铬黄', 'Chrome Yellow')
    if h >= 70: return ('深铬黄', 'Chrome Yellow Deep') if L >= 0.68 else ('赭黄', 'Yellow Ochre')
    if L >= 0.68: return ('铬橙', 'Chrome Orange')
    return ('生赭', 'Raw Sienna') if L >= 0.55 else ('熟赭', 'Burnt Sienna')

def accent(L, Cc, h):
    if 200 <= h < 290: return ('普鲁士蓝', 'Prussian Blue')
    if 120 <= h < 200: return ('维罗纳绿', 'Veronese Green')
    if 100 <= h < 120: return ('橄榄绿', 'Olive Green')
    if L < 0.3: return ('焦褐', 'Burnt Umber')
    if h < 56 and L > 0.55: return ('赭红', 'Terracotta')
    if h < 56: return ('熟赭', 'Burnt Sienna')
    return ('生褐', 'Raw Umber') if L < 0.42 else ('褐', 'Umber')

def entries(lbl, cen, total, namer, kind):
    out = []
    for i, (L, a, b) in enumerate(cen):
        Cc = float(np.hypot(a, b)); h = float((np.degrees(np.arctan2(b, a)) + 360) % 360)
        zh, en = namer(L, Cc, h)
        out.append(dict(kind=kind, L=round(float(L), 4), C=round(Cc, 4), h=round(h, 2), share=round(float((lbl == i).sum()) / total, 5),
                        hex='#%02x%02x%02x' % tuple(oklab_to_srgb(float(L), float(a), float(b))), zh=zh, en=en))
    return out
total = len(lab)
ys_ = sorted(entries(ly, cy, total, family, 'yellow'), key=lambda e: -e['L'])
counts = {}
for e in ys_:
    counts[e['zh']] = counts.get(e['zh'], 0) + 1; e['n'] = counts[e['zh']]
acc = entries(la, ca, total, accent, 'accent')
blue = (hdeg >= 200) & (hdeg <= 290) & (C > 0.05)
if blue.sum() > 50:
    bl = lab[blue].mean(0); Cb = float(np.hypot(bl[1], bl[2])); hb = float((np.degrees(np.arctan2(bl[2], bl[1])) + 360) % 360)
    acc.append(dict(kind='accent', L=round(float(bl[0]), 4), C=round(Cb, 4), h=round(hb, 2), share=round(float(blue.mean()), 5),
                    hex='#%02x%02x%02x' % tuple(oklab_to_srgb(*[float(v) for v in bl])), zh='普鲁士蓝', en='Prussian Blue'))
acc = sorted(acc, key=lambda e: -e['L'])
for i, e in enumerate(ys_): e['id'] = f'Y{i + 1:02d}'
for i, e in enumerate(acc): e['id'] = f'A{i + 1:02d}'
pal = dict(source='public/assets/master.webp', method='OKLab k-means (OpenCV), yellow mask 52°–118° hue, C>0.045, L>0.42',
           yellow_share=round(float(yellow.mean()), 4), yellows=ys_, accents=acc)
json.dump(pal, open(OUT / 'palette.json', 'w'), ensure_ascii=False, indent=1)
report['palette'] = f"{len(ys_)} yellows ({pal['yellow_share']*100:.1f}% of pixels), {len(acc)} accents"
fam = {}
for e in ys_: fam[e['zh']] = fam.get(e['zh'], 0) + 1
report['families'] = fam
report['n_strokes'] = n_strokes; report['n_petals'] = n_petals
print(json.dumps(report, ensure_ascii=False, indent=0))
