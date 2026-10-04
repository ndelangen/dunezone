import { Vector3 } from 'three';
import type { Camera, Object3D } from 'three';

/* Room for the bidder's face, its timer chip included, between its centre and the canvas edge. */
const FACE_EDGE_MARGIN_PX = 72;
const projected = new Vector3();

/**
 * Where the bidder's face sits on the canvas: over the bidder's centre, held inside the canvas edge.
 * The Bidding phase opens on the left side view, which on a narrow window frames the card bay and leaves the board's centre off the canvas, so the face would be out of reach and turns would run out (#1825).
 */
export function faceOnCanvas(el: Object3D, camera: Camera, size: { width: number; height: number }): [number, number] {
  projected.setFromMatrixPosition(el.matrixWorld).project(camera);
  const clamp = (value: number, extent: number) =>
    Math.min(Math.max(value, FACE_EDGE_MARGIN_PX), Math.max(FACE_EDGE_MARGIN_PX, extent - FACE_EDGE_MARGIN_PX));
  return [
    clamp(((projected.x + 1) / 2) * size.width, size.width),
    clamp(((1 - projected.y) / 2) * size.height, size.height),
  ];
}
