#!/usr/bin/env python3
"""Build RiceCal launcher assets from the transparent app-icon artwork."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "app-icon-source.png"

LIGHT = "#F6F8F7"
DARK = "#111716"
TINTED = "#E4ECE8"


@dataclass(frozen=True)
class Framing:
    name: str
    zoom: float
    x: float
    y: float
    angle: float


FRAMINGS = (
    Framing("Airy", 0.72, 0.00, 0.03, 0.0),
    Framing("Balanced", 0.80, -0.01, 0.035, 0.0),
    Framing("Close", 0.88, -0.025, 0.045, 0.0),
    Framing("Lifted", 0.82, -0.015, -0.015, -2.0),
    Framing("Dynamic", 0.84, 0.015, 0.04, 3.0),
)


def load_art() -> Image.Image:
    art = Image.open(SOURCE).convert("RGBA")
    alpha = art.getchannel("A")
    # Ignore the nearly invisible antialiasing dust left by extraction.
    bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError(f"{SOURCE} contains no visible artwork")
    return art.crop(bbox)


def framed_art(art: Image.Image, size: int, framing: Framing) -> Image.Image:
    longest = max(art.size)
    scale = (size * framing.zoom) / longest
    resized = art.resize(
        (round(art.width * scale), round(art.height * scale)),
        Image.Resampling.LANCZOS,
    )
    if framing.angle:
        resized = resized.rotate(
            framing.angle,
            resample=Image.Resampling.BICUBIC,
            expand=True,
        )

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    left = round((size - resized.width) / 2 + framing.x * size)
    top = round((size - resized.height) / 2 + framing.y * size)
    layer.alpha_composite(resized, (left, top))
    return layer


def opaque_icon(art: Image.Image, size: int, framing: Framing, color: str) -> Image.Image:
    background = Image.new("RGBA", (size, size), color)
    background.alpha_composite(framed_art(art, size, framing))
    return background.convert("RGB")


def rounded_preview(icon: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, icon.width - 1, icon.height - 1),
        radius=radius,
        fill=255,
    )
    preview = icon.convert("RGBA")
    preview.putalpha(mask)
    return preview


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = (
        "/System/Library/Fonts/SFNSRounded.ttf" if bold else "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()


def write_preview(art: Image.Image, output: Path) -> None:
    tile = 260
    gap = 28
    label_width = 190
    header = 88
    footer = 44
    width = label_width + 2 * tile + 3 * gap
    height = header + len(FRAMINGS) * (tile + gap) + footer
    sheet = Image.new("RGB", (width, height), "#202522")
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 22), "RiceCal app icon framing study", fill="#F2F5F3", font=font(27, True))
    draw.text((label_width + gap + tile / 2, 56), "LIGHT", anchor="mm", fill="#B9C4BF", font=font(14, True))
    draw.text((label_width + 2 * gap + tile * 1.5, 56), "DARK", anchor="mm", fill="#B9C4BF", font=font(14, True))

    for index, framing in enumerate(FRAMINGS):
        y = header + index * (tile + gap)
        label = f"{chr(65 + index)}  {framing.name}"
        details = f"{framing.zoom:.0%} zoom  {framing.angle:+.0f} deg"
        draw.text((gap, y + tile / 2 - 16), label, anchor="lm", fill="#F2F5F3", font=font(20, True))
        draw.text((gap, y + tile / 2 + 15), details, anchor="lm", fill="#8B9A94", font=font(13))
        light = rounded_preview(opaque_icon(art, tile, framing, LIGHT), 58)
        dark = rounded_preview(opaque_icon(art, tile, framing, DARK), 58)
        sheet.paste(light, (label_width + gap, y), light)
        sheet.paste(dark, (label_width + 2 * gap + tile, y), dark)

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def monochrome_foreground(art: Image.Image, size: int, framing: Framing) -> Image.Image:
    layer = framed_art(art, size, framing)
    alpha = layer.getchannel("A")
    white = Image.new("RGBA", layer.size, "white")
    white.putalpha(alpha)
    return white


def tinted_icon(art: Image.Image, size: int, framing: Framing) -> Image.Image:
    layer = framed_art(art, size, framing)
    alpha = layer.getchannel("A")
    gray = ImageOps.grayscale(layer.convert("RGB"))
    gray = ImageEnhance.Contrast(gray).enhance(1.35)
    gray = ImageOps.colorize(gray, black="#1C3026", white="#F4F8F6").convert("RGBA")
    gray.putalpha(alpha)
    background = Image.new("RGBA", (size, size), TINTED)
    background.alpha_composite(gray)
    return background.convert("RGB")


def write_assets(art: Image.Image, framing: Framing) -> None:
    opaque_icon(art, 1024, framing, LIGHT).save(ASSETS / "icon.png", optimize=True)
    opaque_icon(art, 1024, framing, DARK).save(ASSETS / "icon-dark.png", optimize=True)
    tinted_icon(art, 1024, framing).save(ASSETS / "icon-tinted.png", optimize=True)

    adaptive_framing = Framing(
        "Android adaptive",
        0.62,
        framing.x,
        framing.y,
        framing.angle,
    )
    foreground = framed_art(art, 1024, adaptive_framing)
    foreground.save(ASSETS / "android-icon-foreground.png", optimize=True)
    monochrome_foreground(art, 1024, adaptive_framing).save(
        ASSETS / "android-icon-monochrome.png",
        optimize=True,
    )

    splash_framing = Framing("Splash", 0.86, framing.x, framing.y, framing.angle)
    framed_art(art, 474, splash_framing).save(ASSETS / "splash-icon.png", optimize=True)
    opaque_icon(art, 48, framing, LIGHT).save(ASSETS / "favicon.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--write", choices=[framing.name.lower() for framing in FRAMINGS])
    args = parser.parse_args()
    if args.preview is None and args.write is None:
        parser.error("pass --preview, --write, or both")

    art = load_art()
    if args.preview is not None:
        write_preview(art, args.preview)
    if args.write is not None:
        framing = next(item for item in FRAMINGS if item.name.lower() == args.write)
        write_assets(art, framing)


if __name__ == "__main__":
    main()
