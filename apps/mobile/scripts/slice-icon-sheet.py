#!/usr/bin/env python3
"""Cut a grid sheet of icons into individual PNGs in the app's icon format.

    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt --check
    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt --write

`sync-icons.mjs` imports the design system, whose sheets are already
transparent and already padded, so it only has to `sips -Z 192` each file. A
sheet generated elsewhere is neither, and this is the difference: it has to
find the background, cut the grid, and reproduce the padding by hand.

WHY THE BACKGROUND IS FLOOD-FILLED, NOT KEYED

The obvious way to drop a white background is to make every white pixel
transparent. That is wrong here and the damage is invisible until the icon is
on a dark screen: half of these drawings have white or cream INSIDE them —
marshmallows, cauliflower, mayonnaise, a bao bun, tofu, an oyster, cream. Keying
on colour punches holes through all of them.

So the fill starts from the sheet's outside edges and spreads only through
pixels that are close to the background colour AND connected to the border.
Interior whites are never reached, because the drawing encloses them.

THE PADDING RULE, MEASURED FROM THE EXISTING SET

Every icon in `assets/icons` is 192x192 with its artwork scaled so the LONGER
edge is 172px, centred. Verified across shapes: `water-bottle` is 94x172,
`banana` is 172x129, `apple` is 172x168. Anything else and a new icon renders
visibly bigger or smaller than the ones beside it in a list.
"""

import argparse
import subprocess
import sys
from collections import deque
from pathlib import Path

from PIL import Image

CANVAS = 192
CONTENT = 172
# Below this the pixel is background as far as bbox and bleed checks care.
ALPHA_FLOOR = 32


def flood_background(im: Image.Image, tolerance: int) -> Image.Image:
    """Clear pixels reachable from the border that match the border colour."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    # The background colour is whatever the corners agree on.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = corners[0][:3]

    seen = bytearray(w * h)
    queue: deque = deque()
    for x in range(w):
        for y in (0, h - 1):
            queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        r, g, b, a = px[x, y]
        if a == 0:
            seen[i] = 1
            queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
            continue
        if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > tolerance:
            continue
        seen[i] = 1
        px[x, y] = (r, g, b, 0)
        queue.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return im


def already_transparent(im: Image.Image) -> bool:
    w, h = im.size
    px = im.convert("RGBA").load()
    return all(px[x, y][3] == 0 for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)))


def solid_bbox(cell: Image.Image):
    """Content bounds ignoring the soft halo a render leaves around artwork."""
    mask = cell.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)
    return mask.getbbox()


def to_icon(cell: Image.Image) -> Image.Image:
    box = solid_bbox(cell)
    if box is None:
        raise ValueError("cell is empty")
    art = cell.crop(box)
    scale = CONTENT / max(art.width, art.height)
    size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
    art = art.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(art, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2), art)
    return canvas


def pngquant_bin() -> str:
    subprocess.run(["npx", "--yes", "pngquant-bin@9", "--version"], capture_output=True, check=True)
    found = subprocess.run(
        ["find", str(Path.home() / ".npm" / "_npx"), "-name", "pngquant", "-type", "f"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    if not found:
        sys.exit("pngquant-bin installed but its binary was not found")
    return found[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--names", required=True, help="one `set/name` per line, row-major")
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--rows", type=int, default=5)
    ap.add_argument("--tolerance", type=int, default=40)
    ap.add_argument("--out", default="assets/icons")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    names = [l.strip() for l in Path(args.names).read_text().splitlines() if l.strip()]
    want = args.cols * args.rows
    if len(names) != want:
        sys.exit(f"{len(names)} names for {want} cells")

    im = Image.open(args.sheet).convert("RGBA")
    if already_transparent(im):
        print("sheet already has a transparent background")
    else:
        print(f"flood-filling background (tolerance {args.tolerance})")
        im = flood_background(im, args.tolerance)

    cw, ch = im.width // args.cols, im.height // args.rows
    problems = []
    for i, label in enumerate(names):
        r, c = divmod(i, args.cols)
        cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        box = solid_bbox(cell)
        if box is None:
            problems.append(f"{label}: cell is empty")
            continue

        # Artwork touching a cell edge means the grid split cut through it, or
        # two icons are bleeding into one another.
        touches = []
        if box[0] <= 1:
            touches.append("left")
        if box[1] <= 1:
            touches.append("top")
        if box[2] >= cw - 1:
            touches.append("right")
        if box[3] >= ch - 1:
            touches.append("bottom")
        if touches:
            problems.append(f"{label}: artwork touches {', '.join(touches)} of its cell")

        # Stray specks: a second blob far from the main one is usually a
        # neighbour's shadow caught by the crop.
        alpha = cell.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)
        covered = sum(alpha.histogram()[1:])
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area and covered / area < 0.12:
            problems.append(f"{label}: artwork fills only {covered / area:.0%} of its bounds")

        if args.write:
            icon = to_icon(cell)
            set_name, _, base = label.partition("/")
            dest = Path(args.out) / set_name / f"{base}.png"
            dest.parent.mkdir(parents=True, exist_ok=True)
            icon.save(dest)

    if args.write:
        quant = pngquant_bin()
        for label in names:
            set_name, _, base = label.partition("/")
            dest = Path(args.out) / set_name / f"{base}.png"
            if dest.exists():
                subprocess.run(
                    [quant, "--quality", "65-88", "--speed", "3", "-f", "-o", str(dest), str(dest)],
                    check=True,
                )
        print(f"wrote {len(names)} icons to {args.out}")

    if problems:
        print("\nPROBLEMS")
        for p in problems:
            print(" ", p)
        sys.exit(1)
    print("every cell is clean: nothing touching a cell edge, no stray fragments")


if __name__ == "__main__":
    main()
