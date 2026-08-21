#!/usr/bin/env python3
"""Cut a grid sheet of icons into individual PNGs in the app's icon format.

    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt
    python3 scripts/slice-icon-sheet.py sheet.png --names names.txt --write

Without `--write` it cuts nothing and only reports what it found, which is the
way to check a sheet before it lands in `assets/`.

`--names` is one `set/name` per line in the sheet's own reading order, written
per sheet and thrown away after.

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

WHEN THE SHEET HAS DROP SHADOWS: `--shadows`

A shadow is not a colour a tolerance can be set for. Measured on the onboarding
sheet, the shadow under the plate is DARKER than the rice beside it, so any
tolerance wide enough to clear the first punches through the second. Widening it
is worse than useless: the sneakers' collar linings are a cool grey that reads
exactly like a mid shadow, and the collar is a WIDE opening in the silhouette
rather than a thin gap that could be sealed, so a wider fill strolled in and left
two holes through the shoes.

What separates them is not brightness but CONTINUITY. A shadow fades smoothly
out to paper; the artwork's own pale parts are walled off from the paper by a
hard edge. So under `--shadows` the fill may only step to a neighbour within
`SHADOW_STEP` of the brightness it is standing on — it follows a shadow all the
way out and cannot cross an edge to get in.

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

# How big a jump in brightness the `--shadows` fill may take in one pixel. The
# sneakers decide the number: at 8 every collar-lining pixel survives and every
# shadow pixel still goes, and by 10 the fill has started eating the linings.
SHADOW_STEP = 8

# Where that fill is allowed to go at all: neutral, and no darker than this.
# Shadows read about 3 chroma against the palest cream in the artwork at 36, so
# colour is what holds the fill out of the drawing once brightness cannot.
SHADOW_CHROMA = 25
SHADOW_DARK = 110

# A hole straight THROUGH the artwork — the middle of the ring — is enclosed, so
# no fill starting at the border can reach it. What tells it from the artwork's
# own whites is that it IS the paper: the ring's middle sits 1 away from white
# where the rice sits 29.
PAPER = 6


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


def shade(px, x: int, y: int) -> tuple[int, int]:
    """How neutral a pixel is, and how far below the paper it sits.

    Both numbers, because the fill needs one of each: colour is what keeps it
    out of the drawing, and brightness is what lets it follow a shadow.
    """
    r, g, b = px[x, y][:3]
    lo = min(r, g, b)
    return max(r, g, b) - lo, 255 - lo


def is_ground(px, x: int, y: int) -> bool:
    """Whether a pixel could be the paper, or a shadow cast on it."""
    chroma, dark = shade(px, x, y)
    return chroma < SHADOW_CHROMA and dark < SHADOW_DARK


def gradient_background(im: Image.Image) -> Image.Image:
    """Clear the background and its drop shadows, without stepping over an edge.

    Same starting point as `flood_background` — the border, spreading inwards —
    and one difference: each step is measured against the pixel it is coming
    FROM rather than against the background colour, so the fill can follow a
    shadow down to any darkness as long as it got there gradually.

    ASSUMES THE GROUND IS PAPER, unlike `flood_background`, which reads whatever
    colour the corners agree on. `SHADOW_CHROMA` and `SHADOW_DARK` are measured
    from white, so a sheet on a coloured ground needs both re-measured against
    it before this is any use.
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()

    seen = bytearray(w * h)
    queue: deque = deque()

    def offer(x, y):
        if seen[y * w + x] or not is_ground(px, x, y):
            return
        seen[y * w + x] = 1
        queue.append((x, y))

    for x in range(w):
        offer(x, 0)
        offer(x, h - 1)
    for y in range(h):
        offer(0, y)
        offer(w - 1, y)

    while queue:
        x, y = queue.popleft()
        _, here = shade(px, x, y)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if not (0 <= nx < w and 0 <= ny < h) or seen[ny * w + nx]:
                continue
            if not is_ground(px, nx, ny):
                continue
            if abs(shade(px, nx, ny)[1] - here) <= SHADOW_STEP:
                seen[ny * w + nx] = 1
                queue.append((nx, ny))

    for i in range(w * h):
        if seen[i]:
            x, y = i % w, i // w
            r, g, b, _ = px[x, y]
            px[x, y] = (r, g, b, 0)

    clear_paper_holes(im, seen)
    return im


def clear_paper_holes(im: Image.Image, filled: bytearray) -> None:
    """Clear enclosed regions that are the paper itself rather than artwork.

    Only the ring needs this today, and only because its middle is a hole the
    border can never reach. Judged per region rather than per pixel: a specular
    highlight on cream can touch pure white for a few pixels, and clearing those
    one at a time would pinhole the artwork.
    """
    w, h = im.size
    px = im.load()
    seen = bytearray(filled)

    for start in range(w * h):
        sx, sy = start % w, start // w
        if seen[start] or not is_ground(px, sx, sy):
            continue

        region = []
        stack = [(sx, sy)]
        seen[start] = 1
        while stack:
            x, y = stack.pop()
            region.append((x, y))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if not (0 <= nx < w and 0 <= ny < h) or seen[ny * w + nx]:
                    continue
                if is_ground(px, nx, ny):
                    seen[ny * w + nx] = 1
                    stack.append((nx, ny))

        darks = sorted(shade(px, x, y)[1] for x, y in region)
        if darks[len(darks) // 2] < PAPER:
            for x, y in region:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)


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


def bleed_edges(art: Image.Image, rounds: int = 3) -> Image.Image:
    """Push the artwork's colour outwards into the pixels that were cleared.

    Alpha is cut hard, and PIL resamples the colour channels without regard to
    it — so a cleared pixel still contributes its RGB to whatever edge pixel
    lands on top of it. Cleared pixels are transparent BLACK, which is how a
    clean cut ends up with a dark rim once it is scaled down. Giving them their
    neighbour's colour first means the only thing the resample can mix in is
    more of the drawing.
    """
    art = art.copy()
    w, h = art.size
    px = art.load()
    for _ in range(rounds):
        edge = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3]:
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3]:
                        edge.append((x, y, px[nx, ny][:3]))
                        break
        if not edge:
            break
        for x, y, rgb in edge:
            px[x, y] = (*rgb, 0)
    return art


def to_icon(cell: Image.Image) -> Image.Image:
    box = solid_bbox(cell)
    if box is None:
        raise ValueError("cell is empty")
    art = bleed_edges(cell.crop(box))
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
    ap.add_argument(
        "--shadows",
        action="store_true",
        help="the sheet's icons carry drop shadows; fill by gradient, not tolerance",
    )
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
    elif args.shadows:
        print(f"gradient-filling background and shadows (step {SHADOW_STEP})")
        im = gradient_background(im)
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
