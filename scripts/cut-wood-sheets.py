#!/usr/bin/env python3
"""Cuts Nachi's Wooden board art sheets (24 Nov 2026) into apps/web/src/art/wood/.

Usage (from the repo root):
    python3 -I scripts/cut-wood-sheets.py icons=<sheet> tiles=<sheet> figures=<sheet> addons=<sheet>

The sheets are 896 x 1200 grids on a cream or kraft background:
    icons    3 x 6: an object per land (logs, bricks … fog), drawn on cream
    tiles    3 x 6: a printed card per land (forest … fog), cut to a hex-shaped tile
    figures  4 x 6: meeples (knights, wizard …), dragons and vehicles
    addons   5 x 7: walls, metropolises, cargo, barbarians and markers, each over a label

Figures that the game tints per player are turned to greyscale with the lightest part at pure
white, like the settlements in import-art.py. Labels under the add-ons are dropped (no words in
art). Cells marked None are not used by the game yet and are skipped.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from importlib import import_module  # noqa: E402

art = import_module('import-art')

DEST = Path('apps/web/src/art/wood')

# Cell edges in sheet pixels, found from the grid lines.
ICON_COLS = [25, 305, 589, 871]
ICON_ROWS = [30, 220, 412, 603, 795, 986, 1176]
TILE_COLS = [(28, 298), (308, 588), (598, 868)]
TILE_ROWS = [(28, 218), (228, 408), (416, 596), (606, 794), (803, 984), (993, 1175)]
FIG_COLS = [20, 232, 447, 662, 876]
FIG_ROWS = [30, 220, 412, 603, 795, 987, 1176]
ADD_COLS = [22, 194, 363, 532, 702, 884]  # the last reaches past the frame line: the compass touches it
ADD_ROWS = [28, 229, 413, 566, 719, 873, 1020]

ICONS = [
    ['land-forest', 'land-hills', 'land-pasture'],
    ['land-fields', 'land-mountains', 'land-desert'],
    [None, 'land-gold', 'land-volcano'],
    ['land-lake', None, 'land-fishinglake'],
    [None, 'land-oasis', 'land-castle'],
    [None, None, None],
]
TILES = [
    # The six lands and the sea stay the photo tiles in public/tiles/wood/.
    [None, None, None],
    [None, None, None],
    [None, 'tile-gold', 'tile-volcano'],
    ['tile-lake', 'tile-fishinglake', None],
    ['tile-swamp', 'tile-oasis', 'tile-castle'],
    ['tile-quarry', 'tile-glassworks', 'tile-hidden'],
]
FIGURES = [
    ['knight1', 'knight2', 'knight3', 'dragon1'],
    ['dragon2', 'gwpdragon', 'gwpdragon', 'dragon3'],
    ['merchant', None, None, None],
    ['damsel', 'wizard', 'junker', 'duke'],
    ['scholar', 'inquisitor', 'envoy', 'army'],
    ['nuke', 'train', 'ferry', 'plane'],
]
ADDONS = [
    ['wall', 'city-broken', 'metro-tower-trade', 'metro-tower-politics', 'metro-tower-science'],
    ['citadel', 'diocese', 'monument', 'silo', 'festival'],
    [None, None, None, 'cargo-settler', 'cargo-crew'],
    ['cargo-fish', 'cargo-spice', 'cargo-army', None, None],
    [None, 'harbor', 'village', None, 'camel'],
    ['barb1', 'barb2', 'barb3', None, 'prince'],
]
# Height of the label under a labelled add-on, cut off.
LABEL = 30
# The crown and nuke mark sit on a last row with its own spacing.
ADDON_EXTRA = {'crown': (22, 1030, 176, 1150), 'nukemark': (176, 1030, 336, 1150)}

# From the pieces sheet (road, house, city, ship …), which is to be redone: the ships only.
# Nachi, 24 Nov: its ships do not fit the board, so none of it is used yet.
PIECE_CELLS: dict = {}

# Painted in the player's colour by the game: white and grey, black lines kept.
TINTED = {
    'knight1', 'knight2', 'knight3', 'merchant', 'damsel', 'wizard', 'junker', 'duke',
    'scholar', 'inquisitor', 'envoy', 'army', 'nuke', 'train', 'ferry', 'plane',
    'city-broken', 'harbor', 'metro-tower-trade', 'metro-tower-politics', 'metro-tower-science',
}


def recolour(im, name):
    """Small shifts so a rarer land never reads as a base land on this board.

    Gold on the sheet is the same orange as the wooden board's fields and desert, so it goes a
    clear brass yellow; fog is near white and shouts over the sea, so it goes a cool grey."""
    if name == 'tile-gold':
        hsv = np.asarray(im.convert('HSV'), dtype=np.float32)
        hsv[..., 0] = (hsv[..., 0] + 7) % 256  # about 10 degrees toward yellow
        hsv[..., 1] = hsv[..., 1] * 0.88
        hsv[..., 2] = np.clip(hsv[..., 2] * 1.04, 0, 255)
        return Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
    if name == 'tile-hidden':
        a = np.asarray(im, dtype=np.float32) * np.array([0.72, 0.8, 0.84])
        return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGB')
    return im


def tile(img, box):
    x0, y0, x1, y1 = box
    # Inside the card's worn edge.
    cell = img.crop((x0 + 10, y0 + 10, x1 - 10, y1 - 10)).convert('RGB')
    # A hex is taller than wide (104 x 120); the card is wide, so take its middle.
    return art.cover(cell, 416, 480)


def cut_out(cell):
    """The drawing on a textured cream cell, on transparency. Paper specks are dropped: only
    marks of a decent size count, and the cream inside an outline (a meeple's body) is kept."""
    rgb = np.asarray(cell.convert('RGB'), dtype=np.float32)
    h, w, _ = rgb.shape
    edge = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3),
                           rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
    paper = np.median(edge, axis=0)
    dist = np.sqrt(((rgb - paper) ** 2).sum(axis=-1))
    mark = Image.fromarray(((dist > 38) * 255).astype(np.uint8), 'L')
    # Paper specks are small: an opening wipes them, and every mark still touching what is left
    # grows back (thin spear shafts and the like keep their joins to the body).
    core = mark.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    m = np.asarray(mark) > 0
    keep = np.asarray(core) > 0
    for _ in range(200):
        grown = (np.asarray(Image.fromarray(keep.astype(np.uint8) * 255)
                            .filter(ImageFilter.MaxFilter(3))) > 0) & m
        if (grown == keep).all():
            break
        keep = grown
    # Outside = paper reachable from the border without crossing a kept mark.
    wall = Image.fromarray((keep * 255).astype(np.uint8), 'L')
    pad = Image.new('L', (w + 2, h + 2), 0)
    pad.paste(wall, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 100)
    outside = np.asarray(pad)[1:-1, 1:-1] == 100
    alpha = Image.fromarray(((~outside) * 255).astype(np.uint8), 'L')
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))
    out = cell.convert('RGBA')
    out.putalpha(alpha)
    return out


