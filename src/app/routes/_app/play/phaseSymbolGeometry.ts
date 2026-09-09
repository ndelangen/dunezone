import { ExtrudeGeometry, Vector3 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';

export const PHASE_SYMBOL_HEIGHT = 0.025;
const PHASE_SYMBOL_FLOOR_GAP = 0.002;
const PHASE_SYMBOL_RADIUS_FRACTION = 0.82;

export function loadPhaseSymbolGeometry(
  symbol: string,
  radius: number,
  onLoaded: (geometry: ExtrudeGeometry | null) => void
): () => void {
  let cancelled = false;
  let ownedGeometry: ExtrudeGeometry | null = null;
  void new SVGLoader()
    .loadAsync(symbol)
    .then((svg) => {
      if (cancelled) {
        return;
      }
      ownedGeometry = createPhaseSymbolGeometry(svg, radius);
      onLoaded(ownedGeometry);
    })
    .catch(() => {
      /* An unavailable symbol leaves its colored well visible instead of suspending the table. */
    });
  return () => {
    cancelled = true;
    ownedGeometry?.dispose();
    ownedGeometry = null;
  };
}

export function createPhaseSymbolGeometry(svg: SVGResult, wellRadius: number): ExtrudeGeometry | null {
  const shapes = svg.paths.flatMap((path) => {
    const style = path.userData.style;
    const unfilled = typeof style === 'object' && style !== null && 'fill' in style && style.fill === 'none';
    return unfilled ? [] : path.toShapes();
  });
  if (shapes.length === 0 || !Number.isFinite(wellRadius) || wellRadius <= 0) {
    return null;
  }

  const geometry = new ExtrudeGeometry(shapes, {
    depth: PHASE_SYMBOL_HEIGHT,
    bevelEnabled: false,
    curveSegments: 16,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, 0);
  const position = geometry.getAttribute('position');
  let radius = 0;
  for (let index = 0; index < position.count; index += 1) {
    radius = Math.max(radius, Math.hypot(position.getX(index), position.getY(index)));
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    geometry.dispose();
    return null;
  }

  const scale = (wellRadius * PHASE_SYMBOL_RADIUS_FRACTION) / radius;
  geometry.scale(scale, scale, 1);
  /* SVG top becomes the far edge of the table without reflecting the solid or reversing its faces. */
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, PHASE_SYMBOL_HEIGHT + PHASE_SYMBOL_FLOOR_GAP, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
