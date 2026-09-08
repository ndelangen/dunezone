import { OrbitControls } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { Fog, Vector3 } from 'three';
import type { Camera } from 'three';

import type { Vector3Tuple } from './model';
import { cameraFogRange, cameraPoseFor, cameraViewTransitionProgress, mapViewTopLimitForViewport } from './playView';
import type { CameraViewCommand } from './playView';

export type SceneMode = 'tactical' | 'seated' | 'sandbox';

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

export function CameraControls({
  mode,
  enabled,
  target,
  cameraView,
  mapFramingPoints,
  onControlSessionChange,
}: {
  mode: SceneMode;
  enabled: boolean;
  target: Vector3Tuple;
  cameraView: CameraViewCommand;
  mapFramingPoints: readonly Vector3Tuple[];
  onControlSessionChange(active: boolean): void;
}) {
  if (mode === 'tactical') {
    return (
      <OrbitControls
        makeDefault
        enabled={enabled}
        enableRotate={false}
        enablePan
        minZoom={52}
        maxZoom={95}
        target={target}
      />
    );
  }

  if (mode === 'seated') {
    return (
      <SeatedCameraControls
        enabled={enabled}
        command={cameraView}
        mapFramingPoints={mapFramingPoints}
        onControlSessionChange={onControlSessionChange}
      />
    );
  }

  return (
    <OrbitControls
      makeDefault
      enabled={enabled}
      enablePan
      minDistance={6}
      maxDistance={15}
      minPolarAngle={0.3}
      maxPolarAngle={1.34}
      target={target}
    />
  );
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
  mapTopLimit: number
): CameraDestination {
  const pose = cameraPoseFor(command.view, aspectRatio, mapFramingPoints, mapTopLimit);
  return {
    commandKey: `${command.view}:${command.revision}`,
    signature: [
      command.view,
      command.revision,
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

type SeatedCameraProps = {
  command: CameraViewCommand;
  enabled: boolean;
  mapFramingPoints: readonly Vector3Tuple[];
  onControlSessionChange(active: boolean): void;
};

function useSeatedCameraTransition({ command, enabled, mapFramingPoints, onControlSessionChange }: SeatedCameraProps) {
  const controlsRef = useRef<SeatedOrbitControls>(null);
  const playback = useRef<CameraPlayback>({ appliedCommand: null, appliedCommandKey: null, transition: null });
  const { camera, invalidate, renderer, size } = useThree();
  const aspectRatio = size.width / Math.max(1, size.height);

  useFrame(() => advanceCameraTransition(camera, controlsRef.current, playback.current, invalidate));

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const headerHeight =
      renderer.domElement
        .closest('.dune-play-shell')
        ?.querySelector<HTMLElement>('.seated-header')
        ?.getBoundingClientRect().height ?? 0;
    const mapTopLimit = mapViewTopLimitForViewport(size.height, headerHeight);
    const destination = cameraDestinationFor(
      { view: command.view, revision: command.revision },
      aspectRatio,
      mapFramingPoints,
      mapTopLimit
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
    renderer,
    invalidate,
    mapFramingPoints,
    size.height,
  ]);

  useEffect(() => () => onControlSessionChange(false), [onControlSessionChange]);

  return {
    controlsRef,
    onStart: () => {
      const activeTransition = playback.current.transition;
      const controls = controlsRef.current;
      if (activeTransition && controls) {
        playback.current.appliedCommand = activeTransition.signature;
        playback.current.appliedCommandKey = activeTransition.commandKey;
        playback.current.transition = null;
      }
      onControlSessionChange(true);
    },
    onEnd: () => {
      controlsRef.current?.saveState();
      onControlSessionChange(false);
    },
  };
}

function SeatedCameraControls(props: SeatedCameraProps) {
  const { controlsRef, onStart, onEnd } = useSeatedCameraTransition(props);

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
      minPolarAngle={0.72}
      maxPolarAngle={1.08}
      minAzimuthAngle={-0.72}
      maxAzimuthAngle={0.72}
      onStart={onStart}
      onEnd={onEnd}
    />
  );
}