DRAGONS = {'dragon1', 'dragon2', 'dragon3', 'gwpdragon'}
INK_LINE = np.array([22, 26, 25], dtype=np.float32)
def otsu(values):
    """The cut that best splits values into two groups (Otsu's method)."""
    hist, edges = np.histogram(values, bins=64)
    mids = (edges[:-1] + edges[1:]) / 2
    w0 = np.cumsum(hist)
    w1 = w0[-1] - w0
    m0 = np.cumsum(hist * mids) / np.maximum(w0, 1)
    m1 = ((hist * mids).sum() - np.cumsum(hist * mids)) / np.maximum(w1, 1)
    return float(mids[np.argmax(w0 * w1 * (m0 - m1) ** 2)])


def lift_body(cut):
    """A metropolis tower is painted in deep navy, green or gold with darker lines of the same
    colour; tinted in a player's colour that comes out nearly all dark. The lines are found (the
    darkest group of the painted parts), made solid ink and a touch bolder; the paint between
    them is lifted to light grey, so the tint shows on the walls and the outlines read clearly."""
    a = np.asarray(cut, dtype=np.float32).copy()
    # A door or arch open at the foot lets the cut-out's flood reach inside the building: fill
    # each row of the lower part from its first to its last solid pixel.
    alpha = a[..., 3]
    h = alpha.shape[0]
    for y in range(int(h * 0.55), h):
        xs = np.nonzero(alpha[y] > 128)[0]
        if len(xs) > 1:
            alpha[y, xs[0]:xs[-1] + 1] = 255
    smooth = cut.convert('RGB').filter(ImageFilter.MedianFilter(3))
    rgb = np.asarray(smooth, dtype=np.float32).copy()
    solid = alpha > 128
    L = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    # Each separate part (the building, and the banner or compass beside it) is judged on its
    # own: an emblem is painted lighter, so a cut taken over the whole piece misses its lines.
    parts = []
    # A copy: an image made straight from an array may not take a flood fill.
    work = Image.fromarray((solid * 255).astype(np.uint8)).copy()
    while True:
        arr = np.asarray(work)
        ys, xs = np.nonzero(arr == 255)
        if len(ys) == 0:
            break
        ImageDraw.floodfill(work, (int(xs[0]), int(ys[0])), 128)
        part = np.asarray(work) == 128
        parts.append(part)
        out = np.asarray(work).copy()
        out[part] = 64
        work = Image.fromarray(out).copy()
    biggest = max((int(p.sum()) for p in parts), default=0)

    def grow(mask, size):
        im = Image.fromarray((mask * 255).astype(np.uint8))
        return np.asarray(im.filter(ImageFilter.MaxFilter(size))) > 0

    def shrink(mask, size):
        im = Image.fromarray((mask * 255).astype(np.uint8))
        return np.asarray(im.filter(ImageFilter.MinFilter(size))) > 0

    lines = np.zeros_like(solid)
    emblem = np.zeros_like(solid)
    for part in parts:
        dark_part = part & (L < 165)
        small = part.sum() < biggest * 0.5
        if dark_part.sum() <= 50:
            cut_at = 0.0
        elif small:
            # An emblem's lines are its darkest tenth or so; its paint is close to them in tone,
            # so cut halfway from the darkest to the middle rather than by Otsu.
            p10, p50 = np.percentile(L[dark_part], [10, 50])
            cut_at = float(p10 + 0.5 * (p50 - p10))
        else:
            cut_at = otsu(L[dark_part])
        own = part & (L < cut_at)
        if not small:
            # The building: lines a touch bolder, and a firm border all round.
            lines |= part & (grow(own, 3) | ~shrink(part, 5))
        else:
            # A small emblem (the banner, the compass) keeps its own colours and lines: it goes
            # to a layer of its own, drawn untinted over the tower, with a firm ink border.
            emblem |= part
    original = np.asarray(cut, dtype=np.float32).copy()
    # Paint is anything between the lines that is not the cream highlights.
    paint = solid & ~emblem & ~lines & ((chroma > 20) | (L < 165))
    rgb[paint] = np.repeat((178 + L * 0.3)[paint][:, None], 3, axis=1)
    rgb[lines] = INK_LINE
    a[..., :3] = rgb
    a[..., 3] = np.where(grow(emblem, 7), 0, a[..., 3])
    e = original.copy()
    e[..., 3] = np.where(emblem, original[..., 3], 0)
    e[..., :3] = np.where((emblem & ~shrink(emblem, 3))[..., None], INK_LINE, e[..., :3])
    return (Image.fromarray(a.astype(np.uint8), 'RGBA'),
            Image.fromarray(e.astype(np.uint8), 'RGBA'))


