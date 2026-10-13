/* @jsxImportSource ../../../widgets/tabletop/three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { TablePiece } from '@shared/play/model';
import {
  BOARD_RADIUS,
  BOARD_RIM_RADIUS,
  CARRIED_BASE_Y,
  contactShadowHeightAt,
  stackTopHeight,
  TROOP_TOP_RADIUS,
} from '@shared/play/tableGeometry';
import { isTroopStack } from '@shared/play/troop';
import board from '@shared/rulebooks/boards/arrakis.json';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Group, Vector3 } from 'three';

import { useMotionAllowed } from '@app/styles/motion';
import { TableHand } from '@app/widgets/tabletop/ScenePresence';
import { SoftShadow } from '@app/widgets/tabletop/SoftShadow';
import { useTabletopReader } from '@app/widgets/tabletop/TabletopContext';
import { TabletopPieceLayers } from '@app/widgets/tabletop/TabletopScene';

const AVATAR = '/homepage-table/bob.jpg';
const CARTHAG = board.geometry.parts.find((part) => part.key === 'carthag')!;
const smooth = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

type Demonstration = {
  source: TablePiece;
  visual: Group;
  origin: Vector3;
  target: Vector3;
  started: number;
};

/* Bob rehearses with local copies; the session's pieces and the shared table never change. */
export default function PreviewDemo() {
  const read = useTabletopReader();
  const motion = useMotionAllowed();
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const renderer = useThree((state) => state.renderer);
  const invalidate = useThree((state) => state.invalidate);
  const hand = useRef<Group>(null);
  const models = useRef<Group>(null);
  const carried = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const demo = useRef<Demonstration | null>(null);
  const stopped = useRef(false);
  const [visit, setVisit] = useReducer((_: Demonstration | null, next: Demonstration | null) => next, null);

  const clearVisit = useCallback(() => {
    if (demo.current) {
      demo.current.visual.visible = true;
    }
    if (models.current) {
      models.current.visible = false;
    }
    demo.current = null;
    setVisit(null);
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    if (!motion) {
      return;
    }
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      stopped.current = true;
      clearTimeout(timer);
      clearVisit();
    };
    const start = () => {
      if (stopped.current) {
        return;
      }
      const table = read();
      if (document.hidden || table.state.draftMove || table.selectedPiece) {
        timer = setTimeout(start, 1500);
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      const eligible = table.renderedPieces.filter((piece) => {
        if (
          !isTroopStack(piece) ||
          !piece.id.startsWith('reserve-') ||
          piece.items.length <= 3 ||
          piece.locked ||
          Math.hypot(piece.position[0], piece.position[2]) <= BOARD_RIM_RADIUS ||
          table.reservedPieceIds.has(piece.id) ||
          table.remoteCarriedIds.has(piece.id)
        ) {
          return false;
        }
        const point = new Vector3(...piece.position).project(camera);
        const x = bounds.left + ((point.x + 1) * bounds.width) / 2;
        const y = bounds.top + ((1 - point.y) * bounds.height) / 2;
        return (
          x > 45 &&
          x < innerWidth - 100 &&
          y > 100 &&
          y < innerHeight * 0.6 &&
          document.elementFromPoint(x, y) === renderer.domElement
        );
      });
      const piece = eligible[Math.floor(Math.random() * eligible.length)];
      let visual: Group | undefined;
      if (piece) {
        scene.traverse((object) => {
          if (object.userData.duneTablePiece?.id === piece.id) {
            object.traverse((child) => {
              if (child.userData.dunePreviewPiece && child instanceof Group) {
                visual = child;
              }
            });
          }
        });
      }
      if (!piece || !visual) {
        timer = setTimeout(start, 1500);
        return;
      }
      const target = new Vector3(
        (CARTHAG.x + CARTHAG.width / 2 - 0.5) * BOARD_RADIUS * 2,
        CARRIED_BASE_Y + 0.3,
        (CARTHAG.y + CARTHAG.height / 2 - 0.5) * BOARD_RADIUS * 2
      );
      const demonstration = {
        source: piece,
        visual,
        origin: new Vector3(...piece.position),
        target,
        started: performance.now(),
      };
      demo.current = demonstration;
      setVisit(demonstration);
      invalidate();
      timer = setTimeout(start, 15_000);
    };
    timer = setTimeout(start, 1500);
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', stop, { once: true, capture: true });
    const visibility = () => {
      if (document.hidden) {
        clearVisit();
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearTimeout(timer);
      clearVisit();
      canvas.removeEventListener('pointerdown', stop, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [camera, clearVisit, invalidate, motion, read, renderer, scene]);

  useFrame(() => {
    const current = demo.current;
    if (!current || !hand.current || !carried.current || !models.current || !shadow.current) {
      return;
    }
    const table = read();
    const piece = table.renderedPieces.find((item) => item.id === current.source.id);
    if (
      !piece ||
      table.state.draftMove ||
      table.selectedPiece ||
      table.remoteCarriedIds.has(current.source.id) ||
      table.reservedPieceIds.has(current.source.id) ||
      piece.orientation !== current.source.orientation ||
      piece.flipRevision !== current.source.flipRevision ||
      piece.items.length !== current.source.items.length ||
      piece.items.some((item, index) => item.id !== current.source.items[index]?.id) ||
      current.origin.distanceToSquared(new Vector3(...piece.position)) > 0.0001
    ) {
      clearVisit();
      return;
    }
    const t = (performance.now() - current.started) / 1000;
    if (t >= 9.2) {
      clearVisit();
      return;
    }
    const approach = smooth((t - 0.15) / 0.85);
    const lift = smooth((t - 1.2) / 0.5) * (1 - smooth((t - 7.8) / 0.5));
    const outbound = smooth((t - 1.7) / 2.1);
    const returning = smooth((t - 5.7) / 2.1);
    const progress = outbound * (1 - returning);
    const holding = t >= 1.2 && t < 8.3;
    models.current.visible = holding;
    current.visual.visible = !holding;
    carried.current.position.copy(current.origin).lerp(current.target, progress);
    carried.current.position.y =
      current.origin.y + stackTopHeight(current.source) * 0.4 + lift * (current.target.y - current.origin.y);
    carried.current.position.x += Math.sin(progress * Math.PI) * (returning > 0 ? -0.2 : 0.35);
    if (t > 3.8 && t < 5.7) {
      carried.current.position.y += Math.sin((t - 3.8) * 3) * 0.012;
    }
    shadow.current.position.set(
      carried.current.position.x,
      contactShadowHeightAt(carried.current.position.toArray(), current.source),
      carried.current.position.z
    );
    hand.current.position.copy(holding ? carried.current.position : current.origin);
    hand.current.position.y += holding ? 0.16 : stackTopHeight(current.source) + 0.06;
    hand.current.position.x -= (1 - approach) * 0.8;
    hand.current.position.z += (1 - approach) * 0.4;
    const leave = smooth((t - 8.3) / 0.9);
    hand.current.position.x += leave * 0.5;
    hand.current.position.z += leave * 0.35;
    invalidate();
  });

  if (!visit) {
    return null;
  }
  const remainder = { ...visit.source, items: visit.source.items.slice(0, -3) };
  const troops = { ...visit.source, items: visit.source.items.slice(-3) };
  return (
    <>
      <group ref={models} visible={false}>
        <group position={visit.source.position} rotation={[0, visit.source.orientation, 0]}>
          <TabletopPieceLayers piece={remainder} />
        </group>
        <group ref={carried} rotation={[0, visit.source.orientation, 0]}>
          <TabletopPieceLayers piece={troops} />
        </group>
        <group ref={shadow}>
          <SoftShadow radius={TROOP_TOP_RADIUS} spread={0.18} y={0} opacity={0.3} />
        </group>
      </group>
      <group ref={hand}>
        <TableHand position={[0, 0, 0]} color="#bbcf87" displayName="Bob" avatarUrl={AVATAR} demo />
      </group>
    </>
  );
}
