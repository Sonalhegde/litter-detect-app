"""Generate harmless local image fixtures for manual robustness checks; generated files are not committed."""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageFilter


def make_gradient(size: tuple[int, int]) -> Image.Image:
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(size[1]):
        for x in range(size[0]):
            pixels[x, y] = (round(255 * x / max(1, size[0] - 1)), round(255 * y / max(1, size[1] - 1)), 120)
    return image


def write_fixtures(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (640, 480), "black").save(output_dir / "black.png")
    Image.new("RGB", (640, 480), "white").save(output_dir / "white.png")
    make_gradient((640, 480)).save(output_dir / "gradient.png")
    Image.new("RGB", (8, 8), "navy").save(output_dir / "tiny.png")
    noise = Image.frombytes("RGB", (640, 480), bytes(random.Random(26).randrange(256) for _ in range(640 * 480 * 3)))
    noise.save(output_dir / "noise.jpg", quality=35, optimize=True)
    noise.filter(ImageFilter.GaussianBlur(radius=3)).save(output_dir / "blurred.png")
    make_gradient((480, 640)).rotate(90, expand=True).save(output_dir / "rotated.png")
    make_gradient((1600, 1200)).save(output_dir / "large.png", optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate safe BlueSentinel image fixtures.")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "assets" / "generated")
    args = parser.parse_args()
    write_fixtures(args.output_dir)
    print(f"Generated safe fixtures in {args.output_dir}")
