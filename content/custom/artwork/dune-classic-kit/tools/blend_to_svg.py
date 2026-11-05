"""Export one collection (or asset object) of a .blend to SVG.

Follows collection instances, linked objects and text. Run inside Blender:

    blender -b --python blend_to_svg.py -- file.blend name out.svg [show,names] [skip,names]

`name` may join several collections with `+`. Hidden objects listed in `show` are exported;
objects listed in `skip` are left out.
"""

import sys

import bpy
from mathutils import Matrix, Vector

SHADER_NODES = ('BSDF_PRINCIPLED', 'EMISSION', 'BSDF_DIFFUSE')
DRAWABLE = ('CURVE', 'FONT', 'GREASEPENCIL')
BLACK = '#000000'


def gamma_hex(rgb):
    """Linear Blender colour to an sRGB hex string."""
    return '#%02x%02x%02x' % tuple(int(round(max(0, min(1, v)) ** (1 / 2.2) * 255)) for v in rgb[:3])


def node_colour(material):
    """Base colour of the first unlinked shader node, or None."""
    if not material.node_tree:
        return None
    for node in material.node_tree.nodes:
        if node.type not in SHADER_NODES:
            continue
        socket = node.inputs.get('Base Color') or node.inputs.get('Color')
        if socket is not None and not socket.is_linked:
            return gamma_hex(socket.default_value)
    return None


def colour(obj):
    """Fill colour of an object's first material."""
    material = next((slot.material for slot in obj.material_slots if slot.material), None)
    if material is None:
        return BLACK
    return node_colour(material) or gamma_hex(material.diffuse_color)


def is_exported(obj, show, skip):
    if obj.name in skip:
        return False
    return not obj.hide_render or obj.name in show


def instance_roots(collection):
    """Top-level objects of an instanced collection."""
    members = collection.all_objects
    return [o for o in members if o.parent is None or o.parent.name not in members]


def flatten(objs, parent_matrix, show, skip):
    """Yield every drawable object with its world matrix, expanding collection instances."""
    for obj in objs:
        if not is_exported(obj, show, skip):
            continue
        matrix = parent_matrix @ obj.matrix_world
        instanced = obj.type == 'EMPTY' and obj.instance_type == 'COLLECTION' and obj.instance_collection
        if instanced:
            collection = obj.instance_collection
            offset = Matrix.Translation(-Vector(collection.instance_offset))
            yield from flatten(instance_roots(collection), matrix @ offset, show, skip)
        elif obj.type in DRAWABLE:
            yield obj, matrix


def fmt(point):
    """SVG coordinates (y flipped) of a projected point."""
    return f'{point.x:.4f} {-point.y:.4f}'


def bezier_path(spline, project):
    points = spline.bezier_points
    anchors = [project(p.co) for p in points]
    parts = [f'M{fmt(anchors[0])}']
    count = len(points) if spline.use_cyclic_u else len(points) - 1
    for i in range(count):
        start, end = points[i], points[(i + 1) % len(points)]
        parts.append(f'C{fmt(project(start.handle_right))} {fmt(project(end.handle_left))} {fmt(project(end.co))}')
    if spline.use_cyclic_u:
        parts.append('Z')
    return ''.join(parts), anchors


def poly_path(points, cyclic):
    return 'M' + 'L'.join(fmt(p) for p in points) + ('Z' if cyclic else '')


def spline_path(spline, project):
    """Path data and anchor points of one spline, or None when it has too few points."""
    if spline.type == 'BEZIER':
        if len(spline.bezier_points) < 2:
            return None
        return bezier_path(spline, project)
    if len(spline.points) < 2:
        return None
    anchors = [project(p.co) for p in spline.points]
    return poly_path(anchors, spline.use_cyclic_u), anchors


