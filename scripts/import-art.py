#!/usr/bin/env python3
"""Imports painted artwork for a board skin into apps/web/src/art/<folder>/.

Usage (from the repo root): python3 -I scripts/import-art.py apps/web/src/art/<folder> slot=path [slot=path ...]

Slots, one picture each (see apps/web/src/theme/boards/art.ts):
    header, backdrop, forest, hills, pasture, fields, mountains, desert, sea,
    settlement, city, robber, token
Sheets, several slots in one picture:
    lands   a 3 x 2 grid: forest, hills, pasture on top; fields, mountains, desert below
    pieces  three objects left to right on a flat background: settlement, city, robber

Every image is resized and saved as .webp. Pieces lose a flat background (a green screen is
keyed out by colour, anything else is flood-filled from the corners), are trimmed to the subject
and set on a square, bottom-centred. Settlements and cities are turned to greyscale with the
lightest part at pure white, so the game's player-colour tint reads cleanly.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

SIZES = {
    'header': (1200, 800),
    'backdrop': (1920, 1280),
    'sea': (512, 512),
    'token': (192, 192),
    'piece': 320,
    'tile': 512,
}
TILES = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert']
PIECES = ['settlement', 'city', 'robber']
SLOTS = set(TILES) | set(PIECES) | {'header', 'backdrop', 'sea', 'token'}
SHEETS = {'lands', 'pieces'}


def cover(img, w, h):
    return ImageOps.fit(img.convert('RGB'), (w, h), Image.LANCZOS, centering=(0.5, 0.5))


# ---- Backgrounds ----

def is_green_screen(rgb):
    """True when the picture's border is a green screen."""
    a = np.asarray(rgb, dtype=np.int16)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    r, g, b = np.median(border, axis=0)
    return g - max(r, b) > 60


