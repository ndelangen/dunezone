"""Flatten a coloured Blender export to one recolourable path.

    python flatten_trace.py in.svg out.svg authored-text [long_side_px]

Dark paint (luminance < 0.5) becomes ink and light paint becomes paper. Renders anti-aliased
at long_side_px, thresholds at 0.5, traces with potracer, and scales to a 100-unit long side.
Input and output paths must lie inside the working directory.
"""

import io
import os
import re
import sys

import cairosvg
import numpy as np
import potrace
from PIL import Image

PAINT = re.compile(r'(fill|stroke)="#([0-9a-f]{6})"')


def within_cwd(path):
    """Resolve a command-line path, refusing anything outside the working directory."""
    root = os.path.realpath(os.getcwd())
    resolved = os.path.realpath(path)
    if os.path.commonpath([root, resolved]) != root:
        raise SystemExit(f'{path}: must be inside {root}')
    return resolved


def to_ink_or_paper(match):
    hex_colour = match.group(2)
    r, g, b = (int(hex_colour[i : i + 2], 16) / 255 for i in (0, 2, 4))
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return f'{match.group(1)}="{"#000000" if luminance < 0.5 else "#ffffff"}"'


def raster_size(svg, long_side):
    _, _, w, h = (float(x) for x in re.search(r'viewBox="([^"]+)"', svg).group(1).split())
    return (long_side, round(long_side * h / w)) if w >= h else (round(long_side * w / h), long_side)


def ink_mask(svg, width, height):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=width, output_height=height, background_color='white')
    return np.array(Image.open(io.BytesIO(png)).convert('L')) < 128


def curve_path(curve, scale):
    fmt = lambda p: f'{p.x * scale:.3f} {p.y * scale:.3f}'
    parts = ['M' + fmt(curve.start_point)]
    for seg in curve.segments:
        if seg.is_corner:
            parts.append(f'L{fmt(seg.c)}L{fmt(seg.end_point)}')
        else:
            parts.append(f'C{fmt(seg.c1)} {fmt(seg.c2)} {fmt(seg.end_point)}')
    return ''.join(parts) + 'Z'


def main(args):
    src, out, authored = within_cwd(args[0]), within_cwd(args[1]), args[2]
    long_side = int(args[3]) if len(args) > 3 else 4000
    with open(src) as handle:
        svg = PAINT.sub(to_ink_or_paper, handle.read())
    width, height = raster_size(svg, long_side)
    mask = ink_mask(svg, width, height)
    curves = potrace.Bitmap(~mask).trace(
        turdsize=int(long_side * long_side / 4e6 * 4), alphamax=1.0, opticurve=True, opttolerance=0.2
    )
    scale = 100 / max(width, height)
    d = ''.join(curve_path(c, scale) for c in curves)
    view = f'0 0 {width * scale:.3f} {height * scale:.3f}'
    with open(out, 'w') as handle:
        handle.write(
            f'<svg xmlns="http://www.w3.org/2000/svg" id="root" data-authored="{authored}" viewBox="{view}">\n'
            f'  <path fill-rule="evenodd" d="{d}"/>\n</svg>\n'
        )
    print(out, len(curves), 'curves', width, height)


if __name__ == '__main__':
    main(sys.argv[1:])
