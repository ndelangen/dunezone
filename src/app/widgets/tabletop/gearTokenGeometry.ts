import { GEAR_OUTLINE } from '@shared/assets/tokenOutline';
import { ExtrudeGeometry, Shape, ShapeGeometry, Vector2 } from 'three';

/*
 * A tech token's gear in a face's plane at `radius`, as the page draws it: a face lays its plane flat by turning it
 * about x, which carries the page's y down to the table's +z, so the outline's y is negated here. `mirrored` flips it
 * left for right, for the underside, which a half turn about the plane's normal and then over shows the other way round.
 */
function gearShape(radius: number, mirrored: boolean): Shape {
  const side = mirrored ? -1 : 1;
  return new Shape(GEAR_OUTLINE.map(([x, y]) => new Vector2(side * x * radius, -y * radius)));
}

/** A tech token's flat face, its image coordinates spanning the gear's outer circle as a disc's span its circle, so the art lies as the page cuts it. */
export function gearFaceGeometry(radius: number, mirrored: boolean): ShapeGeometry {
  const geometry = new ShapeGeometry(gearShape(radius, mirrored), 1);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, position.getX(index) / (radius * 2) + 0.5, position.getY(index) / (radius * 2) + 0.5);
  }
  return geometry;
}

/** A tech token's gear standing like a cylinder: `height` is its thickness along y, centred on the origin. */
export function gearSlabGeometry(radius: number, height: number): ExtrudeGeometry {
  return new ExtrudeGeometry(gearShape(radius, false), { depth: height, bevelEnabled: false, curveSegments: 1 })
    .translate(0, 0, -height / 2)
    .rotateX(-Math.PI / 2);
}
