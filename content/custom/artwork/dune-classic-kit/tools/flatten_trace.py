"""Flatten a coloured Blender export to one recolourable path.
usage: mono.py in.svg out.svg authored-text [long_side_px]
Dark paint (luminance < 0.5) becomes ink and light paint becomes paper. Renders anti-aliased
at long_side_px, thresholds at 0.5, traces with potracer, and scales to a 100-unit long side."""
import sys, re, io
import numpy as np, cairosvg, potrace
from PIL import Image
src, out, authored = sys.argv[1], sys.argv[2], sys.argv[3]
L = int(sys.argv[4]) if len(sys.argv) > 4 else 4000
s = open(src).read()
def mono(m):
    h = m.group(2); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return f'{m.group(1)}="{"#000000" if 0.2126*r + 0.7152*g + 0.0722*b < 0.5 else "#ffffff"}"'
s = re.sub(r'(fill|stroke)="#([0-9a-f]{6})"', mono, s)
vb = [float(x) for x in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
w, h = vb[2], vb[3]
W, H = (L, round(L * h / w)) if w >= h else (round(L * w / h), L)
png = cairosvg.svg2png(bytestring=s.encode(), output_width=W, output_height=H, background_color='white')
g = np.array(Image.open(io.BytesIO(png)).convert('L'))
mask = g < 128
plist = potrace.Bitmap(~mask).trace(turdsize=int(L * L / 4e6 * 4), alphamax=1.0, opticurve=True, opttolerance=0.2)
k = 100 / max(W, H)
f = lambda p: f"{p.x * k:.3f} {p.y * k:.3f}"
parts = []
for c in plist:
    d = ['M' + f(c.start_point)]
    for sg in c.segments:
        d.append(f"L{f(sg.c)}L{f(sg.end_point)}" if sg.is_corner else f"C{f(sg.c1)} {f(sg.c2)} {f(sg.end_point)}")
    parts.append(''.join(d) + 'Z')
VW, VH = W * k, H * k
open(out, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" id="root" data-authored="{authored}" viewBox="0 0 {VW:.3f} {VH:.3f}">\n  <path fill-rule="evenodd" d="{"".join(parts)}"/>\n</svg>\n')
print(out, len(plist), 'curves', W, H)
