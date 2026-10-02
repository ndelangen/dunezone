import { OrbitControls } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Fog, Vector3 } from 'three';
import type { Camera } from 'three';

import {
  CAMERA_TOP_DOWN_POLAR_ANGLE,
  cameraFogRange,
  cameraPoseFor,
  cameraTiltAfterWheel,
  cameraViewTransitionProgress,
  mapViewTopLimitForViewport,
} from './playView';
import type { CameraViewCommand } from './playView';

const CAMERA_POSE_EPSILON_SQUARED = 0.000001;

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
};
type SeatedOrbitControls = ComponentRef<typeof OrbitControls>;

function cameraDestinationFor(
  command: CameraViewCommand,
  aspectRatio: number,
  mapFramingPoints: readonly Vector3Tuple[],
  mapTopLimit: number,
  tilt: number
): CameraDestination {
  const pose = cameraPoseFor(command.view, aspectRatio, mapFramingPoints, mapTopLimit, tilt);
  return {
    commandKey: `${command.view}:${command.revision}`,
    signature: [
      command.view,
      command.revision,
      tilt.toFixed(4),
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
  destination: CameraDestination
): boolean {
  if (playback.appliedCommand === destination.signature) {
    return false;
  }
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

/** The player's tilt, from the approved angle toward top-down, steered by the wheel over the board while the camera is free. */
function useWheelTilt(enabled: boolean): number {
  const [tilt, setTilt] = useState(0);
  /* Only the board itself listens, so a scrollable panel or label over the table keeps its own wheel. */
  const surface = useThree((state) => state.renderer.domElement);

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
      setTilt((current) => cameraTiltAfterWheel(current, event.deltaY, event.deltaMode));
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [enabled, surface]);

  return tilt;
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
  const playback = useRef<CameraPlayback>({ appliedCommand: null, appliedCommandKey: null, transition: null });
  const { camera, invalidate, renderer, size } = useThree();
  const tilt = useWheelTilt(enabled);
  const aspectRatio = size.width / Math.max(1, size.height);

  useFrame(() => advanceCameraTransition(camera, controlsRef.current, playback.current, invalidate));

  const headerHeight = useSeatedHeaderHeight(renderer.domElement);

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const mapTopLimit = mapViewTopLimitForViewport(size.height, headerHeight);
    const destination = cameraDestinationFor(
      { view: command.view, revision: command.revision },
      aspectRatio,
      mapFramingPoints,
      mapTopLimit,
      tilt
    );
    if (!enabled) {
      playback.current.transition = null;
      return;
    }
    if (!controls) {
      return;
    }
    const changed = applyCameraDestination(camera, controls, playback.current, destination);
    if (changed) {
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
    size.height,
    tilt,
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
      minDistance={8.5}
      maxDistance={96}
      minPolarAngle={CAMERA_TOP_DOWN_POLAR_ANGLE}
      maxPolarAngle={1.08}
      minAzimuthAngle={-0.72}
      maxAzimuthAngle={0.72}
    />
  );
}
