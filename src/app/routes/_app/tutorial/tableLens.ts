import { _roots } from '@react-three/fiber/webgpu';
import { Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, Object3D, Vector3Tuple } from 'three';

import { keepInView } from './guideArrow';
import type { Target } from './guideArrow';

/** A part of the window, in its pixels. */
export type Box = Readonly<{ left: number; top: number; right: number; bottom: number }>;

/**
 * How the guide sees a table: its camera, whether that camera has come to rest, and where a point on the table shows in the window.
 * A chapter played at a table hands the guide one;
 * a chapter on the lobby pages has none, so it never loads the scene's code.
 */
export type TableLens = Readonly<{
  /** The table's camera, which the scene has only from its first frame. */
  camera: () => Camera | null;
  /** A fresh check of whether the camera has held still for a run of frames. */
  settling: () => (camera: Camera) => boolean;
  /** Where a point on the table shows within `shown`; one out of view, or behind the camera, is pointed toward from the table's edge. */
  project: (point: Vector3Tuple, shown: Box) => Target | null;
  /** The piece under a viewport point, or null when the nearest surface is not a piece. */
  pieceAt: (x: number, y: number) => string | null;
}>;

/* How many frames the camera holds still before a run's first task takes its baseline. */
const SETTLE_FRAMES = 20;

const projected = new Vector3();

const onPage = (canvas: unknown): canvas is HTMLCanvasElement =>
  canvas instanceof HTMLCanvasElement && canvas.isConnected;

/* The table's camera and canvas, read from the scene that drew it; the scene has no camera until its first frame. */
function tableView(): { camera: Camera; canvas: HTMLCanvasElement } | null {
  for (const [canvas, root] of _roots) {
    const camera = root.store.getState().camera as Camera | null;
    if (camera && onPage(canvas)) {
      return { camera, canvas };
    }
  }
  return null;
}

function settling() {
  let still = 0;
  const resting = new Vector3();
  return (camera: Camera) => {
    still = camera.position.distanceToSquared(resting) < 1e-8 ? still + 1 : 0;
    resting.copy(camera.position);
    return still >= SETTLE_FRAMES;
  };
}

function project(point: Vector3Tuple, shown: Box): Target | null {
  const view = tableView();
  if (!view) {
    return null;
  }
  const box = view.canvas.getBoundingClientRect();
  projected.set(...point).project(view.camera);
  let { x, y } = projected;
  /*
   * Behind the camera the projection comes out mirrored through the middle, and can land inside the view.
   * It is turned back to the side the point is on and pushed well past the edge, so it is always pointed toward from there;
   * one straight behind has no side, so it is pointed toward from the near edge, behind the player.
   */
  if (projected.z > 1) {
    const length = Math.hypot(x, y);
    [x, y] = length < 1e-6 ? [0, -10] : [(-x / length) * 10, (-y / length) * 10];
  }
  const visible = {
    left: Math.max(box.left, shown.left),
    top: Math.max(box.top, shown.top),
    right: Math.min(box.right, shown.right),
    bottom: Math.min(box.bottom, shown.bottom),
  };
  /* A table scrolled wholly out of the window is pointed toward from the window's edge instead. */
  const empty = visible.left >= visible.right || visible.top >= visible.bottom;
  return keepInView(
    {
      x: box.left + ((x + 1) / 2) * box.width,
      y: box.top + ((1 - y) / 2) * box.height,
      halfWidth: 0,
      halfHeight: 0,
    },
    empty ? shown : visible
  );
}

const raycaster = new Raycaster();
const pointer = new Vector2();

function pieceAt(x: number, y: number): string | null {
  for (const [canvas, root] of _roots) {
    if (!onPage(canvas)) {
      continue;
    }
    const bounds = canvas.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
      continue;
    }
    const { camera, scene } = root.store.getState();
    pointer.set(((x - bounds.left) / bounds.width) * 2 - 1, 1 - ((y - bounds.top) / bounds.height) * 2);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, true)[0];
    for (let object: Object3D | null = hit?.object ?? null; object; object = object.parent) {
      const piece = object.userData.duneTablePiece;
      if (piece && typeof piece.id === 'string') {
        return piece.id;
      }
    }
    return null;
  }
  return null;
}

/** The lens onto the table the page's scene draws. */
export const sceneTableLens: TableLens = {
  camera: () => tableView()?.camera ?? null,
  settling,
  project,
  pieceAt,
};
