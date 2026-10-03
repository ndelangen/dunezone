import { OrbitControls } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Fog, Vector3 } from 'three';
import type { Camera } from 'three';

import {
  CAMERA_TOP_DOWN_POLAR_ANGLE,
  cameraFogRange,
  cameraPoseFor,
  cameraTiltAfterWheel,
  cameraViewTransitionProgress,
  cameraZoomAfterPan,
  cameraTiltForZoom,
  CAMERA_PAN_AT_REST,
  cameraPanMotionAfter,
  cameraZoomAfterPanMotion,
  cameraZoomAfterWheelAt,
  mapViewTopLimitForViewport,
  NO_CAMERA_ZOOM,
  tablePointUnder,
  zoomedCameraPose,
} from './playView';
import type { CameraPanMotion, CameraPose, CameraViewCommand, CameraZoom } from './playView';
import { usePointerSession } from './PointerSessionContext';
import { TableKeyboardContext } from './TableKeyboardContext';
import { useTableDragPan } from './tablePan';
import { useTabletopReader } from './TabletopContext';
import { watchTwoFingerTilt } from './twoFingerTilt';

const CAMERA_POSE_EPSILON_SQUARED = 0.000001;
/* How quickly a close look follows the wheel: the share of the way left after a second's glide is e^(-1/τ). */
const CAMERA_GLIDE_TIME_CONSTANT_S = 0.07;
/* The table's surface, where the pointer's anchor for a close look lies. */
const ZOOM_ANCHOR_HEIGHT = 0.132;

type CameraTransition = {
  commandKey: string;
  signature: string;
  startedAt: number;
  fromPosition: Vector3;
  fromTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
};

export function CameraRelativeFog() {
  const { camera, scene } = useThree();

  useFrame(() => {
    if (!(scene.fog instanceof Fog)) {
      return;
    }
    const range = cameraFogRange([camera.position.x, camera.position.y, camera.position.z]);
    scene.fog.near = range.near;
    scene.fog.far = range.far;
  });

  return null;
}

type CameraDestination = Pick<CameraTransition, 'commandKey' | 'signature' | 'toPosition' | 'toTarget'>;
type CameraPlayback = {
  appliedCommand: string | null;
  appliedCommandKey: string | null;
  transition: CameraTransition | null;
  /* A close look the camera glides toward, wheel turn by wheel turn, instead of a timed move. */
  glide: CameraDestination | null;
};
type SeatedOrbitControls = ComponentRef<typeof OrbitControls>;

function cameraDestinationFor(
  command: CameraViewCommand,
  aspectRatio: number,
  mapFramingPoints: readonly Vector3Tuple[],
  mapTopLimit: number,
  tilt: number,
  zoom: CameraZoom
): CameraDestination {
  const pose = zoomedCameraPose(cameraPoseFor(command.view, aspectRatio, mapFramingPoints, mapTopLimit, tilt), zoom);
  return {
    commandKey: `${command.view}:${command.revision}`,
    signature: [
      command.view,
      command.revision,
      tilt.toFixed(4),
      zoom.scale.toFixed(4),
      pose.position[0].toFixed(3),
      pose.position[1].toFixed(3),
      pose.position[2].toFixed(3),
      pose.target[0].toFixed(3),
      pose.target[2].toFixed(3),
    ].join(':'),
    toPosition: new Vector3(...pose.position),
    toTarget: new Vector3(...pose.target),
  };
}

function settleCameraDestination(
  camera: Camera,
  controls: SeatedOrbitControls,
  playback: CameraPlayback,
  destination: CameraDestination
) {
  camera.position.copy(destination.toPosition);
  controls.target.copy(destination.toTarget);
  controls.update();
  controls.saveState();
  playback.appliedCommand = destination.signature;
  playback.appliedCommandKey = destination.commandKey;
  playback.transition = null;
  playback.glide = null;
}

function advanceCameraGlide(
  camera: Camera,
  controls: SeatedOrbitControls | null,
  playback: CameraPlayback,
  delta: number,
  invalidate: () => void
) {
  const glide = playback.glide;
  if (!controls || !glide) {
    return;
  }
  const share = 1 - Math.exp(-Math.min(delta, 0.1) / CAMERA_GLIDE_TIME_CONSTANT_S);
  camera.position.lerp(glide.toPosition, share);
  controls.target.lerp(glide.toTarget, share);
  controls.update();
  const arrived =
    camera.position.distanceToSquared(glide.toPosition) <= CAMERA_POSE_EPSILON_SQUARED &&
    controls.target.distanceToSquared(glide.toTarget) <= CAMERA_POSE_EPSILON_SQUARED;
  if (arrived) {
    settleCameraDestination(camera, controls, playback, glide);
    return;
  }
  invalidate();
}