def key_green(rgb):
    """RGBA with the green screen keyed out, soft at the edges, and green spill removed."""
    a = np.asarray(rgb.convert('RGB'), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lead = g - np.maximum(r, b)
    # Measured against this screen's own green: a dull screen (lead ~60) must still key to nothing.
    border = np.concatenate([lead[0], lead[-1], lead[:, 0], lead[:, -1]])
    screen = float(np.median(border))
    alpha = np.clip((screen * 0.8 - lead) / (screen * 0.55), 0, 1)
    g = np.minimum(g, np.maximum(r, b) + 8)
    out = np.dstack([r, g, b, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def drop_flat_background(img, tolerance=40):
    """Makes a flat background transparent, if the image has no transparency of its own."""
    img = img.convert('RGBA')
    if img.getchannel('A').getextrema()[0] < 250:
        return img
    if is_green_screen(img.convert('RGB')):
        return key_green(img)
    marker = (255, 0, 255, 0)
    out = img.copy()
    w, h = out.size
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if out.getpixel(xy)[3] != 0:
            ImageDraw.floodfill(out, xy, marker, thresh=tolerance)
    a = np.asarray(out).copy()
    a[(a == marker).all(axis=-1)] = 0
    return Image.fromarray(a, 'RGBA')


# ---- Pieces ----

def main_rows(alpha, gap):
    """The run of rows (or columns) holding most of the subject; specks apart from it, such as a
    generator's watermark, fall outside."""
    on = alpha.sum(axis=1) > 0
    runs, start = [], None
    for i, v in enumerate(list(on) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append([start, i])
            start = None
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    if not merged:
        return 0, alpha.shape[0]
    return max(merged, key=lambda r: alpha[r[0]:r[1]].sum())


def piece(img, slot):
    img = drop_flat_background(img)
    mask = np.asarray(img.getchannel('A')) > 16
    y0, y1 = main_rows(mask, max(4, mask.shape[0] // 50))
    x0, x1 = main_rows(mask[y0:y1].T, max(4, mask.shape[1] // 50))
    img = img.crop((x0, y0, x1, y1))
    box = img.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    if box:
        img = img.crop(box)
    if slot in ('settlement', 'city'):
        alpha = img.getchannel('A')
        grey = ImageOps.autocontrast(img.convert('L'), cutoff=1)
        img = Image.merge('RGBA', (grey, grey, grey, alpha))
    side = max(img.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.width) // 2, side - img.height))
    n = SIZES['piece']
    return square.resize((n, n), Image.LANCZOS)


def split_pieces(img):
    """The three objects of a pieces sheet, left to right, each on a transparent background."""
    cut = drop_flat_background(img)
    alpha = np.asarray(cut.getchannel('A')) > 40
    w = alpha.shape[1]
    cols = alpha.sum(axis=0) > max(2, alpha.shape[0] * 0.004)
    runs, start = [], None
    for x, on in enumerate(list(cols) + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append([start, x])
            start = None
    # Close small gaps inside one object (a flag apart from its pole, say).
    merged = []
    for run in runs:
        if merged and run[0] - merged[-1][1] < w * 0.025:
            merged[-1][1] = run[1]
        else:
            merged.append(run)
    if len(merged) < 3:
        sys.exit(f'pieces: found {len(merged)} objects, need 3 with space between them')
    widest = sorted(sorted(merged, key=lambda r: r[1] - r[0])[-3:])
    return [cut.crop((x0, 0, x1, cut.height)) for x0, x1 in widest]


# ---- Lands ----

def gutter(std, lo, hi, quiet=14.0):
    """The run of plain columns (or rows) near an expected cut, as (start, end)."""
    window = std[lo:hi]
    i = lo + int(np.argmin(window))
    if std[i] > quiet:
        return i, i
    a = b = i
    while a > lo and std[a - 1] <= quiet:
        a -= 1
    while b < hi - 1 and std[b + 1] <= quiet:
        b += 1
    return a, b + 1


def margin(std, quiet=14.0):
    """Plain columns (or rows) along each edge, such as a frame around the grid."""
    n = len(std)
    a = 0
    while a < n // 10 and std[a] <= quiet:
        a += 1
    b = n
    while b > n - n // 10 and std[b - 1] <= quiet:
        b -= 1
    return a, b


def split_lands(img):
    """The six cells of a 3 x 2 lands sheet, in TILES order."""
    rgb = img.convert('RGB')
    grey = np.asarray(rgb.convert('L'), dtype=np.float32)
    col_std, row_std = grey.std(axis=0), grey.std(axis=1)
    x0, x1 = margin(col_std)
    y0, y1 = margin(row_std)
    w, h = x1 - x0, y1 - y0
    win_x, win_y = int(w * 0.08), int(h * 0.08)
    xs = [x0]
    for k in (1, 2):
        c = x0 + w * k // 3
        a, b = gutter(col_std, c - win_x, c + win_x)
        xs += [a, b]
    xs.append(x1)
    c = y0 + h // 2
    a, b = gutter(row_std, c - win_y, c + win_y)
    ys = [y0, a, b, y1]
    cells = []
    for r in range(2):
        for k in range(3):
            left, right = xs[2 * k], xs[2 * k + 1]
            top, bottom = ys[2 * r], ys[2 * r + 1]
            inset = int(min(right - left, bottom - top) * 0.015)
            cell = rgb.crop((left + inset, top + inset, right - inset, bottom - inset))
            cells.append(trim_frame(cell))
    return cells


def trim_frame(cell):
    """Drops a card frame (white, black or both) around a cell's picture, with the frame's
    rounded corners."""
    a = np.asarray(cell, dtype=np.int16)
    plain = (a.min(axis=-1) > 225) | (a.max(axis=-1) < 60)
    h, w = plain.shape
    top, bottom, left, right = 0, h, 0, w
    while top < h // 5 and plain[top, left:right].mean() > 0.5:
        top += 1
    while bottom > h - h // 5 and plain[bottom - 1, left:right].mean() > 0.5:
        bottom -= 1
    while left < w // 5 and plain[top:bottom, left].mean() > 0.5:
        left += 1
    while right > w - w // 5 and plain[top:bottom, right - 1].mean() > 0.5:
        right -= 1
    # Step past the rounded corners too.
    pad = int(min(right - left, bottom - top) * 0.03)
    return cell.crop((left + pad, top + pad, right - pad, bottom - pad))


# ---- Main ----

def save(dest, slot, out, q):
    for old in dest.glob(f'{slot}.*'):
        old.unlink()
    path = dest / f'{slot}.webp'
    out.save(path, 'WEBP', quality=q, method=6)
    print(f'{slot}: {path} {out.size} {path.stat().st_size // 1024} KB')


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    dest = Path(sys.argv[1])
    dest.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[2:]:
        slot, _, src = arg.partition('=')
        if slot not in SLOTS | SHEETS:
            sys.exit(f'Unknown slot {slot!r}; slots are {sorted(SLOTS | SHEETS)}')
        img = Image.open(src)
        if slot == 'lands':
            for name, cell in zip(TILES, split_lands(img)):
                save(dest, name, cover(cell, SIZES['tile'], SIZES['tile']), 84)
        elif slot == 'pieces':
            for name, part in zip(PIECES, split_pieces(img)):
                save(dest, name, piece(part, name), 90)
        elif slot in PIECES:
            save(dest, slot, piece(img, slot), 90)
        elif slot in TILES:
            save(dest, slot, cover(img, SIZES['tile'], SIZES['tile']), 84)
        elif slot == 'token':
            save(dest, slot, cover(img, *SIZES['token']), 90)
        else:
            save(dest, slot, cover(img, *SIZES[slot]), 80 if slot == 'backdrop' else 84)


if __name__ == '__main__':
    main()
