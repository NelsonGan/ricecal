#!/usr/bin/env python3
"""Cut a grid sheet of icons into individual PNGs in the app's icon format.

    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt --check
    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt --write

The four sheets already cut are recorded in `scripts/icon-sheets/*.txt`, one
`set/name` per line in the sheet's own reading order. They are kept because a
sheet may have to be re-cut — a bleeding edge found later, a rename — and the
mapping from grid cell to filename is not recoverable from the PNGs.

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
    """Whether the sheet's border is empty, sampled rather than spot-checked.

    Four corners is not enough. One of these sheets had a single corner pixel at
    alpha 1 — invisible, and enough to send an already-transparent sheet through
    the flood fill with a background colour read off that pixel as pure black,
    which would then have eaten any dark artwork touching the border.
    """
    w, h = im.size
    px = im.convert("RGBA").load()
    border = [px[x, 0][3] for x in range(w)] + [px[x, h - 1][3] for x in range(w)]
    border += [px[0, y][3] for y in range(h)] + [px[w - 1, y][3] for y in range(h)]
    return sum(1 for a in border if a < 8) / len(border) > 0.99


def solid_bbox(cell: Image.Image):
    """Content bounds ignoring the soft halo a render leaves around artwork."""
    mask = cell.getchannel("A").point(lambda a: 255 if a > ALPHA_FLOOR else 0)
    return mask.getbbox()


def components(im: Image.Image, min_area: int):
    """Every connected blob of artwork, as (pixels, bbox).

    Cutting a sheet on a uniform grid assumes the generator centred each drawing
    in its cell, and these were not: measured against a 5x5 split, 48 of the 100
    had artwork crossing a cell edge. A grid would have shaved a slice off all
    of them.

    Blobs do not care where the lines are. What they cannot do alone is decide
    which blob belongs to which icon, since plenty of these drawings are several
    separate pieces — scattered sesame seeds, a pile of mussels, three dates. So
    the caller clusters them against the nominal grid positions, which is the
    one thing about the layout that IS reliable.
    """
    w, h = im.size
    px = im.getchannel("A").load()
    seen = bytearray(w * h)
    out = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy] <= ALPHA_FLOOR:
                continue
            stack = [(sx, sy)]
            seen[sy * w + sx] = 1
            blob = []
            x0 = x1 = sx
            y0 = y1 = sy
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                if x < x0:
                    x0 = x
                if x > x1:
                    x1 = x
                if y < y0:
                    y0 = y
                if y > y1:
                    y1 = y
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            i = ny * w + nx
                            if not seen[i] and px[nx, ny] > ALPHA_FLOOR:
                                seen[i] = 1
                                stack.append((nx, ny))
            if len(blob) >= min_area:
                out.append((blob, (x0, y0, x1, y1)))
    return out


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
    ap.add_argument("--min-area", type=int, default=60, help="ignore blobs smaller than this")
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

    blobs = components(im, args.min_area)
    print(f"{len(blobs)} blobs of artwork")

    # Each blob joins the nominal grid position its centre is nearest to. The
    # positions are only used as anchors, never as cut lines.
    cells: dict[int, list] = {i: [] for i in range(want)}
    for blob, box in blobs:
        cx = (box[0] + box[2]) / 2
        cy = (box[1] + box[3]) / 2
        c = min(range(args.cols), key=lambda i: abs((i + 0.5) * im.width / args.cols - cx))
        r = min(range(args.rows), key=lambda i: abs((i + 0.5) * im.height / args.rows - cy))
        cells[r * args.cols + c].append((blob, box))

    problems = []
    src = im.load()
    for i, label in enumerate(names):
        group = cells[i]
        if not group:
            problems.append(f"{label}: nothing found at this position")
            continue

        x0 = min(b[1][0] for b in group)
        y0 = min(b[1][1] for b in group)
        x1 = max(b[1][2] for b in group)
        y1 = max(b[1][3] for b in group)

        # Only this icon's own pixels are copied. Cropping the bounding box
        # instead would drag in any neighbour that overlaps it, which is exactly
        # the bleed a grid cut produces.
        cell = Image.new("RGBA", (x1 - x0 + 1, y1 - y0 + 1), (0, 0, 0, 0))
        dst = cell.load()
        for blob, _ in group:
            for x, y in blob:
                dst[x - x0, y - y0] = src[x, y]

        area = (x1 - x0 + 1) * (y1 - y0 + 1)
        covered = sum(len(b[0]) for b in group)
        if area and covered / area < 0.10:
            problems.append(f"{label}: artwork fills only {covered / area:.0%} of its bounds")
        if len(group) > 40:
            problems.append(f"{label}: {len(group)} separate pieces, check it is one drawing")

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
