"""Export one collection (or asset object) of a .blend to SVG, following collection
instances, linked objects and text. usage: export2.py file.blend name out.svg"""
import sys, json, bpy
from mathutils import Vector, Matrix
src, want, out = sys.argv[1], sys.argv[2], sys.argv[3]
show = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else set()
skip = set(sys.argv[5].split(',')) if len(sys.argv) > 5 else set()
bpy.ops.wm.open_mainfile(filepath=src)
dg = bpy.context.evaluated_depsgraph_get()
gam = lambda c: '#%02x%02x%02x' % tuple(int(round(max(0, min(1, v)) ** (1 / 2.2) * 255)) for v in c[:3])

def colour(o):
    for m in [sl.material for sl in o.material_slots]:
        if not m: continue
        if m.node_tree:
            for n in m.node_tree.nodes:
                if n.type in ('BSDF_PRINCIPLED', 'EMISSION', 'BSDF_DIFFUSE'):
                    i = n.inputs.get('Base Color') or n.inputs.get('Color')
                    if i is not None and not i.is_linked: return gam(i.default_value), m.name
        return gam(m.diffuse_color), m.name
    return '#000000', ''

def flatten(objs, M0, seen):
    for o in objs:
        if o.name in skip or (o.hide_render and o.name not in show): continue
        M = M0 @ o.matrix_world
        if o.type == 'EMPTY' and o.instance_type == 'COLLECTION' and o.instance_collection:
            c = o.instance_collection
            off = Matrix.Translation(-Vector(c.instance_offset))
            yield from flatten([x for x in c.all_objects if x.parent is None or x.parent.name not in c.all_objects], M @ off, seen)
        elif o.type in ('CURVE', 'FONT', 'GREASEPENCIL'):
            yield o, M

items = []
def add_curve(cu, M, o, z):
    ds, P = [], []
    f = lambda v: M @ Vector((v[0], v[1], 0))
    for s in cu.splines:
        if s.type == 'BEZIER' and len(s.bezier_points) > 1:
            pts = s.bezier_points; Q = [f(p.co) for p in pts]
            d = [f"M{Q[0].x:.4f} {-Q[0].y:.4f}"]
            n = len(pts) if s.use_cyclic_u else len(pts) - 1
            for i in range(n):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                h1, h2, e = f(a.handle_right), f(b.handle_left), f(b.co)
                d.append(f"C{h1.x:.4f} {-h1.y:.4f} {h2.x:.4f} {-h2.y:.4f} {e.x:.4f} {-e.y:.4f}")
            if s.use_cyclic_u: d.append('Z')
            ds.append(''.join(d)); P += Q
        elif len(s.points) > 1:
            Q = [f(p.co) for p in s.points]
            ds.append('M' + 'L'.join(f"{p.x:.4f} {-p.y:.4f}" for p in Q) + ('Z' if s.use_cyclic_u else '')); P += Q
    if not ds: return
    col, mat = colour(o)
    filled = cu.fill_mode != 'NONE' and all(s.use_cyclic_u for s in cu.splines)
    items.append(dict(z=z, d=' '.join(ds), col=col, name=o.name, filled=filled, w=cu.bevel_depth * 2, pts=P))

def add_gp(o, M, z):
    mats = [sl.material for sl in o.material_slots]
    for L in o.data.layers:
        if L.hide: continue
        fr = L.current_frame()
        if not fr or not fr.drawing: continue
        for st in fr.drawing.strokes:
            P = [M @ Vector(p.position) for p in st.points]
            if len(P) < 2: continue
            m = mats[st.material_index] if st.material_index < len(mats) else None
            g = m.grease_pencil if m else None
            d = 'M' + 'L'.join(f"{p.x:.4f} {-p.y:.4f}" for p in P) + ('Z' if st.cyclic else '')
            rad = sum(p.radius for p in st.points) / len(st.points)
            if g is None or g.show_fill:
                items.append(dict(z=z, d=d, col=gam(g.fill_color) if g else '#000000', name=o.name, filled=True, w=0, pts=P))
            if g is None or g.show_stroke:
                items.append(dict(z=z + 1e-6, d=d, col=gam(g.color) if g else '#000000', name=o.name, filled=False, w=rad * 2, pts=P))

cols = [bpy.data.collections.get(w) for w in want.split('+')]
col = cols[0]
roots = [o for c in cols for o in c.all_objects] if col else [bpy.data.objects[want]]

for o, M in flatten(roots, Matrix.Identity(4), set()):
    z = M.translation.z
    if o.type == 'CURVE': add_curve(o.data, M @ o.matrix_world.inverted() @ o.matrix_world if False else M, o, z)
    elif o.type == 'FONT':
        oe = o.evaluated_get(dg); cu = oe.to_curve(dg)
        if cu: add_curve(cu, M, o, z)
    else: add_gp(o, M, z)
items.sort(key=lambda i: i['z'])
xs = [p.x for i in items for p in i['pts']]; ys = [-p.y for i in items for p in i['pts']]
x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys); pad = 0.01 * max(x1 - x0, y1 - y0)
body = []
for i in items:
    if i['filled']: body.append(f'<path data-name="{i["name"]}" fill="{i["col"]}" fill-rule="evenodd" d="{i["d"]}"/>')
    else: body.append(f'<path data-name="{i["name"]}" fill="none" stroke="{i["col"]}" stroke-width="{max(i["w"], (x1-x0)*0.003):.4f}" stroke-linecap="round" stroke-linejoin="round" d="{i["d"]}"/>')
open(out, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0-pad:.4f} {y0-pad:.4f} {x1-x0+2*pad:.4f} {y1-y0+2*pad:.4f}">' + ''.join(body) + '</svg>')
print('OK', out, len(items))
