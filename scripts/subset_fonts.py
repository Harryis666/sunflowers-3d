#!/usr/bin/env python3
"""Subset the site's web fonts to the glyphs it actually uses.

Inputs (downloaded automatically from google/fonts if missing, all SIL OFL):
  Ma Shan Zheng (brush calligraphy), Noto Serif SC (variable wght), Fraunces + Italic (variable).
Outputs -> src/assets/fonts/*.woff2

  * Noto Serif SC: every CJK character found in src/**/*.ts(x) + index.html, plus ASCII & CJK punctuation
  * Ma Shan Zheng: only characters inside the /* calligraphy:start */ ... /* calligraphy:end */ block of src/content.ts
  * Fraunces: Latin-1 + typographic punctuation; SOFT=100 and WONK=1 are pinned (the site always uses them)

usage: python3 scripts/subset_fonts.py [--src /path/to/fonts-src]
"""
import argparse, io, os, pathlib, re, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'src' / 'assets' / 'fonts'
GF = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
FILES = {
    'MaShanZheng-Regular.ttf': 'mashanzheng/MaShanZheng-Regular.ttf',
    'NotoSerifSC[wght].ttf': 'notoserifsc/NotoSerifSC%5Bwght%5D.ttf',
    'Fraunces[SOFT,WONK,opsz,wght].ttf': 'fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf',
    'Fraunces-Italic[SOFT,WONK,opsz,wght].ttf': 'fraunces/Fraunces-Italic%5BSOFT,WONK,opsz,wght%5D.ttf',
}
PUNCT = '，。、；：？！“”‘’（）《》〈〉「」『』—…·・～　【】％'
LATIN = ''.join(chr(c) for c in range(0x20, 0x7F)) + ''.join(chr(c) for c in range(0xA0, 0x100)) + '–—‘’“”…•·′″→←↻↺°×'


def ensure(src: pathlib.Path):
    src.mkdir(parents=True, exist_ok=True)
    for name, rel in FILES.items():
        p = src / name
        if not p.exists():
            print('downloading', name)
            urllib.request.urlretrieve(GF + rel, p)


def is_cjk(ch: str) -> bool:
    o = ord(ch)
    return 0x2E80 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF or 0xFF00 <= o <= 0xFFEF or 0x3000 <= o <= 0x303F


def save(font: TTFont, text: str, out: pathlib.Path, features='*'):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = [features] if features == '*' else features
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(font)
    font.flavor = 'woff2'
    font.save(out)
    print(f'{out.relative_to(ROOT)}  {out.stat().st_size / 1024:.1f} KB  ({len(set(text))} chars)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.environ.get('FONT_SRC', str(ROOT.parent / 'fonts-src')))
    a = ap.parse_args()
    src = pathlib.Path(a.src)
    ensure(src)
    OUT.mkdir(parents=True, exist_ok=True)

    files = list((ROOT / 'src').rglob('*.ts')) + list((ROOT / 'src').rglob('*.tsx')) + [ROOT / 'index.html']
    text = ''.join(p.read_text('utf-8') for p in files)
    cjk = sorted({ch for ch in text if is_cjk(ch)} | set(PUNCT))
    content = (ROOT / 'src' / 'content.ts').read_text('utf-8')
    m = re.search(r'/\* calligraphy:start \*/(.*?)/\* calligraphy:end \*/', content, re.S)
    brush = sorted({ch for ch in m.group(1) if is_cjk(ch)}) if m else []

    save(TTFont(src / 'NotoSerifSC[wght].ttf'), ''.join(cjk) + LATIN, OUT / 'notoserifsc-subset.woff2')
    save(TTFont(src / 'MaShanZheng-Regular.ttf'), ''.join(brush) + '·', OUT / 'mashanzheng-subset.woff2')
    for name, out in [('Fraunces[SOFT,WONK,opsz,wght].ttf', 'fraunces-latin.woff2'), ('Fraunces-Italic[SOFT,WONK,opsz,wght].ttf', 'fraunces-italic-latin.woff2')]:
        f = instancer.instantiateVariableFont(TTFont(src / name, lazy=False), {'SOFT': 100, 'WONK': 1, 'wght': (300, 700)})
        buf = io.BytesIO(); f.save(buf); buf.seek(0)          # re-load so every table is consistent
        save(TTFont(buf), LATIN, OUT / out)


if __name__ == '__main__':
    main()