def curve_items(curve, matrix, obj, z):
    project = lambda v: matrix @ Vector((v[0], v[1], 0))
    paths = [p for p in (spline_path(s, project) for s in curve.splines) if p]
    if not paths:
        return []
    filled = curve.fill_mode != 'NONE' and all(s.use_cyclic_u for s in curve.splines)
    return [
        dict(
            z=z,
            d=' '.join(d for d, _ in paths),
            col=colour(obj),
            name=obj.name,
            filled=filled,
            w=curve.bevel_depth * 2,
            pts=[p for _, anchors in paths for p in anchors],
        )
    ]


def stroke_items(stroke, matrix, materials, obj, z):
    points = [matrix @ Vector(p.position) for p in stroke.points]
    if len(points) < 2:
        return []
    material = materials[stroke.material_index] if stroke.material_index < len(materials) else None
    style = material.grease_pencil if material else None
    d = poly_path(points, stroke.cyclic)
    items = []
    if style is None or style.show_fill:
        fill = gamma_hex(style.fill_color) if style else BLACK
        items.append(dict(z=z, d=d, col=fill, name=obj.name, filled=True, w=0, pts=points))
    if style is None or style.show_stroke:
        width = 2 * sum(p.radius for p in stroke.points) / len(stroke.points)
        line = gamma_hex(style.color) if style else BLACK
        items.append(dict(z=z + 1e-6, d=d, col=line, name=obj.name, filled=False, w=width, pts=points))
    return items


def visible_drawings(layers):
    for layer in layers:
        frame = None if layer.hide else layer.current_frame()
        if frame and frame.drawing:
            yield frame.drawing


def grease_pencil_items(obj, matrix, z):
    materials = [slot.material for slot in obj.material_slots]
    return [
        item
        for drawing in visible_drawings(obj.data.layers)
        for stroke in drawing.strokes
        for item in stroke_items(stroke, matrix, materials, obj, z)
    ]


def object_items(obj, matrix, depsgraph):
    z = matrix.translation.z
    if obj.type == 'CURVE':
        return curve_items(obj.data, matrix, obj, z)
    if obj.type == 'FONT':
        curve = obj.evaluated_get(depsgraph).to_curve(depsgraph)
        return curve_items(curve, matrix, obj, z) if curve else []
    return grease_pencil_items(obj, matrix, z)


def roots_for(want):
    collections = [bpy.data.collections.get(name) for name in want.split('+')]
    if collections[0]:
        return [o for c in collections for o in c.all_objects]
    return [bpy.data.objects[want]]


def path_element(item, min_width):
    if item['filled']:
        return f'<path data-name="{item["name"]}" fill="{item["col"]}" fill-rule="evenodd" d="{item["d"]}"/>'
    width = max(item['w'], min_width)
    return (
        f'<path data-name="{item["name"]}" fill="none" stroke="{item["col"]}" stroke-width="{width:.4f}" '
        f'stroke-linecap="round" stroke-linejoin="round" d="{item["d"]}"/>'
    )


def render_svg(items):
    xs = [p.x for i in items for p in i['pts']]
    ys = [-p.y for i in items for p in i['pts']]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    pad = 0.01 * max(x1 - x0, y1 - y0)
    body = ''.join(path_element(i, (x1 - x0) * 0.003) for i in items)
    view = f'{x0 - pad:.4f} {y0 - pad:.4f} {x1 - x0 + 2 * pad:.4f} {y1 - y0 + 2 * pad:.4f}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{body}</svg>'


def name_set(args, index):
    return set(args[index].split(',')) if len(args) > index else set()


def main(args):
    src, want, out = args[0], args[1], args[2]
    show, skip = name_set(args, 3), name_set(args, 4)
    bpy.ops.wm.open_mainfile(filepath=src)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    items = [
        item
        for obj, matrix in flatten(roots_for(want), Matrix.Identity(4), show, skip)
        for item in object_items(obj, matrix, depsgraph)
    ]
    items.sort(key=lambda i: i['z'])
    with open(out, 'w') as handle:
        handle.write(render_svg(items))
    print('OK', out, len(items))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
    main(argv)
