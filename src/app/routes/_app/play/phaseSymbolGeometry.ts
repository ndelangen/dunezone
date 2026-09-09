import { ExtrudeGeometry, Path, Shape, Vector3 } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';

import { PHASE_RING_INNER_RADIUS, PHASE_RING_OUTER_RADIUS, PHASE_SYMBOL_MAX_RADIUS } from './phaseSymbolLayout';

export const PHASE_SYMBOL_HEIGHT = 0.025;
const PHASE_SYMBOL_FLOOR_GAP = 0.002;

function placeAbovePhaseWell(geometry: ExtrudeGeometry): ExtrudeGeometry {
  /* SVG top becomes the far edge of the table without reflecting the solid or reversing its faces. */
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, PHASE_SYMBOL_HEIGHT + PHASE_SYMBOL_FLOOR_GAP, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPhaseRingGeometry(wellRadius: number): ExtrudeGeometry {
  const shape = new Shape();
  shape.absarc(0, 0, wellRadius * PHASE_RING_OUTER_RADIUS, 0, Math.PI * 2, false);
  const hole = new Path();
  hole.absarc(0, 0, wellRadius * PHASE_RING_INNER_RADIUS, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return placeAbovePhaseWell(
    new ExtrudeGeometry(shape, {
      depth: PHASE_SYMBOL_HEIGHT,
      bevelEnabled: false,
      curveSegments: 48,
      steps: 1,
    })
  );
}

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

function filledShapes(svg: SVGResult): Shape[] {
  return svg.paths.flatMap((path) => {
    const style = path.userData.style;
    const unfilled = typeof style === 'object' && style !== null && 'fill' in style && style.fill === 'none';
    return unfilled ? [] : path.toShapes();
  });
}

function fitWithinPhaseWell(geometry: ExtrudeGeometry, wellRadius: number): ExtrudeGeometry | null {
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

  const scale = (wellRadius * PHASE_SYMBOL_MAX_RADIUS) / radius;
  geometry.scale(scale, scale, 1);
  return geometry;
}

export function createPhaseSymbolGeometry(svg: SVGResult, wellRadius: number): ExtrudeGeometry | null {
  const shapes = filledShapes(svg);
  if (shapes.length === 0 || !Number.isFinite(wellRadius) || wellRadius <= 0) {
    return null;
  }

  const geometry = new ExtrudeGeometry(shapes, {
    depth: PHASE_SYMBOL_HEIGHT,
    bevelEnabled: false,
    curveSegments: 16,
    steps: 1,
  });
  const fittedGeometry = fitWithinPhaseWell(geometry, wellRadius);
  return fittedGeometry ? placeAbovePhaseWell(fittedGeometry) : null;
}