function advanceCameraTransition(
  camera: Camera,
  controls: SeatedOrbitControls | null,
  playback: CameraPlayback,
  invalidate: () => void
) {
  const activeTransition = playback.transition;
  if (!controls || !activeTransition) {
    return;
  }
  const progress = cameraViewTransitionProgress(performance.now() - activeTransition.startedAt);
  camera.position.lerpVectors(activeTransition.fromPosition, activeTransition.toPosition, progress);
  controls.target.lerpVectors(activeTransition.fromTarget, activeTransition.toTarget, progress);
  controls.update();
  if (progress >= 1) {
    settleCameraDestination(camera, controls, playback, activeTransition);
    return;
  }
  invalidate();
}

function applyCameraDestination(
  camera: Camera,
  controls: SeatedOrbitControls,
  playback: CameraPlayback,
  destination: CameraDestination,
  glide: boolean
): boolean {
  if (playback.appliedCommand === destination.signature) {
    return false;
  }
  if (glide && !playback.transition && playback.appliedCommandKey === destination.commandKey) {
    /* A wheel turn toward or away from the board glides there, so a mouse's notches read as one smooth move. */
    playback.glide = destination;
    playback.appliedCommand = destination.signature;
    return true;
  }
  playback.glide = null;
  const atDestination =
    camera.position.distanceToSquared(destination.toPosition) <= CAMERA_POSE_EPSILON_SQUARED &&
    controls.target.distanceToSquared(destination.toTarget) <= CAMERA_POSE_EPSILON_SQUARED;
  const inFlight = playback.transition;
  if (inFlight && inFlight.commandKey === destination.commandKey && !atDestination) {
    /* A tilt or resize while the camera is still moving to this view retargets the move instead of cutting it short. */
    playback.transition = { ...inFlight, ...destination };
    return true;
  }
  const resizedCurrentView = playback.appliedCommandKey === destination.commandKey;
  const snapToDestination = playback.appliedCommand === null || atDestination || resizedCurrentView;
  if (snapToDestination) {
    settleCameraDestination(camera, controls, playback, destination);
    return true;
  }
  playback.transition = {
    ...destination,
    startedAt: performance.now(),
    fromPosition: camera.position.clone(),
    fromTarget: controls.target.clone(),
  };
  playback.appliedCommandKey = destination.commandKey;
  return true;
}

type WheelView = Readonly<{ tilt: number; zoom: CameraZoom; zoomRevision: number }>;

/** Where a client point lies on the canvas, as normalised device coordinates and the canvas's aspect ratio. */
function canvasPoint(surface: HTMLElement, clientX: number, clientY: number) {
  const bounds = surface.getBoundingClientRect();
  return {
    ndcX: ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
    ndcY: 1 - ((clientY - bounds.top) / Math.max(1, bounds.height)) * 2,
    aspectRatio: bounds.width / Math.max(1, bounds.height),
  };
}

const NO_PAN_DIRECTION: readonly [number, number] = [0, 0];

type PoseAt = { current: ((tilt: number) => CameraPose) | null };

/*
 * A close look at the board, steered by the wheel while the camera is free: scrolling down moves in toward the point under the pointer,
 * turning toward top-down as it goes, and scrolling up backs out to the view's own distance and angle.
 * While a close look is open, the pan keys slide it, during a carry too, and a trial switch lets dragging empty board slide it.
 * Two fingers over the board still steer the tilt at the view's own distance. `poseAt` is the view's pose at a tilt.
 */
