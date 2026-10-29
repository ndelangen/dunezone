/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { gameAssetColors } from '@shared/play/assetColors';
import type { CardDraw } from '@shared/play/cardDraw';
import { reviewRunning } from '@shared/play/review';
import { CARD_CORNER_RADIUS, CARD_DEPTH, CARD_LAYER_HEIGHT, CARD_WIDTH } from '@shared/play/tableGeometry';
import { playUiColors } from '@shared/uiPalette';
import { useEffect, useRef, useState } from 'react';
import { Color, DoubleSide } from 'three';
import type { Group, Mesh, MeshBasicMaterial } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { cardDrawDuration, cardDrawPose, cardDrawPulse, DRAW_STAGGER_MS } from './cardDrawMotion';
import { tableCardFaceKey } from './cardFaceTexture';
import { ignoreRaycast } from './ignoreRaycast';
import styles from './SceneCardDraws.module.css';
import { useSharedMeshes } from './sharedMeshes';
import { useTabletopActions, useTabletopSelector } from './TabletopContext';
import { usePublishedFace } from './usePublishedFace';

const MAX_DRAWS = 16;
type ShownDraw = CardDraw & { started: number };

/** The server's accepted draws, independent of deck meshes so the final card can still leave an empty deck. */
export function SceneCardDraws() {
  const motion = useMotionAllowed();
  const live = useTabletopSelector(
    (table) => !table.reconnecting && !table.playback && !table.historyPending && !reviewRunning(table.snapshot.review)
  );
  return motion && live ? <CurrentDraws /> : null;
}

function CurrentDraws() {
  const { subscribeCardDraws } = useTabletopActions();
  const [draws, setDraws] = useState<ShownDraw[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = subscribeCardDraws((draw) => {
      if (document.hidden) {
        return;
      }
      const started = performance.now();
      setDraws((shown) => [...shown.slice(1 - MAX_DRAWS), { ...draw, started }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setDraws((shown) => shown.filter((entry) => entry.epoch !== draw.epoch || entry.revision !== draw.revision));
      }, cardDrawDuration(draw.count));
      timers.add(timer);
    });
    const hide = () => {
      if (document.hidden) {
        setDraws([]);
        timers.forEach(clearTimeout);
        timers.clear();
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      stop();
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [subscribeCardDraws]);
  return draws.map((draw) => <DrawFlight key={`${draw.epoch}:${draw.revision}`} draw={draw} />);
}

function useDrawArrival(draw: ShownDraw) {
  const invalidate = useThree((state) => state.invalidate);
  const ring = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    const elapsed = performance.now() - draw.started;
    const pulse = cardDrawPulse(elapsed, draw.count);
    ring.current?.scale.setScalar(pulse.scale);
    if (material.current) {
      material.current.opacity = pulse.opacity;
    }
    if (label.current) {
      label.current.style.opacity = String(pulse.opacity);
    }
    if (elapsed < cardDrawDuration(draw.count)) {
      invalidate();
    }
  });
  return { ring, material, label };
}

function arrivalColor(value: string) {
  const color = new Color(value);
  /* Dark factions still need a visible arrival against the table's dark wood. */
  if (color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25) {
    color.lerp(new Color(gameAssetColors.pieceAccent), 0.6);
  }
  return color;
}

function DrawFlight({ draw }: { draw: ShownDraw }) {
  const meshes = useSharedMeshes();
  const { ring, material, label } = useDrawArrival(draw);
  const faction = useTabletopSelector(
    (table) => table.snapshot.roster?.seats.find((seat) => seat.faction?.id === draw.recipient)?.faction?.name
  );
  return (
    <group>
      <Html
        center
        position={[draw.to[0], draw.to[1] + 0.8, draw.to[2]]}
        zIndexRange={[5, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span ref={label} className={styles.receipt} data-card-draw={draw.recipient} aria-hidden="true">
          {faction} +{draw.count}
        </span>
      </Html>
      {Array.from({ length: draw.count }, (_, index) => (
        <FlyingBack key={index} draw={draw} index={index} />
      ))}
      <mesh
        ref={ring}
        position={[draw.to[0], draw.to[1] + 0.025, draw.to[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        geometry={meshes.ring(0.43, 0.48, 64)}
        raycast={ignoreRaycast}
        renderOrder={10}
      >
        <meshBasicMaterial
          ref={material}
          color={arrivalColor(draw.color)}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function FlyingBack({ draw, index }: { draw: ShownDraw; index: number }) {
  const meshes = useSharedMeshes();
  const texture = usePublishedFace(draw.back ? tableCardFaceKey(draw.back) : undefined);
  const group = useRef<Group>(null);
  const face = useRef<MeshBasicMaterial>(null);
  const edge = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const pose = cardDrawPose(draw, performance.now() - draw.started - index * DRAW_STAGGER_MS);
    if (group.current) {
      group.current.position.set(pose.x, pose.y, pose.z);
      group.current.rotation.y = pose.turn;
      group.current.scale.setScalar(pose.scale);
      group.current.visible = pose.opacity > 0;
    }
    if (face.current) {
      face.current.opacity = pose.opacity;
    }
    if (edge.current) {
      edge.current.opacity = pose.opacity;
    }
  });
  return (
    <group ref={group} visible={false}>
      <mesh
        geometry={meshes.roundedSlab(CARD_WIDTH, CARD_LAYER_HEIGHT, CARD_DEPTH, CARD_CORNER_RADIUS)}
        raycast={ignoreRaycast}
        renderOrder={3}
      >
        <meshBasicMaterial ref={edge} color={gameAssetColors.pieceAccent} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, CARD_LAYER_HEIGHT / 2 + 0.002, 0]}
        geometry={meshes.roundedPlane(CARD_WIDTH, CARD_DEPTH, CARD_CORNER_RADIUS)}
        raycast={ignoreRaycast}
        renderOrder={4}
      >
        <meshBasicMaterial
          ref={face}
          map={texture ?? null}
          color={texture ? undefined : playUiColors.faceDownCard}
          side={DoubleSide}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
