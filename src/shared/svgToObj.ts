import { ExtrudeGeometry, Group, Matrix4, Mesh } from 'three';
import type { BufferGeometry } from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * SVG string → Wavefront OBJ text, ported verbatim-in-spirit from the authoring tool's
 * `src/lib/obj/svgToObj.ts` (moving in-repo per the tool↔repo decision, #298). Headless determinism
 * is spike-verified (#295): byte-identical across Bun/Node × jsdom/linkedom — the caller must
 * register a `DOMParser` global before use (SVGLoader parses via it).
 *
 * Pipeline: SVGLoader paths → shapes → ExtrudeGeometry (flat extrusion) → Y-up correction → lay
 * flat on the XZ ground plane → OBJExporter, then precision trim.
 */

export type ObjExportOptions = {
  /** Extrusion thickness (height above ground once laid flat). */
  depth: number;
  /** Curve subdivision for bezier/arc segments. Lower = fewer triangles. */
  curveSegments: number;
  /** Decimal places per coordinate — full float precision is a ~17-digit bloat. */
  precision: number;
  /** Weld duplicate vertices into an indexed mesh (the biggest size reduction). */
  weld: boolean;
  /** Emit per-vertex normals (vn). Disable for the smallest files. */
  includeNormals: boolean;
};

const DEFAULT_OBJ_OPTIONS: ObjExportOptions = {
  depth: 10,
  curveSegments: 12,
  precision: 4,
  weld: true,
  includeNormals: true,
};

/** Trim float coordinates in OBJ text; face indices are integers and untouched. */
function trimObjPrecision(obj: string, precision: number): string {
  const places = Math.max(0, Math.min(10, Math.floor(precision)));
  return obj.replace(/-?\d*\.\d+(?:e[-+]?\d+)?/gi, (token) => {
    const value = Number.parseFloat(token);
    if (!Number.isFinite(value)) {
      return token;
    }
    let trimmed = value.toFixed(places).replace(/\.?0+$/, '');
    if (trimmed === '' || trimmed === '-0') {
      trimmed = '0';
    }
    return trimmed;
  });
}

/** SVG Y grows downward; OBJ/Three expect Y-up. Map y' = height − y. */
function svgToYUpMatrix(height: number): Matrix4 {
  return new Matrix4().makeTranslation(0, height, 0).multiply(new Matrix4().makeScale(1, -1, 1));
}

/** ExtrudeGeometry builds in XY extruding +Z; Rx(−90°) lays it flat on XZ, thickness on +Y. */
function layFlatMatrix(): Matrix4 {
  return new Matrix4().makeRotationX(-Math.PI / 2);
}

/** Reverse triangle winding (the negative-Y scale inverts it, making solids inside-out). */
function flipFaceWinding(geometry: BufferGeometry): void {
  const attributes = ['position', 'normal', 'uv']
    .map((name) => geometry.getAttribute(name))
    .filter((attribute) => attribute !== undefined);
  const stride = attributes[0]?.count ?? 0;
  for (let index = 0; index < stride; index += 3) {
    for (const attribute of attributes) {
      const bx = attribute.getX(index + 1);
      const by = attribute.getY(index + 1);
      const bz = attribute.getZ(index + 1);
      attribute.setXYZ(
        index + 1,
        attribute.getX(index + 2),
        attribute.getY(index + 2),
        attribute.getZ(index + 2)
      );
      attribute.setXYZ(index + 2, bx, by, bz);
    }
  }
}

function readSvgHeight(svg: string): number {
  const match = svg.match(/viewBox=["']([^"']+)["']/);
  if (match) {
    const parts = match[1]!
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter(Number.isFinite);
    if (parts.length >= 4 && parts[3]! > 0) {
      return parts[3]!;
    }
  }
  return 0;
}

export function svgToObj(svg: string, partialOptions: Partial<ObjExportOptions> = {}): string {
  const options: ObjExportOptions = { ...DEFAULT_OBJ_OPTIONS, ...partialOptions };
  const loader = new SVGLoader();
  const parsed = loader.parse(svg);
  const svgHeight = readSvgHeight(svg);
  const yUpMatrix = svgHeight > 0 ? svgToYUpMatrix(svgHeight) : null;

  const group = new Group();
  for (const path of parsed.paths) {
    for (const shape of path.toShapes()) {
      let geometry: BufferGeometry = new ExtrudeGeometry(shape, {
        depth: options.depth,
        bevelEnabled: false,
        curveSegments: options.curveSegments,
      });
      if (yUpMatrix) {
        geometry.applyMatrix4(yUpMatrix);
        flipFaceWinding(geometry);
      }
      geometry.applyMatrix4(layFlatMatrix());

      // UVs are useless for a solid export: they bloat the file and block vertex welding.
      geometry.deleteAttribute('uv');
      if (options.includeNormals) {
        // Flat normals before welding keep cap/wall edges sharp (weld merges position+normal).
        geometry.computeVertexNormals();
      } else {
        geometry.deleteAttribute('normal');
      }
      if (options.weld) {
        const merged = mergeVertices(geometry);
        geometry.dispose();
        geometry = merged;
      }
      group.add(new Mesh(geometry));
    }
  }

  const exporter = new OBJExporter();
  const obj = trimObjPrecision(exporter.parse(group), options.precision);
  group.traverse((child) => {
    (child as { geometry?: { dispose?: () => void } }).geometry?.dispose?.();
  });
  return obj;
}