function useCloseLook(enabled: boolean, viewKey: string, poseAt: PoseAt): WheelView {
  const [view, setView] = useState<WheelView>({ tilt: 0, zoom: NO_CAMERA_ZOOM, zoomRevision: 0 });
  /* Only the board itself listens, so a scrollable panel or label over the table keeps its own wheel. */
  const surface = useThree((state) => state.renderer.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const pointerSession = usePointerSession();
  const keyboard = useContext(TableKeyboardContext);

  /* A new view, chosen or the phase's, starts from that view's own distance. */
  useLayoutEffect(() => {
    setView((current) => (current.zoom === NO_CAMERA_ZOOM ? current : { ...current, zoom: NO_CAMERA_ZOOM }));
  }, [viewKey]);

  /*
   * Two fingers listen even while a press holds the table: the first finger usually lands on a piece,
   * and the second one cancels that press, which frees the camera again.
   */
  useEffect(
    () =>
      watchTwoFingerTilt(surface, window, {
        onStart: () => pointerSession.cancel(),
        onTilt: (deltaY) =>
          setView((current) =>
            current.zoom.scale < 1 ? current : { ...current, tilt: cameraTiltAfterWheel(current.tilt, deltaY) }
          ),
      }),
    [pointerSession, surface]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      /* Ctrl with the wheel is the browser's zoom and a trackpad's pinch; that stays theirs. */
      if (event.ctrlKey || event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const spot = { ...canvasPoint(surface, event.clientX, event.clientY), height: ZOOM_ANCHOR_HEIGHT };
      setView((current) => {
        const at = poseAt.current;
        if (!at) {
          return current;
        }
        const zoom = cameraZoomAfterWheelAt(current.zoom, current.tilt, at, spot, event.deltaY, event.deltaMode);
        return { ...current, zoom, zoomRevision: current.zoomRevision + 1 };
      });
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [enabled, poseAt, surface]);

  const zoomedIn = view.zoom.scale < 1;
  /* The look as last drawn, for a grab that starts between renders. */
  const shownView = useRef(view);
  useLayoutEffect(() => {
    shownView.current = view;
  });

  /* The pan keys answer only while a close look is open; otherwise their letters stay free. */
  useEffect(() => {
    if (!keyboard) {
      return;
    }
    keyboard.setPanAvailable(zoomedIn);
    const stopListening = keyboard.onPanChange(invalidate);
    return () => {
      stopListening();
      keyboard.setPanAvailable(false);
    };
  }, [invalidate, keyboard, zoomedIn]);

  /* The pan keys' slide, kept outside React: it changes every frame while it moves. */
  const panMotion = useRef<CameraPanMotion>(CAMERA_PAN_AT_REST);
  useFrame((_, delta) => {
    const direction = (zoomedIn && keyboard?.panDirection()) || NO_PAN_DIRECTION;
    const motion = cameraPanMotionAfter(panMotion.current, view.zoom, direction, delta);
    panMotion.current = motion;
    if (motion === CAMERA_PAN_AT_REST || !zoomedIn) {
      return;
    }
    setView((current) => {
      const at = poseAt.current;
      if (!at) {
        return current;
      }
      const base = at(cameraTiltForZoom(current.tilt, current.zoom));
      return { ...current, zoom: cameraZoomAfterPanMotion(current.zoom, base, motion.velocity, delta) };
    });
    invalidate();
  });

  /* A trial: dragging empty board while zoomed in slides the close look, keeping the grabbed spot under the pointer. */
  const dragPan = useTableDragPan();
  const readTable = useTabletopReader();
  useEffect(() => {
    if (!enabled || !dragPan || !zoomedIn) {
      return;
    }
    let grab: { pointerId: number; point: Vector3Tuple } | null = null;
    const pointUnder = (event: PointerEvent, look: WheelView) => {
      const at = poseAt.current;
      if (!at) {
        return null;
      }
      const { ndcX, ndcY, aspectRatio } = canvasPoint(surface, event.clientX, event.clientY);
      const pose = zoomedCameraPose(at(cameraTiltForZoom(look.tilt, look.zoom)), look.zoom);
      return tablePointUnder(pose, aspectRatio, ndcX, ndcY, ZOOM_ANCHOR_HEIGHT);
    };
    const onDown = (event: PointerEvent) => {
      const table = readTable();
      if (event.button !== 0 || table.hoveredPieceId || table.state.draftMove) {
        return;
      }
      const point = pointUnder(event, shownView.current);
      if (point) {
        grab = { pointerId: event.pointerId, point };
        surface.style.cursor = 'grabbing';
      }
    };
    const onMove = (event: PointerEvent) => {
      if (!grab || event.pointerId !== grab.pointerId) {
        return;
      }
      const from = grab.point;
      setView((current) => {
        const at = poseAt.current;
        const to = pointUnder(event, current);
        if (!at || !to) {
          return current;
        }
        const base = at(cameraTiltForZoom(current.tilt, current.zoom));
        return { ...current, zoom: cameraZoomAfterPan(current.zoom, base, from, to) };
      });
    };
    const onUp = (event: PointerEvent) => {
      if (grab && event.pointerId === grab.pointerId) {
        grab = null;
        surface.style.cursor = '';
      }
    };
    surface.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      surface.style.cursor = '';
    };
  }, [dragPan, enabled, poseAt, readTable, surface, zoomedIn]);

  return view;
}

/*
 * The seated header's height, kept current as it grows or shrinks (a status row appearing, a phase's copy wrapping),
 * so the map view reframes below it without waiting for a resize or a view command.
 */
function useSeatedHeaderHeight(canvas: HTMLCanvasElement): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const header = canvas.closest('.dune-play-shell')?.querySelector<HTMLElement>('.seated-header');
    if (!header) {
      setHeight(0);
      return;
    }
    const measure = () => setHeight(header.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [canvas]);

  return height;
}