def square(img):
    side = max(img.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, side - img.height))
    return sq.resize((320, 320), Image.LANCZOS)


def place_pair(tower, emblem, name):
    """The tower trimmed and squared as art.piece does, in grey for the player's tint. Its
    emblem is left out: the board draws every emblem as a vector (theme/woodEmblems.tsx)."""
    box = tower.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    img = tower.crop(box)
    alpha = img.getchannel('A')
    grey = ImageOps.autocontrast(img.convert('L'), cutoff=1)
    return square(Image.merge('RGBA', (grey, grey, grey, alpha)))


def figure(img, box, name, label=0):
    x0, y0, x1, y1 = box
    cell = cut_out(img.crop((x0 + 6, y0 + 6, x1 - 6, y1 - 6 - label)))
    if name.startswith('metro-tower-'):
        return place_pair(*lift_body(cell), name)
    # Dragons keep their own colours now (the board draws them untinted).
    kind = 'settlement' if name in TINTED and name not in DRAGONS else name
    return art.piece(cell, kind)


def main():
    sheets = dict(a.split('=', 1) for a in sys.argv[1:])
    if not sheets:
        sys.exit(__doc__)
    DEST.mkdir(parents=True, exist_ok=True)
    done = set()

    def save(name, im, q=88):
        if name in done:
            return
        done.add(name)
        art.save(DEST, name, im, q)

    if 'tiles' in sheets:
        img = Image.open(sheets['tiles'])
        for r, row in enumerate(TILES):
            for c, name in enumerate(row):
                if name:
                    (x0, x1), (y0, y1) = TILE_COLS[c], TILE_ROWS[r]
                    save(name, recolour(tile(img, (x0, y0, x1, y1)), name), 84)
    if 'icons' in sheets:
        img = Image.open(sheets['icons'])
        for r, row in enumerate(ICONS):
            for c, name in enumerate(row):
                if name:
                    box = (ICON_COLS[c], ICON_ROWS[r], ICON_COLS[c + 1], ICON_ROWS[r + 1])
                    save(name, figure(img, box, name))
    if 'figures' in sheets:
        img = Image.open(sheets['figures'])
        for r, row in enumerate(FIGURES):
            c = 0
            while c < len(row):
                name = row[c]
                span = 1
                while c + span < len(row) and row[c + span] == name and name:
                    span += 1
                if name:
                    box = (FIG_COLS[c], FIG_ROWS[r], FIG_COLS[c + span], FIG_ROWS[r + 1])
                    save(name, figure(img, box, name))
                c += span
    if 'addons' in sheets:
        img = Image.open(sheets['addons'])
        for r, row in enumerate(ADDONS):
            for c, name in enumerate(row):
                if name:
                    box = (ADD_COLS[c], ADD_ROWS[r], ADD_COLS[c + 1], ADD_ROWS[r + 1])
                    out = figure(img, box, name, 0 if r == 1 else LABEL)
                    save(name, out, 90 if name.startswith('metro-tower-') else 88)
        for name, box in ADDON_EXTRA.items():
            save(name, figure(img, box, name, LABEL))
        make_new_metros()
        stone_accents()
    if 'pieces' in sheets:
        # The sheet still to be redone; only its ships are used for now.
        img = Image.open(sheets['pieces'])
        for name, box in PIECE_CELLS.items():
            save(name, figure(img, box, name))




