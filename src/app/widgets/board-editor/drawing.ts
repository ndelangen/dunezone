import { distance } from '@shared/boards/geometry';
import type { Edge } from '@shared/boards/geometry';

import type { BoardEditorState } from './state';

type DrawingPoints = BoardEditorState['points'];

/** Whether the points placed so far finish the tool's stroke: four for a cubic, three for an arc, and a line once it returns to its first point. */
export function drawingComplete(tool: BoardEditorState['tool'], points: DrawingPoints) {
  switch (tool) {
    case 'cubic':
      return points.length === 4;
    case 'arc':
      return points.length === 3;
    case 'line':
      return points.length > 2 && points.at(-1)!.node === points[0].node;
    default:
      return false;
  }
}
/**
 * The arc through three placed points, as the SVG arc flags of the circle they lie on.
 * The radius is the triangle's circumradius, the large-arc flag says whether the bend lies beyond a semicircle, and the sweep follows the side the bend is on.
 */
function circularEdge(points: DrawingPoints): Edge {
  const [a, m, b] = points.map((p) => p.point);
  const ab = distance(a, b),
    am = distance(a, m),
    mb = distance(m, b);
  const cross = (m[0] - a[0]) * (b[1] - a[1]) - (m[1] - a[1]) * (b[0] - a[0]);
  if (Math.abs(cross) < 0.001) {
    throw new Error('Choose a bend away from the straight line');
  }
  const radius = (ab * am * mb) / (2 * Math.abs(cross));
  const dot = (a[0] - m[0]) * (b[0] - m[0]) + (a[1] - m[1]) * (b[1] - m[1]);
  return {
    id: `arc-${crypto.randomUUID()}`,
    a: points[0].node!,
    b: points[2].node!,
    kind: 'arc',
    arc: [radius, radius, 0, dot > 0 ? 1 : 0, cross > 0 ? 1 : 0],
  };
}
/** The edge the latest placed point adds for the tool, or null while the stroke has none to add yet. */
export function drawingEdge(tool: BoardEditorState['tool'], points: DrawingPoints): Edge | null {
  switch (tool) {
    case 'line': {
      if (points.length < 2) {
        return null;
      }
      const a = points.at(-2)!.node!,
        b = points.at(-1)!.node!;
      return a === b ? null : { id: `cut-${crypto.randomUUID()}`, a, b, kind: 'line' };
    }
    case 'cubic':
      return points.length === 4
        ? {
            id: `curve-${crypto.randomUUID()}`,
            a: points[0].node!,
            b: points[3].node!,
            kind: 'cubic',
            c1: points[1].point,
            c2: points[2].point,
          }
        : null;
    case 'arc':
      return points.length === 3 ? circularEdge(points) : null;
    default:
      return null;
  }
}
