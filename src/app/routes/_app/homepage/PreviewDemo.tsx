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
import type { Camera, Object3D } from 'three';
import { Group, Vector3 } from 'three';

import { useMotionAllowed } from '@app/styles/motion';
import { TableHand } from '@app/widgets/tabletop/ScenePresence';
import { SoftShadow } from '@app/widgets/tabletop/SoftShadow';
import { useTabletopReader } from '@app/widgets/tabletop/TabletopContext';
import type { TabletopContextValue } from '@app/widgets/tabletop/TabletopContext';
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

type DemoTable = Pick<
  TabletopContextValue,
  'renderedPieces' | 'state' | 'selectedPiece' | 'reservedPieceIds' | 'remoteCarriedIds'
>;

function availableReserve(piece: TablePiece, table: DemoTable) {
  if (!isTroopStack(piece) || !piece.id.startsWith('reserve-')) {
    return false;
  }
  const hasStock = piece.items.length > 3 && !piece.locked;
  const onBoard = Math.hypot(piece.position[0], piece.position[2]) <= BOARD_RIM_RADIUS;
  if (!hasStock || onBoard) {
    return false;
  }
  return !table.reservedPieceIds.has(piece.id) && !table.remoteCarriedIds.has(piece.id);
}

function visibleReserve(piece: TablePiece, camera: Camera, canvas: HTMLCanvasElement) {
  const bounds = canvas.getBoundingClientRect();
  const point = new Vector3(...piece.position).project(camera);
  const x = bounds.left + ((point.x + 1) * bounds.width) / 2;
  const y = bounds.top + ((1 - point.y) * bounds.height) / 2;
  const horizontal = x > 45 && x < innerWidth - 100;
  const vertical = y > 100 && y < innerHeight * 0.6;
  if (!horizontal || !vertical) {
    return false;
  }
  return document.elementFromPoint(x, y) === canvas;
}

function reserveVisual(scene: Object3D, id: string) {
  let visual: Group | undefined;
  scene.traverse((object) => {
    if (object.userData.duneTablePiece?.id === id) {
      object.traverse((child) => {
        if (child.userData.dunePreviewPiece && child instanceof Group) {
          visual = child;
        }
      });
    }
  });
  return visual;
}

function createVisit(
  table: DemoTable,
  camera: Camera,
  canvas: HTMLCanvasElement,
  scene: Object3D
): Demonstration | null {
  if (document.hidden) {
    return null;
  }
  if (table.state.draftMove || table.selectedPiece) {
    return null;
  }
  const eligible = table.renderedPieces.filter(
    (piece) => availableReserve(piece, table) && visibleReserve(piece, camera, canvas)
  );
  const choice = crypto.getRandomValues(new Uint32Array(1))[0];
  const piece = eligible[choice % eligible.length];
  if (!piece) {
    return null;
  }
  const visual = reserveVisual(scene, piece.id);
  if (!visual) {
    return null;
  }
  return {
    source: piece,
    visual,
    origin: new Vector3(...piece.position),
    target: new Vector3(
      (CARTHAG.x + CARTHAG.width / 2 - 0.5) * BOARD_RADIUS * 2,
      CARRIED_BASE_Y + 0.3,
      (CARTHAG.y + CARTHAG.height / 2 - 0.5) * BOARD_RADIUS * 2
    ),
    started: performance.now(),
  };
}

function sourcePoseUnchanged(current: Demonstration, piece: TablePiece) {
  const distance =
    (piece.position[0] - current.origin.x) ** 2 +
    (piece.position[1] - current.origin.y) ** 2 +
    (piece.position[2] - current.origin.z) ** 2;
  return (
    piece.orientation === current.source.orientation &&
    piece.flipRevision === current.source.flipRevision &&
    distance <= 0.0001
  );
}

function sourceItemsUnchanged(source: TablePiece, piece: TablePiece) {
  return (
    piece.items.length === source.items.length &&
    piece.items.every((item, index) => item.id === source.items[index]?.id)
  );
}

function visitUnchanged(current: Demonstration, table: DemoTable) {
  const piece = table.renderedPieces.find((item) => item.id === current.source.id);
  if (!piece) {
    return false;
  }
  if (table.state.draftMove || table.selectedPiece) {
    return false;
  }
  if (table.remoteCarriedIds.has(piece.id) || table.reservedPieceIds.has(piece.id)) {
    return false;
  }
  return sourcePoseUnchanged(current, piece) && sourceItemsUnchanged(current.source, piece);
}

function animateVisit(current: Demonstration, models: Group, carried: Group, shadow: Group, hand: Group, t: number) {
  const approach = smooth((t - 0.15) / 0.85);
  const lift = smooth((t - 1.2) / 0.5) * (1 - smooth((t - 7.8) / 0.5));
  const outbound = smooth((t - 1.7) / 2.1);
  const returning = smooth((t - 5.7) / 2.1);
  const progress = outbound * (1 - returning);
  const holding = t >= 1.2 && t < 8.3;
  models.visible = holding;
  current.visual.visible = !holding;
  carried.position.copy(current.origin).lerp(current.target, progress);
  carried.position.y =
    current.origin.y + stackTopHeight(current.source) * 0.4 + lift * (current.target.y - current.origin.y);
  carried.position.x += Math.sin(progress * Math.PI) * (returning > 0 ? -0.2 : 0.35);
  if (t > 3.8 && t < 5.7) {
    carried.position.y += Math.sin((t - 3.8) * 3) * 0.012;
  }
  shadow.position.set(
    carried.position.x,
    contactShadowHeightAt(carried.position.toArray(), current.source),
    carried.position.z
  );
  hand.position.copy(holding ? carried.position : current.origin);
  hand.position.y += holding ? 0.16 : stackTopHeight(current.source) + 0.06;
  hand.position.x -= (1 - approach) * 0.8;
  hand.position.z += (1 - approach) * 0.4;
  const leave = smooth((t - 8.3) / 0.9);
  hand.position.x += leave * 0.5;
  hand.position.z += leave * 0.35;
}

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
      const demonstration = createVisit(read(), camera, renderer.domElement, scene);
      if (!demonstration) {
        timer = setTimeout(start, 1500);
        return;
      }
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
    if (!current) {
      return;
    }
    if (!hand.current || !carried.current) {
      return;
    }
    if (!models.current || !shadow.current) {
      return;
    }
    const t = (performance.now() - current.started) / 1000;
    if (t >= 9.2 || !visitUnchanged(current, read())) {
      clearVisit();
      return;
    }
    animateVisit(current, models.current, carried.current, shadow.current, hand.current, t);
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