# ---- Trade and the metropolises the sheet does not have (Nachi, 24 Nov) ----
# Church, Witches and Greed, Wealth & Power add religion, magic and wealth metropolises. They
# share the trade tower with its scales cleared; the board draws each one's emblem on a plaque
# in the top panel (theme/woodEmblems.tsx). Run as part of the addons step, which cuts the
# trade tower first.

PANEL = (18, 108)  # the trade tower's top panel, rows inside its borders, on a 320 canvas


def blank_tower(trade):
    """The trade tower with the scales in its top panel painted out."""
    a = np.asarray(trade, dtype=np.uint8).copy()
    alpha = a[..., 3]
    L = a[..., :3].astype(np.float32).mean(axis=-1)
    y0, y1 = PANEL
    light = (alpha > 128) & (L > 150)
    fill = np.median(a[y0:y1][light[y0:y1]][:, :3], axis=0).astype(np.uint8)
    for y in range(y0, y1):
        xs = np.nonzero(alpha[y] > 128)[0]
        if len(xs) > 1:
            a[y, xs[0] + 12:xs[-1] - 11, :3] = fill
    return Image.fromarray(a, 'RGBA')


def shared_tower(trade):
    return blank_tower(trade)


def make_new_metros():
    trade = Image.open(DEST / 'metro-tower-trade.webp').convert('RGBA')
    tower = shared_tower(trade)
    for kind in ('trade', 'religion', 'magic', 'wealth'):
        art.save(DEST, f'metro-tower-{kind}', tower, 90)


# ---- The stone buildings (Nachi, 24 Nov: "too bland") ----
# The chapel, monument, tower and silo are cut cream and sage, which washes out on the board.
# Their stone is warmed to a honey sandstone with dark brown lines and brick-red patches, and
# one part of each (the chapel's steeple, the monument's band and steps, the tower's top, the
# silo's dome) is split off as a grey `-accent` layer that the board paints in the owner's
# colour. The seeds are points inside those parts, on the 320 canvas.
ACCENT_SEEDS = {
    'diocese': [(147, 109), (170, 109)],
    'monument': [(160, 214), (160, 298), (160, 280)],
    'citadel': [(160, 77), (160, 38)],
    'silo': [(115, 51), (186, 51)],
}
SANDSTONE = [(40, (30, 24, 20)), (95, (60, 40, 30)), (125, (146, 80, 54)), (150, (150, 96, 62)),
             (190, (206, 170, 118)), (235, (238, 214, 164))]


def stone_accents():
    for name, seeds in ACCENT_SEEDS.items():
        a = np.asarray(Image.open(DEST / f'{name}.webp').convert('RGBA')).copy()
        L = a[..., :3].astype(np.float32).mean(axis=-1)
        open_ = Image.fromarray((((a[..., 3] > 128) & (L > 100)) * 255).astype(np.uint8)).copy()
        part = np.zeros(L.shape, bool)
        for seed in seeds:
            t = open_.copy()
            ImageDraw.floodfill(t, seed, 128)
            part |= np.asarray(t) == 128
        base = a.copy()
        xs = [t for t, _ in SANDSTONE]
        for c in range(3):
            base[..., c] = np.interp(L, xs, [col[c] for _, col in SANDSTONE]).astype(np.uint8)
        acc = np.zeros_like(a)
        acc[..., :3] = np.clip(150 + (L - 190) * 1.2, 90, 235).astype(np.uint8)[..., None]
        acc[..., 3] = np.where(part, a[..., 3], 0)
        art.save(DEST, name, Image.fromarray(base, 'RGBA'), 90)
        art.save(DEST, f'{name}-accent', Image.fromarray(acc, 'RGBA'), 90)


if __name__ == '__main__':
    np.seterr(all='ignore')
    ImageOps  # imported for import-art's helpers
    main()
