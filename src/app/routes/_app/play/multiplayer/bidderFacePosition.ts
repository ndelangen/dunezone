import { Vector3 } from 'three';
import type { Camera, Object3D } from 'three';

/* Room for the bidder's face during a round, the disc and its timer chip, between its centre and the canvas edge. */
const ROUND_HALF_WIDTH_PX = 72;
/* The face between rounds stacks the result, its label and the faction row, so it is taller than the round's. */
const FACE_HALF_HEIGHT_PX = 96;
/* The start-at row: a 36px button per faction 4px apart, under a label about 230px wide, wrapping after six buttons (`Bidder.module.css`). */
export const PICKS_PER_LINE = 6;
const PICK_PX = 36;
const PICK_GAP_PX = 4;
const LABEL_PX = 230;
const EDGE_PX = 8;
const projected = new Vector3();

/** Half the width of the bidder's face: the round's disc, or between rounds the wider of the start-at row and its label. */
export function faceHalfWidth(factions: number | null): number {
  if (factions === null) {
    return ROUND_HALF_WIDTH_PX;
  }
  const perLine = Math.min(factions, PICKS_PER_LINE);
  const row = perLine * PICK_PX + Math.max(0, perLine - 1) * PICK_GAP_PX;
  return Math.max(ROUND_HALF_WIDTH_PX, Math.max(row, LABEL_PX) / 2 + EDGE_PX);
}

/** Half the height of the bidder's face: every line of the start-at row past the first adds a button's height. */
export function faceHalfHeight(factions: number | null): number {
  const lines = factions === null ? 1 : Math.max(1, Math.ceil(factions / PICKS_PER_LINE));
  return FACE_HALF_HEIGHT_PX + ((lines - 1) * (PICK_PX + PICK_GAP_PX)) / 2;
}

function clamp(value: number, extent: number, margin: number) {
  return Math.min(Math.max(value, margin), Math.max(margin, extent - margin));
}

/**
 * Where the bidder's face sits on the canvas: over the bidder's centre, held far enough inside the canvas edge that the whole face shows.
 * The Bidding phase opens on the left side view, which on a narrow window frames the card bay and leaves the board's centre off the canvas, so the face would be out of reach and turns would run out (#1825).
 */
export function faceOnCanvas(halfWidth: number, halfHeight = FACE_HALF_HEIGHT_PX) {
  return (el: Object3D, camera: Camera, size: { width: number; height: number }): [number, number] => {
    projected.setFromMatrixPosition(el.matrixWorld).project(camera);
    return [
      clamp(((projected.x + 1) / 2) * size.width, size.width, halfWidth),
      clamp(((1 - projected.y) / 2) * size.height, size.height, halfHeight),
    ];
  };
}
