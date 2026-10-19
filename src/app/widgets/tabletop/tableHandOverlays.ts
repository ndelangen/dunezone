import { createElement } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import type { Camera } from 'three';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

import { advanceTablePose, retargetPoseSmoothing, snapTablePose } from './useTablePose';
import type { PoseSmoothing, ShownPose, TablePose } from './useTablePose';

/*
 * Other players' hands are page elements over the canvas, so they move without drawing the scene again.
 * They are placed the way drei's `Html` placed them before, so a hand looks just as it did in the scene:
 * the same element and wrapper, the same position, pixel rounding and stacking, and hidden behind the camera.
 */

type OverlayView = {
  camera: Camera;
  size: { width: number; height: number };
  /* What the hands are added to: where the canvas takes its events, as for drei's `Html`. */
  container: Node | null;
};

export type TableHandOverlay = {
  readonly element: HTMLDivElement;
  readonly shown: ShownPose;
  readonly target: TablePose;
  readonly smoothing: PoseSmoothing;
  root: Root | null;
  label: ReactNode;
  posed: boolean;
  /* Where the hand was last placed on the canvas, and at what zoom; drei's `Html` starts from the corner at zoom 0. */
  screen: [number, number];
  zoom: number;
  visible: boolean;
};

/* The hands stack below the table's own page elements, nearer hands in front, as `zIndexRange` gave them before. */
const HAND_Z_RANGE = [6, 0] as const;
/* A hand that moved less than this, in pixels, keeps its place, as in drei's `Html`. */
const PLACEMENT_EPSILON = 1e-3;
const OVERLAY_STYLE = 'position:absolute;top:0;left:0;transform:translate3d(0,-9999px,0);transform-origin:0 0;';
const LABEL_WRAPPER_STYLE = { position: 'absolute', transform: 'none', pointerEvents: 'none' } as const;

const projected = new Vector3();
const cameraPosition = new Vector3();
const cameraDirection = new Vector3();

function roundToPixelRatio(value: number) {
  const ratio = window.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
}

function handZIndex(hand: TableHandOverlay, camera: Camera) {
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)) {
    return undefined;
  }
  const distance = hand.shown.position.distanceTo(cameraPosition);
  const scale = (HAND_Z_RANGE[1] - HAND_Z_RANGE[0]) / (camera.far - camera.near);
  return Math.round(scale * distance + HAND_Z_RANGE[1] - scale * camera.far);
}

function placeHand(hand: TableHandOverlay, { camera, size }: OverlayView) {
  projected.copy(hand.shown.position).project(camera);
  const x = (projected.x * size.width) / 2 + size.width / 2;
  const y = -((projected.y * size.height) / 2) + size.height / 2;
  const zoom = 'zoom' in camera && typeof camera.zoom === 'number' ? camera.zoom : 1;
  const moved =
    Math.abs(hand.zoom - zoom) > PLACEMENT_EPSILON ||
    Math.abs(hand.screen[0] - x) > PLACEMENT_EPSILON ||
    Math.abs(hand.screen[1] - y) > PLACEMENT_EPSILON;
  if (!moved) {
    return;
  }
  cameraPosition.setFromMatrixPosition(camera.matrixWorld);
  const behindCamera =
    projected.subVectors(hand.shown.position, cameraPosition).angleTo(camera.getWorldDirection(cameraDirection)) >
    Math.PI / 2;
  if (hand.visible === behindCamera) {
    hand.visible = !behindCamera;
    hand.element.style.display = hand.visible ? 'block' : 'none';
  }
  hand.element.style.zIndex = `${handZIndex(hand, camera)}`;
  hand.element.style.transform = `translate3d(${roundToPixelRatio(x)}px,${roundToPixelRatio(y)}px,0) scale(1)`;
  hand.screen = [x, y];
  hand.zoom = zoom;
}

function renderLabel(hand: TableHandOverlay) {
  hand.root?.render(createElement('div', { style: LABEL_WRAPPER_STYLE }, hand.label));
}

/*
 * The hands on one table, smoothed in their own animation frames while any of them moves, and placed again in every scene frame,
 * which follows the camera. Each frame's step is timed as the scene's scheduler times its own frames, so a hand glides as it did there.
 */
export class TableHandOverlays {
  private readonly hands = new Set<TableHandOverlay>();
  private view: OverlayView | null = null;
  private frame: number | null = null;
  /* Whether the next frame continues a run of frames, rather than starting one after the hands were still. */
  private running = false;
  private lastFrameTime: number | null = null;
  private lastFrameDelta: number | null = null;

  add(): TableHandOverlay {
    const element = document.createElement('div');
    element.style.cssText = OVERLAY_STYLE;
    const hand: TableHandOverlay = {
      element,
      shown: { position: new Vector3(), rotation: { y: 0 } },
      target: { position: new Vector3(), orientation: 0 },
      smoothing: { active: false, wasRemote: false },
      root: createRoot(element),
      label: null,
      posed: false,
      screen: [0, 0],
      zoom: 0,
      visible: true,
    };
    this.hands.add(hand);
    this.view?.container?.appendChild(element);
    return hand;
  }

  remove(hand: TableHandOverlay) {
    this.hands.delete(hand);
    hand.element.remove();
    const { root } = hand;
    hand.root = null;
    /* A root cannot be unmounted while React commits the hand that owned it. */
    queueMicrotask(() => root?.unmount());
  }

  render(hand: TableHandOverlay, label: ReactNode) {
    hand.label = label;
    renderLabel(hand);
  }

  /* A remote pose glides to each new target, as `useTablePose` has it glide, from where the hand first appears. */
  moveTo(hand: TableHandOverlay, x: number, y: number, z: number) {
    hand.target.position.set(x, y, z);
    if (hand.posed) {
      retargetPoseSmoothing(hand.smoothing, true, false);
    } else {
      snapTablePose(hand.shown, hand.target);
      hand.posed = true;
    }
    this.request();
  }

  setView(view: OverlayView) {
    const moved = view.container !== this.view?.container;
    this.view = view;
    if (moved) {
      for (const hand of this.hands) {
        if (view.container) {
          view.container.appendChild(hand.element);
        } else {
          hand.element.remove();
        }
      }
    }
    this.request();
  }

  /* Places every hand through the camera as the scene shows it; the scene calls this in each of its frames. */
  place() {
    const { view } = this;
    if (!view || this.hands.size === 0) {
      return;
    }
    view.camera.updateMatrixWorld();
    for (const hand of this.hands) {
      placeHand(hand, view);
    }
  }

  dispose() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.running = false;
  }

  private request() {
    if (this.frame === null) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  private frameDelta(time: number) {
    const elapsed = this.lastFrameTime === null ? null : Math.max(0, (time - this.lastFrameTime) / 1000);
    this.lastFrameTime = time;
    if (elapsed === null) {
      return 0;
    }
    /* The first frame after the hands were still counts for no longer than the last frame that ran, as in the scene's scheduler. */
    if (!this.running) {
      return Math.min(elapsed, this.lastFrameDelta ?? 0);
    }
    if (elapsed > 0) {
      this.lastFrameDelta = elapsed;
    }
    return elapsed;
  }

  private readonly tick = (time: number) => {
    this.frame = null;
    const delta = this.frameDelta(time);
    let moving = false;
    for (const hand of this.hands) {
      if (hand.smoothing.active) {
        hand.smoothing.active = advanceTablePose(hand.shown, hand.target, delta);
        moving ||= hand.smoothing.active;
      }
    }
    this.place();
    this.running = moving;
    if (moving) {
      this.request();
    }
  };
}
