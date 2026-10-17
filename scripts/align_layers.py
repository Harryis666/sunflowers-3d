"""Align AI-extracted layers back onto the master painting.

The image model re-frames each extraction slightly (scale / offset), so every
transparent layer is registered to the master with SIFT features + RANSAC
(similarity transform: rotation, uniform scale, translation), restricted to the
layer's opaque pixels. Results go to art/aligned/ and a JSON report.
"""
import cv2, json, numpy as np
from pathlib import Path

RAW = Path('art/raw'); OUT = Path('art/aligned'); OUT.mkdir(parents=True, exist_ok=True)
def pick(p):
    """Prefer the original PNG; fall back to the archived WebP copy that is committed to git."""
    p = Path(p)
    if p.exists():
        return p
    w = p.with_suffix('.webp')
    return w if w.exists() else p
master = cv2.imread(str(pick(RAW / '01_master.png')), cv2.IMREAD_COLOR)
H, W = master.shape[:2]
sift = cv2.SIFT_create(nfeatures=12000, contrastThreshold=0.02)
gm = cv2.cvtColor(master, cv2.COLOR_BGR2GRAY)
k2, d2 = sift.detectAndCompute(gm, None)

def align(name, use_alpha=True, ratio=0.72):
    img = cv2.imread(str(pick(RAW / f'{name}.png')), cv2.IMREAD_UNCHANGED)
    if img.shape[2] == 3:
        img = np.dstack([img, np.full(img.shape[:2], 255, np.uint8)])
    if img.shape[:2] != (H, W):
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    alpha = img[..., 3]
    g = cv2.cvtColor(img[..., :3], cv2.COLOR_BGR2GRAY)
    mask_l = (cv2.erode((alpha > 200).astype(np.uint8), np.ones((9, 9), np.uint8)) * 255) if use_alpha else None
    k1, d1 = sift.detectAndCompute(g, mask_l)
    matches = cv2.BFMatcher(cv2.NORM_L2).knnMatch(d1, d2, k=2)
    good = [m for m, n in matches if m.distance < ratio * n.distance]
    src = np.float32([k1[m.queryIdx].pt for m in good]); dst = np.float32([k2[m.trainIdx].pt for m in good])
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0, maxIters=20000, confidence=0.999)
    n_in = int(inl.sum()) if inl is not None else 0
    s = float(np.sqrt(abs(np.linalg.det(M[:, :2]))))
    warped = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    cv2.imwrite(str(OUT / f'{name}.png'), warped)
    rep = dict(name=name, good=len(good), inliers=n_in, scale=s, tx=float(M[0, 2]), ty=float(M[1, 2]),
               rot_deg=float(np.degrees(np.arctan2(M[1, 0], M[0, 0]))), M=M.tolist())
    print(json.dumps({k: (round(v, 4) if isinstance(v, float) else v) for k, v in rep.items() if k != 'M'}))
    return rep

report = {}
for name in ['04_layer_mid', '05_layer_table', '06_layer_fg']:
    report[name] = align(name)
for name in ['03_layer_bg', '07_depth']:
    try:
        report[name] = align(name, use_alpha=False, ratio=0.7)
    except Exception as e:
        print(name, 'failed', e)
json.dump(report, open(OUT / 'alignment.json', 'w'), indent=2)