type SeatedCameraProps = {
  command: CameraViewCommand;
  enabled: boolean;
  mapFramingPoints: readonly Vector3Tuple[];
};

function useSeatedCameraTransition({ command, enabled, mapFramingPoints }: SeatedCameraProps) {
  const controlsRef = useRef<SeatedOrbitControls>(null);
  const playback = useRef<CameraPlayback>({
    appliedCommand: null,
    appliedCommandKey: null,
    transition: null,
    glide: null,
  });
  const { camera, invalidate, renderer, size } = useThree();
  const poseAt = useRef<((tilt: number) => CameraPose) | null>(null);
  const pointerSession = usePointerSession();
  const { tilt: playerTilt, zoom, zoomRevision } = useCloseLook(enabled, `${command.view}:${command.revision}`, poseAt);
  const tilt = cameraTiltForZoom(playerTilt, zoom);
  const aspectRatio = size.width / Math.max(1, size.height);
  const glidingRevision = useRef(zoomRevision);

  useFrame((_, delta) => {
    advanceCameraTransition(camera, controlsRef.current, playback.current, invalidate);
    advanceCameraGlide(camera, controlsRef.current, playback.current, delta, invalidate);
  });

  const headerHeight = useSeatedHeaderHeight(renderer.domElement);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const mapTopLimit = mapViewTopLimitForViewport(size.height, headerHeight);
    poseAt.current = (atTilt) => cameraPoseFor(command.view, aspectRatio, mapFramingPoints, mapTopLimit, atTilt);
    const destination = cameraDestinationFor(
      { view: command.view, revision: command.revision },
      aspectRatio,
      mapFramingPoints,
      mapTopLimit,
      tilt,
      zoom
    );
    const glide = glidingRevision.current !== zoomRevision;
    glidingRevision.current = zoomRevision;
    /* While a piece is carried the view holds, except that the pan keys may slide a close look of this same view. */
    const sameView = destination.commandKey === playback.current.appliedCommandKey;
    if (!enabled && !sameView) {
      playback.current.transition = null;
      return;
    }
    if (!controls) {
      return;
    }
    const changed = applyCameraDestination(camera, controls, playback.current, destination, glide && enabled);
    if (changed) {
      camera.updateMatrixWorld();
      /* A carried piece stays under the still pointer as the board slides beneath it. */
      pointerSession.refreshCarry();
      invalidate();
    }
  }, [
    aspectRatio,
    camera,
    command.revision,
    command.view,
    enabled,
    headerHeight,
    invalidate,
    mapFramingPoints,
    pointerSession,
    size.height,
    tilt,
    zoom,
    zoomRevision,
  ]);

  return controlsRef;
}

export function CameraControls(props: SeatedCameraProps) {
  const controlsRef = useSeatedCameraTransition(props);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={false}
      enableDamping={false}
      enablePan={false}
      enableRotate={false}
      enableZoom={false}
      minDistance={2}
      maxDistance={96}
      minPolarAngle={CAMERA_TOP_DOWN_POLAR_ANGLE}
      maxPolarAngle={1.08}
      minAzimuthAngle={-0.72}
      maxAzimuthAngle={0.72}
    />
  );
}
